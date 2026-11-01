# Setting up Laudate Coach

Two one-time jobs: a Firebase project so coaches share one set of classes, members and scores, and GitHub Pages to
put the app online. Both are free. Laudate Coach works without either; each device just keeps its own data.

## 1. Firebase (team sync)

1. Go to <https://console.firebase.google.com>, sign in with your Google account, and click **Create a project**.
   Name it `laudate-coach`. You can turn Google Analytics off.
2. **Turn on sign-in.** In the left menu open **Build → Authentication → Get started**. On the **Sign-in method** tab:
   - enable **Google**, pick your email as the support email, and save;
   - enable **Email/Password** and save (for coaches who don't use a Google account).
3. **Create the database.** Open **Build → Firestore Database → Create database**. Pick the location closest to you
   (`us-east4`, Northern Virginia, is closest to Pittsburgh), choose **Start in production mode**, and create it.
   Then open the **Rules** tab, replace everything with the contents of `firestore.rules` from this folder, and
   click **Publish**.
4. **Create the coach list.** Still in Firestore Database, open the **Data** tab and click **+ Start collection**:
   - Collection ID: `team`, then **Next**.
   - Document ID: `laudate`.
   - Add a field `owners`, type **array**, with one string item: your email (all lowercase).
   - Add a field `coaches`, type **array**, and leave it empty.
   - Click **Save**.

   Owners can add and remove coaches from inside the app. To add another owner later, edit `owners` here.
5. **Register the web app.** Click the gear icon → **Project settings**. Under **Your apps**, click the **`</>`** (Web)
   button, name it `Laudate Coach`, leave Firebase Hosting unticked, and click **Register app**.
   Copy the `firebaseConfig = { … }` block it shows.
6. Open `firebase-config.js` and replace `null` with that block, so it reads
   `window.LC_FIREBASE_CONFIG = { apiKey: "…", authDomain: "…", projectId: "…", … };`
7. Once the app is online (step 3 below), go to **Authentication → Settings → Authorized domains → Add domain** and add
   your GitHub Pages address, e.g. `snewcamp18.github.io`. Google sign-in only works on domains in that list.

The values in `firebase-config.js` identify your project; they aren't secrets. What protects the data is
`firestore.rules`: only people signed in with a verified email on the `owners` or `coaches` list can read or change
anything, which matters because member records hold names, phone numbers and notes. Whenever `firestore.rules`
changes, paste the new version into **Firestore Database → Rules** and click **Publish**.

**Getting the playbook to coaches.** The Laudate Playbook is not in the published code, so it stays private to
coaches. Set up the automatic updater in `tools/apps-script/README.md` (about 5 minutes, once): it uploads the
playbook from the Google Doc into the team space and keeps it up to date within an hour of each edit. Every coach's
device downloads it when they sign in and keeps a copy for offline use. (Without the updater, an owner can upload
`library.js` by hand from a local copy of the app under **More → Team sync**.)

**Adding a coach.** Open the app, go to **More → Team sync**, sign in, and type the coach's email under **Coaches**.
They then open the app, go to **More → Team sync** and sign in with Google, or create an account with that email
and a password (they'll get a link to verify the email first).

**How sync behaves.** Each device keeps working offline and sends its changes when it's back online. If two coaches
change the same class at the same moment, the later save wins for that class, so have one coach take attendance
for a class. Deleting your sign-in (**More → Team sync → Delete my sign-in**) removes only your login; the gym's
classes and members stay for the other coaches. As the project owner you can see all the data in the Firebase
console.

**Free plan limits.** Firestore's free tier allows 1 GiB of storage, 50,000 reads and 20,000 writes per day, shared
by all coaches. A class or member is one small record, so a gym this size stays far below those limits.

## 2. App Check (blocks requests that don't come from the app)

1. In Firebase, open **Security → App Check → Apps**, click your web app and expand **Fraud Defense (formerly
   reCAPTCHA Enterprise)**. Follow its link to create a key in Google Cloud: platform **Website**, domain
   `snewcamp18.github.io`, no checkbox challenge. Copy the key's ID (the **site key**).
2. Paste the site key into the Fraud Defense box in Firebase and save.
3. Put the **site key** in `firebase-config.js`: `window.LC_APPCHECK_SITE_KEY = "…";` and publish the update.
4. Open the app on its web address and sign in once. Then in **App Check → APIs**, check that Cloud Firestore
   shows verified requests, and click **Enforce** for **Cloud Firestore** and **Authentication**.

App Check is skipped on `localhost`, so local testing keeps working.

## 3. GitHub Pages (hosting)

1. Create a new **public** repository named `laudate-coach` (the code is public; the playbook and member data are not,
   they live in Firestore behind the rules above).
2. Upload every file in this folder except `library.js` (keep the `icons` and `tools` folders). `.gitignore` already
   leaves `library.js` out when you push with git.
3. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**,
   pick `main` and `/ (root)`, and save.
4. After a minute the app is live at `https://snewcamp18.github.io/laudate-coach/`.

To publish an update, upload the changed files again. Installed copies pick up the new version the next time they
open with an internet connection.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `app.js` | The app |
| `library.js` | Playbook elements (generated by `tools/parse_playbook.py`); private, never published |
| `sync.js` | Sign-in and team sync |
| `firebase-config.js` | Your Firebase project settings (`null` = sync off) |
| `firestore.rules` | Database security rules to paste into Firebase |
| `tools/apps-script/` | Automatic playbook updates from the Google Doc |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | What lets phones and computers install it as an app |
