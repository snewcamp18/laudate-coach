# Laudate Coach

A coach's app for Laudate Fitness: plan Elevated Prayer and SoulCore classes by mixing and matching elements from the
Laudate Playbook, run the class from your phone, and track each member's attendance, AMRAP scores, lifts and goals.

Plain HTML/JS installable app (same setup as FitTrack and Sample Keys). No build step. Data lives in the device's browser
storage and, once coaches sign in, syncs through one shared Firebase team space that only coaches on the coach list
can open (Firebase Auth + Firestore, like Sample Keys). See [SETUP.md](SETUP.md) to create the Firebase project and
put the app online.

## Run it locally

```bash
python3 -m http.server 8766
```

Then open <http://localhost:8766>.

## What's in it

- **Library** — every element in the Laudate Playbook: 144 AMRAPs (with their scripture), 27 finishers, 22 unison
  prayers, 11 breathing prayers, the 7 ancillary movement groups with coaching cues, and the standard warmup.
  Coaches can edit any of them, duplicate and remix them, or build a new AMRAP from movements taken from other
  workouts ("Mix & match").
- **Classes** — a new Elevated Prayer class follows the playbook structure (warmup, intentions, unison prayer, AMRAP,
  water break and breathing prayer with scripture, ancillary movements, finisher, closing prayer). The app suggests
  elements that haven't been used in the last 8 weeks and fit the liturgical season; swap, shuffle, edit, reorder or
  add sections. SoulCore classes are laid out by decade for the day's mysteries. Copy any class as text for Google Docs.
- **Ancillary cycle** — the 10-week macrocycle from the Ancillary Mesocycles doc (5 weeks hypertrophy, 4 strength,
  1 peak/test). Set week 1 and the lift focus in **More**.
- **Run class** — big-type view for the floor with an AMRAP countdown timer.
- **Members** — attendance, AMRAP scores (rounds + reps, scaled or as written), lift weights with a progress chart and
  estimated 1RM, goals (fitness and faith) and notes. A "Check in" tag shows who hasn't been in for 3 weeks.

## Updating the library from the playbook

The team's copy updates by itself from the Google Doc once `tools/apps-script` is set up (see its README). To rebuild
the local `library.js` too:

`library.js` is generated from the Laudate Playbook Google Doc. Export the doc as Markdown, then:

```bash
python3 -I tools/parse_playbook.py playbook.md library.js
```

Coach edits are stored separately, so regenerating the library doesn't lose them. `library.js` is kept out of git and
off the public site; coaches get the playbook from the team space after an owner uploads it (see SETUP.md).

## Files

| File | What it is |
| --- | --- |
| `index.html` | Layout and styles |
| `app.js` | The app |
| `library.js` | Playbook elements (generated, private — not in git) |
| `sync.js`, `firebase-config.js`, `firestore.rules` | Coach sign-in and team sync |
| `tools/parse_playbook.py` | Builds `library.js` from the playbook |
| `tools/apps-script/` | Keeps the team's playbook updated from the Google Doc |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Lets phones install it as an app |
