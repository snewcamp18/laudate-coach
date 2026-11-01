/* Laudate Coach team sync — Firebase Auth + Cloud Firestore, free (Spark) plan.
 *
 * Every coach shares one team space. Only people whose email is on the team's coach list can read or write it
 * (see firestore.rules):
 *   team/laudate                      { owners: [emails], coaches: [emails] } — owners manage the coach list
 *   team/laudate/classes/{id}         one class plan with its attendance and scores
 *   team/laudate/members/{id}         one member
 *   team/laudate/elements/{id}        a library element a coach made
 *   team/laudate/overrides/{id}       a coach's edit to a playbook element
 *   team/laudate/settings/shared      ancillary cycle, default location and AMRAP cap
 *   team/laudate/playbook/current     the Laudate Playbook library; only owners can upload it
 * Each record is { updated, deleted, by, data }. The app keeps working from localStorage; this file watches for
 * local changes, pushes the records that changed, and applies other coaches' changes as they arrive.
 * Conflicts resolve last-writer-wins per record; deletions are kept as tombstones so other devices learn about them.
 */
(() => {
  const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const cfg = window.LC_FIREBASE_CONFIG;
  const TEAM = ['team', 'laudate'];
  const SHARED_SETTINGS = ['location', 'cycleStart', 'cycleFocus', 'cap'];

  // How each collection maps onto the local data: id -> plain record, and how to put a record back.
  const COLS = {
    classes: { all: () => byId(D.classes), put: (id, r) => upsert(D.classes, id, r), drop: id => D.classes = D.classes.filter(x => x.id !== id) },
    members: { all: () => byId(D.members), put: (id, r) => upsert(D.members, id, r), drop: id => D.members = D.members.filter(x => x.id !== id) },
    elements: { all: () => byId(D.elements), put: (id, r) => { upsert(D.elements, id, r); dirtyLib() }, drop: id => { D.elements = D.elements.filter(x => x.id !== id); dirtyLib() } },
    overrides: { all: () => new Map(Object.entries(D.overrides)), put: (id, r) => { D.overrides[id] = r; dirtyLib() }, drop: id => { delete D.overrides[id]; dirtyLib() } },
    settings: {
      all: () => new Map([['shared', Object.fromEntries(SHARED_SETTINGS.map(k => [k, D.settings[k]]))]]),
      put: (id, r) => { for (const k of SHARED_SETTINGS) if (r[k] != null) D.settings[k] = r[k] },
      drop: () => {},
    },
  };
  const byId = list => new Map(list.map(x => [x.id, x]));
  const upsert = (list, id, r) => { const i = list.findIndex(x => x.id === id); if (i < 0) list.push(r); else list[i] = r };
  const clean = o => JSON.parse(JSON.stringify(o ?? null));
  const keyOf = (col, id) => col + '/' + id;

  let A = null, F = null, auth = null, fs = null, user = null, unsubs = [];
  let state = 'loading', detail = '', team = null, queue = Promise.resolve(), pushTimer = null;
  let cloudLib = undefined; // { updated, sig, source, docModified } of the team's playbook; null if none uploaded yet
  // short fingerprint of a playbook, to tell whether the copy on this computer differs from the team's
  const sig = lib => { const t = JSON.stringify(lib); let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + '-' + t.length };
  // Per-person sync bookkeeping, kept in localStorage: what each record looked like when it last matched the cloud.
  let meta = { last: {}, u: {}, init: false };
  const metaKey = () => 'laudate-sync-' + (user ? user.uid : '');
  const loadMeta = () => { try { meta = { last: {}, u: {}, init: false, ...JSON.parse(localStorage.getItem(metaKey()) || '{}') } } catch (e) { meta = { last: {}, u: {}, init: false } } };
  const saveMeta = () => { try { localStorage.setItem(metaKey(), JSON.stringify(meta)) } catch (e) {} };
  const email = () => (user && user.email || '').toLowerCase();

  function setState(s, d = '') { state = s; detail = d; refresh() }
  // Redraw the screens that show sync status, without stealing focus from a field someone is typing in.
  let pendingRender = false;
  function refresh() {
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (typing || V.view === 'edit') { pendingRender = true; return }
    pendingRender = false;
    if (document.getElementById('sheet').hidden) scrollKeep(render);
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) refresh() }, 50));
  // one job at a time, so pulls and pushes never interleave
  function run(fn) {
    queue = queue.then(fn).catch(e => {
      console.error('Laudate sync:', e);
      if (e && e.code === 'permission-denied') setState('notcoach');
      else setState(navigator.onLine ? 'error' : 'offline', e && e.message || String(e));
    });
    return queue;
  }
  const colRef = col => F.collection(fs, ...TEAM, col);
  const docRef = (col, id) => F.doc(fs, ...TEAM, col, id);

  /* ---------- push ---------- */
  async function pushChanges() {
    if (!user || !meta.init) return;
    let n = 0;
    for (const [col, c] of Object.entries(COLS)) {
      const local = c.all();
      for (const [id, rec] of local) {
        const k = keyOf(col, id), j = JSON.stringify(rec);
        if (meta.last[k] === j || !id) continue;
        const u = Math.max(Date.now(), (meta.u[k] || 0) + 1);
        await F.setDoc(docRef(col, id), { updated: u, deleted: false, by: email(), data: clean(rec) });
        meta.last[k] = j; meta.u[k] = u; n++;
      }
      for (const k of Object.keys(meta.last)) {
        if (!k.startsWith(col + '/')) continue;
        const id = k.slice(col.length + 1);
        if (local.has(id)) continue;
        const u = Math.max(Date.now(), (meta.u[k] || 0) + 1);
        await F.setDoc(docRef(col, id), { updated: u, deleted: true, by: email(), data: null });
        delete meta.last[k]; meta.u[k] = u; n++;
      }
    }
    if (n) saveMeta();
  }
  const syncNow = () => run(async () => { setState('syncing'); await pushChanges(); setState(navigator.onLine ? 'synced' : 'offline') });

  /* ---------- pull ---------- */
  // Apply one record from the cloud. On a device's first sync, the cloud wins wherever both sides have the record.
  function apply(col, id, r) {
    const c = COLS[col], k = keyOf(col, id);
    if (r.updated <= (meta.u[k] || 0)) return false;
    const local = c.all().get(id);
    const dirty = local && meta.init && meta.last[k] !== JSON.stringify(local);
    if (dirty) return false; // edited here since the last sync; this device's push will follow and win
    if (r.deleted) { if (local) c.drop(id); delete meta.last[k] }
    else { c.put(id, r.data); meta.last[k] = JSON.stringify(c.all().get(id)) }
    meta.u[k] = r.updated;
    return true;
  }
  function start() {
    setState(navigator.onLine ? 'syncing' : 'offline');
    loadMeta();
    let waiting = Object.keys(COLS).length;
    const unsubTeam = F.onSnapshot(F.doc(fs, ...TEAM), s => { team = s.exists() ? s.data() : null; refresh() }, () => {});
    unsubs.push(unsubTeam);
    unsubs.push(F.onSnapshot(docRef('playbook', 'current'), s => {
      const r = s.exists() ? s.data() : null;
      cloudLib = r && !r.deleted ? { updated: r.updated, sig: r.data.sig, source: r.data.source, docModified: r.data.docModified } : null;
      const had = cachedLibrary()?.updated;
      // a version made from the Google Doc is always the newest, so it also replaces library.js on the owner's computer
      if (cloudLib && (had || 0) < r.updated) { setLibrary(r.data.lib, r.updated, cloudLib.source === 'google-doc'); toast(had ? 'Playbook updated' : 'Playbook loaded') }
      refresh();
    }, () => {}));
    for (const col of Object.keys(COLS)) {
      let first = true;
      unsubs.push(F.onSnapshot(colRef(col), snap => {
        const changes = snap.docChanges().filter(c => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites);
        const isFirst = first; first = false;
        run(async () => {
          let changed = false;
          for (const ch of changes) changed = apply(col, ch.doc.id, ch.doc.data()) || changed;
          if (changed) { writeLocal(); saveMeta() }
          if (isFirst && --waiting === 0) {
            // everything already in the cloud is here now; send what only this device has
            meta.init = true; saveMeta();
            await pushChanges();
          }
          if (waiting === 0) setState(navigator.onLine ? 'synced' : 'offline');
          else if (changed) refresh();
        });
      }, err => {
        console.error(err);
        setState(err.code === 'permission-denied' ? 'notcoach' : 'error', err.message);
      }));
    }
  }
  function stop() { unsubs.forEach(u => u()); unsubs = []; team = null; cloudLib = undefined }

  async function load() {
    if (!cfg) { setState('nosetup'); return }
    if (location.protocol === 'file:') { setState('nosetup', 'file'); return }
    setState(navigator.onLine ? 'loading' : 'offline');
    try {
      const [app, a, f] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(n => import(FB + n)));
      A = a; F = f;
      const fbApp = app.initializeApp(cfg);
      // App Check: proves requests come from this app on its real web address (see SETUP.md)
      const siteKey = window.LC_APPCHECK_SITE_KEY;
      if (siteKey && !cfg.useEmulators && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        const ac = await import(FB + 'firebase-app-check.js');
        ac.initializeAppCheck(fbApp, { provider: new ac.ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
      }
      auth = A.getAuth(fbApp); fs = F.getFirestore(fbApp);
      if (cfg.useEmulators) { // local testing only: Firebase's emulator suite on this computer
        A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        F.connectFirestoreEmulator(fs, '127.0.0.1', 8080);
      }
      A.onAuthStateChanged(auth, u => {
        stop(); user = u;
        if (!u) setState('signedout');
        else if (!u.emailVerified) setState('unverified');
        else start();
      });
    } catch (e) {
      console.warn('Laudate sync could not load', e);
      setState('offline');
      window.addEventListener('online', load, { once: true });
    }
  }
  window.addEventListener('online', () => { if (user && meta.init) syncNow() });
  window.addEventListener('offline', () => { if (user) setState('offline') });

  /* ---------- the Team sync card (More tab) ---------- */
  const AUTH_ERRORS = {
    'auth/invalid-credential': "That email and password don't match an account.",
    'auth/wrong-password': "That email and password don't match an account.",
    'auth/user-not-found': "That email and password don't match an account.",
    'auth/invalid-email': 'Check the email address.',
    'auth/email-already-in-use': 'There is already an account with that email. Sign in instead.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/missing-password': 'Enter your password.',
    'auth/network-request-failed': "You're offline. Connect to the internet and try again.",
    'auth/popup-blocked': 'The Google window was blocked. Allow pop-ups, or use email and password.',
    'auth/operation-not-allowed': "This sign-in method isn't turned on in the Firebase project.",
    'auth/unauthorized-domain': "This web address isn't on the Firebase project's list of allowed domains.",
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/requires-recent-login': 'For your security, sign out and back in, then try again.',
  };
  const authMsg = e => AUTH_ERRORS[e && e.code] || (e && e.message) || 'Something went wrong.';
  const isOwner = () => !!team && (team.owners || []).includes(email());
  const STATUS = {
    syncing: 'Syncing…', synced: 'Everything is synced with the team.', offline: "You're offline. Changes sync when you reconnect.",
    loading: 'Connecting…', signedout: 'Not signed in', unverified: 'Email not verified yet', notcoach: 'Not on the coach list', nosetup: 'Not set up',
  };
  function cardHTML() {
    let h = '';
    if (state === 'nosetup') {
      h = detail === 'file' ? `<p class="small muted">Open the app from its web address to sign in.</p>`
        : `<p class="small muted">The team’s Firebase project isn’t connected yet. Add its settings to <code>firebase-config.js</code> (see SETUP.md). Until then everything stays on this device.</p>`;
    } else if (!auth) {
      h = `<p class="small muted">${STATUS[state] || ''}</p>`;
    } else if (!user) {
      h = `<p class="small muted">Sign in so every coach sees the same classes, members and scores. Ask the owner to add your email to the coach list first.</p>
        <button class="primary wide" data-act="syncGoogle" style="margin-top:10px">Continue with Google</button>
        <p class="small muted" style="text-align:center;margin:10px 0 0">or use email</p>
        <input id="syEmail" type="email" placeholder="Email" autocomplete="email" style="margin-top:8px">
        <input id="syPass" type="password" placeholder="Password (6+ characters)" autocomplete="current-password" style="margin-top:8px">
        <div class="row" style="margin-top:10px"><button class="primary" data-act="syncIn">Sign in</button><button data-act="syncUp">Create account</button><button class="link" data-act="syncReset">Forgot password?</button></div>
        <p class="small" id="syErr" style="color:var(--danger)"></p>`;
    } else if (state === 'unverified') {
      h = `<p class="small">We sent a link to <b>${esc(user.email)}</b>. Open it, then come back and tap Continue.</p>
        <div class="row" style="margin-top:10px"><button class="primary" data-act="syncVerified">Continue</button><button data-act="syncResend">Send again</button><button class="ghost" data-act="syncOut">Sign out</button></div>`;
    } else if (state === 'notcoach') {
      h = `<p class="small">Signed in as <b>${esc(user.email)}</b>, but that email isn’t on the Laudate coach list yet. Ask the owner to add it under <b>More → Team sync → Coaches</b>, then tap Try again.</p>
        <div class="row" style="margin-top:10px"><button class="primary" data-act="syncRetry">Try again</button><button class="ghost" data-act="syncOut">Sign out</button></div>`;
    } else {
      const coaches = team ? [...new Set([...(team.owners || []), ...(team.coaches || [])])] : [];
      h = `<p class="small">Signed in as <b>${esc(user.email)}</b>${isOwner() ? ' · owner' : ''}</p>
        <p class="small ${state === 'error' ? '' : 'muted'}" ${state === 'error' ? 'style="color:var(--danger)"' : ''}>${state === 'error' ? 'Sync hit a problem: ' + esc(detail) : esc(STATUS[state] || '')}</p>
        <div class="row" style="margin-top:10px"><button data-act="syncNow">Sync now</button><button class="ghost" data-act="syncOut">Sign out</button></div>
        ${team ? `<div class="divider"></div><h3>Coaches</h3>
          <ul class="list">${coaches.map(e => `<li class="row between" style="padding:8px 0"><span>${esc(e)}${(team.owners || []).includes(e) ? ' <span class="pill gold">Owner</span>' : ''}</span>
            ${isOwner() && !(team.owners || []).includes(e) ? `<button class="icon" data-act="syncRmCoach" data-e="${esc(e)}">Remove</button>` : ''}</li>`).join('')}</ul>
          ${isOwner() ? `<div class="row" style="margin-top:8px"><input id="syCoach" type="email" placeholder="coach@example.com" class="grow" style="flex:1"><button class="primary" data-act="syncAddCoach">Add coach</button></div>
            <p class="small muted" style="margin-top:6px">Coaches sign in with Google or with this email and a password.</p>` : ''}` : ''}
        ${playbookHTML()}
        <div class="divider"></div><button class="link" data-act="syncDelete" style="color:var(--danger)">Delete my sign-in…</button>`;
    }
    return `<div class="card"><div class="row between"><h2>Team sync</h2>${pillHTML()}</div>${h}</div>`;
  }
  // Owners with library.js on their computer can upload it (or a newer version) for the whole team.
  function playbookHTML() {
    if (cloudLib === undefined || !team) return '';
    if (cloudLib && cloudLib.source === 'google-doc') return `<div class="divider"></div><p class="small muted">The playbook updates automatically from the Laudate Playbook Google Doc${cloudLib.docModified ? ` (last edited ${new Date(cloudLib.docModified).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})` : ''}.</p>`;
    const local = window.LAUDATE_LIBRARY;
    if (!isOwner() || !local) return cloudLib ? '' : `<div class="divider"></div><p class="small muted">The team’s playbook hasn’t been uploaded yet. An owner uploads it from their computer.</p>`;
    if (cloudLib && cloudLib.sig === sig(local)) return `<div class="divider"></div><p class="small muted">The team has the same playbook as this computer (${local.elements.length} elements).</p>`;
    return `<div class="divider"></div><h3>Playbook</h3><p class="small muted">${cloudLib ? 'This computer has a different version of the playbook from the team’s.' : 'The team doesn’t have the playbook yet.'} Upload it so every coach gets it; only signed-in coaches can read it.</p>
      <button class="primary" data-act="syncUploadLib" style="margin-top:8px">${cloudLib ? 'Update the team’s playbook' : 'Upload the playbook'} (${local.elements.length} elements)</button>`;
  }
  function pillHTML() {
    if (state === 'nosetup') return '';
    const cls = state === 'synced' ? 'teal' : state === 'error' || state === 'notcoach' ? 'gold' : '';
    return `<span class="pill ${cls}">${{ synced: 'Synced', syncing: 'Syncing', offline: 'Offline', error: 'Sync problem', notcoach: 'No access', signedout: 'Signed out', unverified: 'Verify email', loading: '…' }[state] || ''}</span>`;
  }
  const err = m => { const e = document.getElementById('syErr'); if (e) e.textContent = m };
  const creds = () => [document.getElementById('syEmail').value.trim(), document.getElementById('syPass').value];
  const guard = async fn => { err(''); try { await fn() } catch (e) { if (e && e.code === 'auth/popup-closed-by-user') return; err(authMsg(e)); if (!document.getElementById('syErr')) toast(authMsg(e)) } };
  async function setCoaches(list) {
    await F.updateDoc(F.doc(fs, ...TEAM), { coaches: [...new Set(list.map(e => e.trim().toLowerCase()).filter(Boolean))].sort() });
  }
  Object.assign(actions, {
    syncGoogle() { guard(() => A.signInWithPopup(auth, new A.GoogleAuthProvider())) },
    syncIn() { guard(() => A.signInWithEmailAndPassword(auth, ...creds())) },
    syncUp() { guard(async () => { const c = await A.createUserWithEmailAndPassword(auth, ...creds()); await A.sendEmailVerification(c.user) }) },
    syncReset() { guard(async () => { const em = document.getElementById('syEmail').value.trim(); if (!em) { err('Enter your email first.'); return } await A.sendPasswordResetEmail(auth, em); toast('Password reset email sent to ' + em) }) },
    syncResend() { guard(async () => { await A.sendEmailVerification(user); toast('Sent — check your inbox') }) },
    syncVerified() { guard(async () => { await user.reload(); if (!auth.currentUser.emailVerified) { toast('Not verified yet — open the link in the email first'); return } await auth.currentUser.getIdToken(true); stop(); start() }) },
    syncRetry() { stop(); start() },
    syncNow() { syncNow() },
    syncUploadLib() {
      const lib = window.LAUDATE_LIBRARY;
      guard(async () => {
        await F.setDoc(docRef('playbook', 'current'), { updated: Date.now(), deleted: false, by: email(), data: { sig: sig(lib), lib: clean(lib) } });
        toast('Playbook uploaded for the team');
      });
    },
    async syncOut() { if (!confirm('Sign out? Everything stays on this device.')) return; await A.signOut(auth); toast('Signed out') },
    syncAddCoach() {
      const e = document.getElementById('syCoach').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast('Enter an email address'); return }
      guard(async () => { await setCoaches([...(team.coaches || []), e]); toast(`${e} can now sign in`) });
    },
    syncRmCoach(b) { if (confirm(`Remove ${b.dataset.e} from the coach list? They lose access to the team’s data.`)) guard(() => setCoaches((team.coaches || []).filter(x => x !== b.dataset.e))) },
    // The team's classes and members belong to the gym, so this removes only the person's sign-in.
    async syncDelete() {
      if (!confirm('Delete your sign-in? The team’s classes and members stay for the other coaches, and this device keeps its copy.')) return;
      try {
        const providers = user.providerData.map(p => p.providerId);
        if (providers.includes('google.com')) await A.reauthenticateWithPopup(user, new A.GoogleAuthProvider());
        else if (providers.includes('password')) { const pw = prompt('Enter your password to confirm'); if (!pw) return; await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(user.email, pw)) }
        stop(); try { localStorage.removeItem(metaKey()) } catch (e) {}
        await A.deleteUser(user); toast('Your sign-in is deleted');
      } catch (e) { if (e && e.code !== 'auth/popup-closed-by-user') toast(authMsg(e)) }
    },
  });

  window.LCSync = {
    cardHTML, pillHTML,
    // called by save(): push whatever changed, a moment after the coach stops editing
    changed() {
      if (!user || !meta.init) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => run(async () => { setState('syncing'); await pushChanges(); setState(navigator.onLine ? 'synced' : 'offline') }), 1200);
    },
  };
  load();
})();
