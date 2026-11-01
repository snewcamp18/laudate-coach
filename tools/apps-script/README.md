# Automatic playbook updates

`Code.gs` is a Google Apps Script that keeps the app's playbook in step with the **Laudate Playbook** Google Doc.
Every hour it checks whether the doc changed. If it did, it converts the doc into the app's library and uploads it
to the coach-only team space in Firebase, and every coach's app picks it up. If a section comes out empty or much
smaller than before (usually because a heading or the `OPTION 12: Name` lines were renamed), it uploads nothing
and emails you instead.

It runs on Google's servers under your Google account, so your computer doesn't need to be on. It's free.

## Set it up (about 5 minutes, once)

1. Go to <https://script.google.com> signed in as the Firebase project's owner (`samuel.newcamp@gmail.com`) and
   click **New project**. Rename it (top left) to `Laudate playbook sync`.
2. **Code:** in `Code.gs`, select everything, delete it, and paste the contents of `Code.gs` from this folder.
3. **Permissions file:** click the gear (**Project Settings**) in the left bar, tick
   **Show "appsscript.json" manifest file in editor**, go back to the editor (`< >` in the left bar), open
   `appsscript.json`, replace everything with the contents of `appsscript.json` from this folder, and save (⌘S).
4. In the toolbar, pick **setup** from the function menu and click **Run**.
5. Google asks for permission. Click **Review permissions**, choose your account. Because this is your own script,
   Google shows **"Google hasn't verified this app"**: click **Advanced → Go to Laudate playbook sync (unsafe)**,
   then **Allow**. It asks to:
   - see your Google Drive files (to read the playbook doc),
   - view and manage your Firestore data (to upload the playbook to laudate-coach),
   - connect to external services, run while you're away, and send email as you (only to warn you).
6. The log at the bottom should end with `Uploaded playbook: {"amrap":144,...}`.

**Done when:** the app, under **More → Team sync**, says *The playbook updates automatically from the Laudate
Playbook Google Doc*. From then on, edits to the doc reach the app within an hour.

## Day to day

- **See what it did:** open the script and click **Executions** (the ☰ list icon) in the left bar.
- **Update right now** instead of waiting for the hour: pick **updatePlaybook** and click **Run**.
- **Stop it:** **Triggers** (the alarm-clock icon) → delete the `updatePlaybook` trigger.
- **If you get a "playbook not updated" email:** fix the heading named in the email back to what it was
  (AMRAP, Finishers, Unison Prayers, Breathing / Breathe Prayers, Ancillary Movements, Warmup). The next hourly
  check uploads it. Coaches keep the previous version meanwhile.
- **If the script stops with "Firestore refused the upload… PERMISSION_DENIED"**, the Google account running it
  isn't an owner of the laudate-coach Firebase project. Run it from the account that created the project.

## Keeping the converter in step

`Code.gs` does the same conversion as `../parse_playbook.py`; tested against the playbook on 2026-11-01, both
produce the same 212 elements. If you change one, change the other. To test `Code.gs` on your computer with an
exported copy of the doc (File → Download → Markdown):

```bash
node -e "const m={exports:{}};require('vm').runInNewContext(require('fs').readFileSync('tools/apps-script/Code.gs','utf8'),{module:m});console.log(m.exports.countKinds(m.exports.parsePlaybook(require('fs').readFileSync('playbook.md','utf8'))))"
```
