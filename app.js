/* Laudate Coach — class planning and member progress for Laudate Fitness coaches.
 * Everything is stored in localStorage on this device (Settings → Export backup to copy it to another device).
 * Data: settings, classes (each a list of sections built from library elements, plus attendance and scores),
 * members, elements (coach-made library elements) and overrides (coach edits to playbook elements). */
const KEY = 'laudate-coach-v1';
/* The Laudate Playbook isn't part of the published code. It comes from library.js on the owner's computer, or from
 * the team space once a coach signs in (sync.js), and is cached on each device so it works offline. */
const LIB_KEY = 'laudate-library';
const EMPTY_LIB = { elements: [], equipment: {}, structure: [], breathGuide: [] };
// A cached copy made from the Google Doc (auto) is newer than any library.js file.
let LIB = (cachedLibrary()?.auto && cachedLibrary().lib) || window.LAUDATE_LIBRARY || cachedLibrary()?.lib || EMPTY_LIB;
function cachedLibrary() { try { return JSON.parse(localStorage.getItem(LIB_KEY)) } catch (e) { return null } }
function setLibrary(lib, updated, overLocal) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify({ updated, lib, auto: !!overLocal })) } catch (e) {}
  if (!window.LAUDATE_LIBRARY || overLocal) { LIB = lib; dirtyLib() }
}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) };
const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d };
const monday = d => { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d };
const fmtDate = s => parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const longDate = s => parseYmd(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h + 11) % 12 + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}` };
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null };
const r1 = n => Math.round(n * 10) / 10;
const mmss = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const low = s => s === 'AMRAP' ? s : s.toLowerCase();
const bibleLink = ref => `https://www.biblegateway.com/passage/?search=${encodeURIComponent(ref)}&version=NIV`;

/* ---------- the program (from laudatefitness.com and the Laudate Playbook) ---------- */
const PROGRAMS = {
  ep: { name: 'Elevated Prayer', short: 'EP' },
  sc: { name: 'SoulCore', short: 'SC' },
};
// Weekly schedule from the website.
const SCHEDULE = [
  { day: 4, time: '19:00', program: 'ep' },
  { day: 6, time: '08:30', program: 'ep' },
  { day: 6, time: '10:00', program: 'sc' },
  { day: 6, time: '11:30', program: 'ep' },
];
const KINDS = {
  amrap: { name: 'AMRAPs', one: 'AMRAP' },
  finisher: { name: 'Finishers', one: 'Finisher' },
  ancillary: { name: 'Ancillary lifts', one: 'Ancillary group' },
  breath: { name: 'Breathing prayers', one: 'Breathing prayer' },
  prayer: { name: 'Unison prayers', one: 'Unison prayer' },
  warmup: { name: 'Warmups', one: 'Warmup' },
};
// Section types a class can contain. `kind` = which library elements fill it.
const SECTIONS = {
  warmup: { label: 'Warmup', kind: 'warmup' },
  intentions: { label: 'Intentions & Petitions', text: 'Write prayer requests and intentions on the whiteboard.' },
  prayer: { label: 'Unison Prayer', kind: 'prayer' },
  amrap: { label: 'AMRAP', kind: 'amrap' },
  breath: { label: 'Water Break & Breathing Prayer', kind: 'breath' },
  ancillary: { label: 'Ancillary Movements', kind: 'ancillary' },
  finisher: { label: 'Finisher', kind: 'finisher' },
  closing: { label: 'Prayer Requests & Closing Prayer', text: 'Goal notecards, prayer requests and benediction. Fellowship afterward.' },
  decade: { label: 'Decade', custom: true },
  custom: { label: 'Custom section', custom: true },
};
const EP_TEMPLATE = ['warmup', 'intentions', 'prayer', 'amrap', 'breath', 'ancillary', 'finisher', 'closing'];
const MYSTERIES = {
  Joyful: ['The Annunciation', 'The Visitation', 'The Nativity', 'The Presentation', 'The Finding in the Temple'],
  Sorrowful: ['The Agony in the Garden', 'The Scourging at the Pillar', 'The Crowning with Thorns', 'The Carrying of the Cross', 'The Crucifixion'],
  Glorious: ['The Resurrection', 'The Ascension', 'The Descent of the Holy Spirit', 'The Assumption', 'The Coronation of Mary'],
  Luminous: ['The Baptism of the Lord', 'The Wedding at Cana', 'The Proclamation of the Kingdom', 'The Transfiguration', 'The Institution of the Eucharist'],
};
// Traditional day for each set of mysteries (Sunday = 0).
const MYSTERY_DAY = ['Glorious', 'Joyful', 'Sorrowful', 'Glorious', 'Luminous', 'Sorrowful', 'Joyful'];

/* Ancillary mesocycle (Ancillary Mesocycles doc): a 10-week macrocycle —
 * 5 weeks hypertrophy (sets of 12), 4 weeks strength (sets of 6–10), 1 week peak/test. */
function cycleWeek(date) {
  const start = monday(parseYmd(D.settings.cycleStart));
  const w = Math.floor((monday(parseYmd(date)) - start) / (7 * 864e5));
  return w < 0 ? null : (w % 10) + 1;
}
const phaseOf = w => !w ? null : w <= 5 ? { name: 'Hypertrophy', scheme: '4×12' } : w <= 9 ? { name: 'Strength', scheme: '4×6–8' } : { name: 'Peak / Test', scheme: 'Work up to a rep max' };

/* Liturgical season, used to suggest themed AMRAPs and finishers. */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
function season(date) {
  const d = parseYmd(date), y = d.getFullYear(), e = easter(y);
  const xmas = new Date(y, 11, 25), advent = addDays(xmas, -((xmas.getDay() || 7) + 21));
  if (d >= xmas || d < new Date(y, 0, 6)) return 'Christmas';
  if (d < new Date(y, 0, 13)) return 'Epiphany';
  if (d >= advent) return 'Advent';
  if (d >= addDays(e, -46) && d < addDays(e, -7)) return 'Lent';
  if (d >= addDays(e, -7) && d < e) return 'Holy Week';
  if (d >= e && d < addDays(e, 49)) return 'Easter';
  if (d >= addDays(e, 49) && d < addDays(e, 56)) return 'Pentecost';
  if (d.getMonth() === 9 && d.getDate() >= 25 || d.getMonth() === 10 && d.getDate() <= 2) return 'All Saints';
  if (d.getMonth() === 10 && d.getDate() >= 20) return 'Thanksgiving';
  return 'Ordinary Time';
}

/* ---------- state ---------- */
const defaults = () => ({
  settings: { coach: '', location: "St. Mary's · 2510 Middle Rd, Glenshaw", cycleStart: '2026-09-21', cycleFocus: 'Squat', cap: 20 },
  classes: [], members: [], elements: [], overrides: {}, seeded: false,
});
let D;
function load() {
  try { D = JSON.parse(localStorage.getItem(KEY)) } catch (e) { D = null }
  const base = defaults();
  D = D ? { ...base, ...D, settings: { ...base.settings, ...D.settings } } : base;
  if (!D.seeded) { seed(); D.seeded = true; save() }
}
function writeLocal() { try { localStorage.setItem(KEY, JSON.stringify(D)) } catch (e) { toast('Could not save — is storage full?') } }
function save() { writeLocal(); window.LCSync?.changed() }

// The three most recent class plans from the 2026 Programming folder, so the app opens on real classes.
// Their ids are fixed so every coach's device seeds the same three records and team sync merges them.
function seed() {
  const ep = (date, time, amrap, breath, ref, week) => {
    const c = newClass(date, time, 'ep', false);
    const set = (type, patch) => Object.assign(c.sections.find(s => s.type === type), patch);
    set('warmup', { elementId: 'warmup-1' });
    set('amrap', { elementId: amrap });
    set('breath', { elementId: breath, ref });
    set('ancillary', { elementId: 'ancillary-7', focus: 'Squat', week, lifts: [{ name: 'Barbell Squat', scheme: phaseOf(week).scheme }, { name: 'Goblet Squat (Quad/knee focused)', scheme: phaseOf(week).scheme }] });
    c.id = 'seed-' + date; c.sections.forEach((s, i) => s.id = `${c.id}-${i}`);
    c.source = 'Imported from 2026 Programming';
    return c;
  };
  D.classes.push(ep('2026-10-29', '19:00', 'amrap-68', 'breath-10', 'Isaiah 25:1-9', 6));
  D.classes.push(ep('2026-10-31', '08:30', 'amrap-100', 'breath-1', 'Matthew 5:1-12', 6));
  D.classes.push(ep('2026-11-05', '19:00', 'amrap-100', 'breath-1', 'Matthew 5:1-12', 7));
}

/* ---------- library ---------- */
function allElements() {
  const built = LIB.elements.map(e => D.overrides[e.id] ? { ...e, ...D.overrides[e.id], edited: true } : e);
  return built.concat(D.elements);
}
let elCache = null;
const elements = () => elCache || (elCache = allElements());
const dirtyLib = () => { elCache = null };
const el = id => elements().find(e => e.id === id);
const label = e => e ? `${e.num ? (e.custom ? '' : '#' + e.num + ' ') : ''}${e.name}${e.variant ? ' (' + e.variant + ')' : ''}` : '';
function lastUsed(id) {
  let best = null;
  for (const c of D.classes) for (const s of c.sections) if ((s.elementId === id || s.custom?.from === id) && (!best || c.date > best)) best = c.date;
  return best;
}
function usage(id) { return D.classes.filter(c => c.sections.some(s => s.elementId === id || s.custom?.from === id)).sort((a, b) => b.date.localeCompare(a.date)) }

// Body lines <-> the plain-text format coaches edit: two spaces per indent level, "> " for a coach note, "| " for a table row.
const bodyToText = body => body.map(b => b.d < 0 ? '| ' + b.t : b.t.startsWith('¶') ? '> ' + b.t.slice(1) : '  '.repeat(b.d) + b.t).join('\n');
const textToBody = txt => txt.split('\n').filter(l => l.trim()).map(l => {
  if (/^\s*\|/.test(l)) return { t: l.replace(/^\s*\|\s?/, ''), d: -1 };
  if (/^\s*>/.test(l)) return { t: '¶' + l.replace(/^\s*>\s?/, ''), d: 0 };
  const sp = l.match(/^\s*/)[0].replace(/\t/g, '  ').length;
  return { t: l.trim().replace(/^[-•*]\s+/, ''), d: Math.min(4, Math.floor(sp / 2)) };
});
const isCall = t => /^[“"]|^(call|response|leader|congregation|all)\s*:/i.test(t) || /[”"]\s*$/.test(t) && t.length < 80 && /^[“"]/.test(t);
function bodyHTML(body, cls = '') {
  if (!body?.length) return '';
  let out = '', table = [];
  const flush = () => { if (table.length) { out += `<li class="note" style="font-style:normal"><table>${table.map(r => `<tr>${r.split(' | ').map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></li>`; table = [] } };
  for (const b of body) {
    if (b.d < 0) { table.push(b.t); continue }
    flush();
    if (b.t.startsWith('¶')) out += `<li class="note">${esc(b.t.slice(1))}</li>`;
    else out += `<li class="${isCall(b.t) ? 'call' : ''}" style="--d:${b.d}">${esc(b.t)}</li>`;
  }
  flush();
  return `<ul class="body ${cls}">${out}</ul>`;
}
// Every movement line in the AMRAPs and finishers, for building new workouts from pieces of old ones.
function movementPool() {
  const seen = new Map();
  for (const e of elements()) {
    if (e.kind !== 'amrap' && e.kind !== 'finisher') continue;
    for (const b of e.body) {
      if (b.d !== 0 || b.t.startsWith('¶') || isCall(b.t) || b.t.length > 110 || /^repeat|^rest/i.test(b.t)) continue;
      const k = b.t.toLowerCase();
      if (!seen.has(k)) seen.set(k, { t: b.t, from: [] });
      seen.get(k).from.push(e);
    }
  }
  return [...seen.values()];
}

/* ---------- suggestions ---------- */
function suggest(kind, date, exclude = []) {
  const s = season(date), cutoff = ymd(addDays(parseYmd(date), -56));
  const recent = new Set(D.classes.filter(c => c.date >= cutoff && c.date !== date).flatMap(c => c.sections.map(x => x.elementId)));
  let pool = elements().filter(e => e.kind === kind && !exclude.includes(e.id));
  const fresh = pool.filter(e => !recent.has(e.id));
  if (fresh.length) pool = fresh;
  const themed = pool.filter(e => e.seasons?.includes(s));
  if (themed.length && Math.random() < 0.7) pool = themed;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

/* ---------- classes ---------- */
function newClass(date, time, program, fill = true) {
  const c = { id: uid(), date, time, program, title: '', coach: D.settings.coach, location: D.settings.location, sections: [], log: { present: [], scores: {} } };
  if (program === 'sc') {
    const set = MYSTERY_DAY[parseYmd(date).getDay()];
    c.title = `${set} Mysteries`;
    c.sections.push(section('intentions', { label: 'Opening Intention & Decade', text: 'Opening intention, Apostles’ Creed, Our Father, three Hail Marys, Glory Be.' }));
    MYSTERIES[set].forEach((m, i) => c.sections.push(section('decade', { label: `Decade ${i + 1}: ${m}`, custom: { name: m, ref: '', body: [{ t: '¶Core and stretching movements paced with this mystery. Add the movements below.', d: 0 }] } })));
    c.sections.push(section('closing', { label: 'Closing Prayer & Silent Reflection', text: 'Hail Holy Queen, closing prayer and silent reflection. Fellowship afterward.' }));
    return c;
  }
  for (const t of EP_TEMPLATE) c.sections.push(section(t));
  const w = cycleWeek(date), anc = c.sections.find(s => s.type === 'ancillary');
  anc.week = w; anc.focus = D.settings.cycleFocus;
  if (fill) autofill(c);
  return c;
}
function section(type, patch = {}) {
  const def = SECTIONS[type];
  return { id: uid(), type, label: def.label, elementId: null, custom: null, text: def.text || '', ...patch };
}
function autofill(c, onlyEmpty = true) {
  for (const s of c.sections) {
    const kind = SECTIONS[s.type].kind;
    if (!kind || (onlyEmpty && (s.elementId || s.custom))) continue;
    const focus = (s.focus || '').toLowerCase();
    const pick = kind === 'warmup' ? el('warmup-1')
      : kind === 'ancillary' && focus ? elements().find(e => e.kind === 'ancillary' && e.lifts?.some(l => l.name.toLowerCase().includes(focus))) || suggest(kind, c.date)
      : suggest(kind, c.date);
    if (pick) setElement(c, s, pick.id);
  }
}
function setElement(c, s, id) {
  const e = el(id);
  s.elementId = id; s.custom = null;
  if (s.type === 'amrap' && !s.cap) s.cap = D.settings.cap;
  if (s.type === 'breath' && !s.ref) s.ref = elementOf(c.sections.find(x => x.type === 'amrap'))?.ref || '';
  if (s.type === 'ancillary' && e?.lifts) {
    const scheme = phaseOf(s.week)?.scheme || '3×10';
    const focus = (s.focus || '').toLowerCase();
    const picks = e.lifts.filter(l => focus && l.name.toLowerCase().includes(focus));
    s.lifts = (picks.length ? picks : e.lifts.slice(0, 2)).slice(0, 3).map(l => ({ name: l.name, scheme }));
  }
  if (s.type === 'amrap') {
    const br = c.sections.find(x => x.type === 'breath');
    if (br && e?.ref) br.ref = e.ref;
  }
}
const elementOf = s => s ? (s.custom || el(s.elementId)) : null;
const getClass = id => D.classes.find(c => c.id === id);
const classTitle = c => {
  const a = elementOf(c.sections.find(s => s.type === 'amrap'));
  return c.title || (a ? a.name : PROGRAMS[c.program].name);
};
const sortedClasses = () => [...D.classes].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
function nextSlots(n = 6) {
  const out = [];
  for (let i = 0; out.length < n && i < 21; i++) {
    const d = addDays(new Date(), i), date = ymd(d);
    for (const s of SCHEDULE) if (s.day === d.getDay()) out.push({ date, ...s, plan: D.classes.find(c => c.date === date && c.time === s.time) });
  }
  return out;
}

// Plain text in the same shape as the class docs in Drive, for pasting into Google Docs or texting another coach.
function classText(c) {
  const L = [`${fmtDate(c.date)} ${fmtTime(c.time)} — ${PROGRAMS[c.program].name}${c.title ? ': ' + c.title : ''}`, ''];
  for (const s of c.sections) {
    const e = elementOf(s);
    L.push(s.label.toUpperCase());
    if (e) L.push(`${e.custom || s.custom ? '' : 'OPTION ' + e.num + ': '}${e.name}${e.ref ? ' (' + e.ref + ')' : ''}`);
    if (s.type === 'amrap' && s.cap) L.push(`${s.cap} minute cap`);
    if (e) for (const b of e.body) L.push(b.d < 0 ? '  ' + b.t : '  '.repeat(b.d + 1) + (b.t.startsWith('¶') ? b.t.slice(1) : '- ' + b.t));
    if (s.type === 'breath' && s.ref) L.push(`  Scripture: ${s.ref}`);
    if (s.study) L.push(`  Bible study: ${s.study}`);
    if (s.type === 'ancillary') {
      if (s.week) L.push(`  ${s.focus || ''} — Week ${s.week} (${phaseOf(s.week).name})`);
      for (const l of s.lifts || []) L.push(`  - ${l.name} ${l.scheme}`);
    }
    if (s.text) L.push('  ' + s.text);
    L.push('');
  }
  return L.join('\n');
}

/* ---------- members & progress ---------- */
const getMember = id => D.members.find(m => m.id === id);
const memberClasses = id => D.classes.filter(c => c.log?.present.includes(id)).sort((a, b) => a.date.localeCompare(b.date));
const e1rm = (w, r) => r > 1 ? w * (1 + r / 30) : w;
function liftHistory(id) {
  const by = {};
  for (const c of memberClasses(id)) {
    const sc = c.log.scores[id]; if (!sc?.lifts) continue;
    for (const [name, v] of Object.entries(sc.lifts)) {
      if (!(v.w > 0)) continue;
      (by[name] = by[name] || []).push({ date: c.date, w: v.w, r: v.r || 1, x: parseYmd(c.date).getTime() });
    }
  }
  return by;
}
function weekStreak(id) {
  const weeks = new Set(memberClasses(id).map(c => ymd(monday(parseYmd(c.date)))));
  let n = 0, w = monday(new Date());
  if (!weeks.has(ymd(w))) w = addDays(w, -7);
  while (weeks.has(ymd(w))) { n++; w = addDays(w, -7) }
  return n;
}

/* ---------- ui helpers ---------- */
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600) }
function sheet(html) { $('#sheetBox').innerHTML = html; $('#sheet').hidden = false; $('#sheetBox').scrollTop = 0; const f = $('#sheetBox input[autofocus]'); if (f && matchMedia('(hover: hover)').matches) f.focus() }
function closeSheet() { $('#sheet').hidden = true; $('#sheetBox').innerHTML = ''; pick = null }
const scrollKeep = fn => { const y = window.scrollY; fn(); window.scrollTo(0, y) };
const logo = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="var(--accent)"/><path d="M20 8v24M13 15h14" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/></svg>`;
const backBtn = () => stack.length ? `<button class="back noprint" data-act="back">‹ Back</button>` : '';

function lineChart(pts, label) {
  if (pts.length < 2) return `<p class="muted small empty">Log this lift in at least two classes to see a trend.</p>`;
  const W = 320, H = 150, L = 36, R = 10, T = 10, B = 22;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) === x0 ? x0 + 1 : Math.max(...xs);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const padY = (hi - lo) * 0.2 || Math.max(1, hi * 0.05), y0 = lo - padY, y1 = hi + padY;
  const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = `${line}L${X(pts.at(-1).x).toFixed(1)},${H - B}L${X(pts[0].x).toFixed(1)},${H - B}Z`;
  const grid = [lo, (lo + hi) / 2, hi].filter((v, i, a) => a.indexOf(v) === i).map(v =>
    `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-dasharray="3 3"/><text x="${L - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const last = pts.at(-1);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}
    <path d="${area}" fill="var(--accent)" opacity=".12"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map(p => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.5" fill="var(--accent)"/>`).join('')}
    <circle cx="${X(last.x).toFixed(1)}" cy="${Y(last.y).toFixed(1)}" r="5" fill="var(--gold)" stroke="var(--card)" stroke-width="2"/>
    <text x="${L}" y="${H - 6}">${shortDate(pts[0].x)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${shortDate(last.x)}</text></svg>`;
}

/* ---------- navigation ----------
 * V is the current screen ({view, ...params}); stack holds the screens behind it for the Back button. */
let V = { view: 'today' }, stack = [];
const TAB_OF = { today: 'today', classes: 'classes', plan: 'classes', run: 'classes', log: 'classes', library: 'library', element: 'library', edit: 'library', members: 'members', member: 'members', more: 'more' };
function go(view, params = {}) { stack.push(V); V = { view, ...params }; render(); window.scrollTo(0, 0) }
function tabTo(t) { stack = []; V = { view: t }; render(); window.scrollTo(0, 0) }
function back() { V = stack.pop() || { view: 'today' }; render() }
function render() {
  stopTimerTick();
  const tab = TAB_OF[V.view];
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const fn = { today: todayHTML, classes: classesHTML, plan: planHTML, run: runHTML, log: logHTML, library: libraryHTML, element: elementHTML, edit: editHTML, members: membersHTML, member: memberHTML, more: moreHTML }[V.view];
  $('#view').innerHTML = fn();
  if (V.view === 'run') startTimerTick();
}

/* ---------- today ---------- */
function todayHTML() {
  const today = ymd(), w = cycleWeek(today), ph = phaseOf(w);
  const slots = nextSlots(4);
  const recent = sortedClasses().filter(c => c.date < today).slice(0, 3);
  const month = today.slice(0, 7), monthClasses = D.classes.filter(c => c.date.startsWith(month) && c.log.present.length);
  const avg = monthClasses.length ? Math.round(monthClasses.reduce((n, c) => n + c.log.present.length, 0) / monthClasses.length) : 0;
  return `<div class="top"><div><div class="brand">${logo}<div><div class="eyebrow" style="margin:0">Laudate Fitness</div><h1>${D.settings.coach ? 'Peace, ' + esc(D.settings.coach.split(' ')[0]) : 'Coach'}</h1></div></div></div></div>
    <div class="row" style="margin-bottom:14px"><span class="pill gold">${esc(season(today))}</span>${w ? `<span class="pill teal">${esc(D.settings.cycleFocus)} · Week ${w} of 10 · ${ph.name}</span>` : ''}<span class="pill">${longDate(today)}</span>${window.LCSync ? `<button style="padding:0;background:none" data-tab="more">${LCSync.pillHTML()}</button>` : ''}</div>
    <div class="grid3"><div class="stat"><b>${D.members.length}</b><span>Members</span></div><div class="stat"><b>${monthClasses.length}</b><span>Classes logged this month</span></div><div class="stat"><b>${avg || '—'}</b><span>Avg. attendance</span></div></div>
    <div class="eyebrow" style="margin-top:8px">Coming up</div>
    ${slots.map(s => s.plan ? classCard(s.plan) : `<div class="card"><div class="row between"><div><div class="small muted">${fmtDate(s.date)} · ${fmtTime(s.time)}</div><h2>${PROGRAMS[s.program].name}</h2><p class="small muted">Not planned yet</p></div>
      <button class="primary small" data-act="planSlot" data-date="${s.date}" data-time="${s.time}" data-program="${s.program}">Plan it</button></div></div>`).join('')}
    ${recent.length ? `<div class="eyebrow" style="margin-top:18px">Recent classes</div>${recent.map(classCard).join('')}` : ''}
    <p class="small muted" style="text-align:center;margin-top:18px">“For physical training is of some value, but godliness has value for all things.” — 1 Timothy 4:8</p>`;
}
function classCard(c) {
  const a = elementOf(c.sections.find(s => s.type === 'amrap')), anc = c.sections.find(s => s.type === 'ancillary');
  const logged = c.log.present.length;
  return `<button class="card wide" style="text-align:left" data-act="openClass" data-id="${c.id}">
    <div class="row between"><div class="small muted">${fmtDate(c.date)} · ${fmtTime(c.time)} · ${PROGRAMS[c.program].name}</div>${logged ? `<span class="pill teal">${logged} present</span>` : c.date < ymd() ? '<span class="pill">Not logged</span>' : ''}</div>
    <h2 style="font:700 19px var(--serif);margin-top:4px">${esc(classTitle(c))}</h2>
    <p class="small muted">${[a?.ref, anc?.week ? `${anc.focus || 'Lift'} wk ${anc.week}` : ''].filter(Boolean).map(esc).join(' · ')}</p></button>`;
}

/* ---------- classes ---------- */
function classesHTML() {
  const today = ymd(), list = sortedClasses();
  const up = list.filter(c => c.date >= today).reverse(), past = list.filter(c => c.date < today);
  const byMonth = {};
  for (const c of past) (byMonth[c.date.slice(0, 7)] = byMonth[c.date.slice(0, 7)] || []).push(c);
  return `<div class="top"><div><div class="eyebrow">Class plans</div><h1>Classes</h1></div><button class="primary" data-act="newClass">+ New class</button></div>
    ${up.length ? `<div class="eyebrow">Upcoming</div>${up.map(classCard).join('')}` : ''}
    ${Object.entries(byMonth).map(([m, cs]) => `<div class="eyebrow" style="margin-top:18px">${parseYmd(m + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>${cs.map(classCard).join('')}`).join('')}
    ${!list.length ? `<div class="card empty">No classes yet. Tap <b>New class</b> to build one from the playbook.</div>` : ''}`;
}
function newClassSheet(date = ymd(), time, program) {
  const slot = SCHEDULE.find(s => s.day === parseYmd(date).getDay());
  time = time || slot?.time || '19:00'; program = program || slot?.program || 'ep';
  sheet(`<h2>New class</h2>
    <div class="grid2"><label class="field">Date<input type="date" id="ncDate" value="${date}"></label><label class="field">Time<input type="time" id="ncTime" value="${time}"></label></div>
    <label class="field">Program<select id="ncProg">${Object.entries(PROGRAMS).map(([k, p]) => `<option value="${k}" ${k === program ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
    <label class="field">Start from<select id="ncFill">
      <option value="suggest">Playbook suggestions (fresh AMRAP, finisher, prayers — themed to the season)</option>
      <option value="blank">Empty structure — I'll pick each element</option>
      ${sortedClasses().slice(0, 12).map(c => `<option value="${c.id}">Copy of ${fmtDate(c.date)} — ${esc(classTitle(c))}</option>`).join('')}
    </select></label>
    <div class="row end"><button class="ghost" data-act="close">Cancel</button><button class="primary" data-act="createClass">Create</button></div>`);
}

function planHTML() {
  const c = getClass(V.id); if (!c) return `${backBtn()}<div class="card empty">This class was deleted.</div>`;
  const w = c.program === 'ep' ? cycleWeek(c.date) : null;
  return `${backBtn()}<div class="top"><div class="grow"><div class="eyebrow">${fmtDate(c.date)} · ${fmtTime(c.time)} · ${PROGRAMS[c.program].name}</div>
    <h1>${esc(classTitle(c))}</h1><p class="small muted" style="margin-top:4px">${[c.coach && 'Coach ' + c.coach, c.location, season(c.date), w && `${D.settings.cycleFocus} cycle week ${w}`].filter(Boolean).map(esc).join(' · ')}</p></div></div>
    <div class="row noprint" style="margin-bottom:14px">
      <button class="gold" data-act="run" data-id="${c.id}">▶ Run class</button>
      <button class="primary" data-act="log" data-id="${c.id}">Attendance & scores${c.log.present.length ? ` (${c.log.present.length})` : ''}</button>
      <button class="ghost" data-act="classMenu" data-id="${c.id}">More…</button>
    </div>
    ${c.sections.map((s, i) => sectionCard(c, s, i)).join('')}
    <button class="ghost wide noprint" data-act="addSection" data-id="${c.id}">+ Add a section</button>
    ${c.source ? `<p class="small muted" style="margin-top:12px">${esc(c.source)}</p>` : ''}`;
}
function sectionCard(c, s, i) {
  const def = SECTIONS[s.type], e = elementOf(s), kind = def.kind;
  const acts = `<div class="secacts">
      ${kind ? `<button class="icon" data-act="swap" data-s="${s.id}" title="Choose from library">Swap</button><button class="icon" data-act="shuffle" data-s="${s.id}" title="Suggest another">↻</button>` : ''}
      <button class="icon" data-act="editSection" data-s="${s.id}" title="Edit">Edit</button>
      <button class="icon" data-act="moveUp" data-s="${s.id}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button>
      <button class="icon" data-act="moveDown" data-s="${s.id}" ${i < c.sections.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>
      <button class="icon" data-act="rmSection" data-s="${s.id}" aria-label="Remove">✕</button></div>`;
  let inner = '';
  if (e) {
    inner += `<p><b>${esc(s.custom ? e.name : label(e))}</b>${e.ref ? ` · <a href="${bibleLink(e.ref)}" target="_blank" rel="noopener">${esc(e.ref)}</a>` : ''}${s.custom && kind ? ' <span class="pill gold">Customized</span>' : ''}</p>`;
    inner += e.kind === 'prayer' || (s.type === 'prayer' && e.body.length === 1) ? `<p class="prayer">${esc(e.body[0]?.t.replace(/^¶/, ''))}</p>` : bodyHTML(s.type === 'ancillary' ? [] : e.body, e.body.length > 8 && s.type !== 'decade' ? 'clip' : '');
  } else if (kind) inner += `<button class="link" data-act="swap" data-s="${s.id}">Choose ${low(KINDS[kind].one)} from the playbook →</button>`;
  if (s.type === 'amrap') inner += `<p class="small muted">${s.cap || D.settings.cap} minute cap</p>`;
  if (s.type === 'breath') inner += `<p class="small">Scripture: ${s.ref ? `<a href="${bibleLink(s.ref)}" target="_blank" rel="noopener">${esc(s.ref)}</a>` : '<span class="muted">none yet</span>'}${s.study ? `<br><span class="muted">Bible study: ${esc(s.study)}</span>` : ''}</p>`;
  if (s.type === 'ancillary') {
    const ph = phaseOf(s.week);
    inner += `${s.week ? `<p class="small"><span class="pill teal">${esc(s.focus || 'Lift')} · Week ${s.week} · ${ph.name}</span></p>` : ''}
      ${(s.lifts || []).length ? `<table class="lifts">${s.lifts.map(l => `<tr><td>${esc(l.name)}</td><td style="text-align:right;white-space:nowrap"><b>${esc(l.scheme)}</b></td></tr>`).join('')}</table>` : ''}`;
  }
  if (s.text) inner += `<p class="small muted">${esc(s.text)}</p>`;
  return `<div class="card sec t-${s.type}"><div class="sechead"><div class="grow"><div class="eyebrow" style="margin:0">${i + 1}</div><h2>${esc(s.label)}</h2></div>${acts}</div>${inner}</div>`;
}

/* picking an element for a section, or browsing — shared by the class planner and the library */
let pick = null; // { kind, classId?, sectionId?, q, equip, season, fresh }
function pickerSheet() {
  const p = pick, c = p.classId && getClass(p.classId);
  const date = c ? c.date : ymd(), s = season(date);
  const q = (p.q || '').toLowerCase();
  const cutoff = ymd(addDays(parseYmd(date), -56));
  const list = elements().filter(e => e.kind === p.kind
    && (!q || (e.name + ' ' + e.ref + ' ' + e.num + ' ' + e.body.map(b => b.t).join(' ')).toLowerCase().includes(q))
    && (!p.equip || (p.equip === 'none' ? !e.equipment?.length : e.equipment?.includes(p.equip)))
    && (!p.season || e.seasons?.includes(s))
    && (!p.fresh || !(lastUsed(e.id) >= cutoff)));
  const equips = [...new Set(elements().filter(e => e.kind === p.kind).flatMap(e => e.equipment || []))].sort();
  sheet(`<div class="sticky"><div class="row between"><h2>Choose ${low(KINDS[p.kind].one)}</h2><button class="link" data-act="close">Close</button></div>
    <input id="pickQ" placeholder="Search name, scripture or movement" value="${esc(p.q || '')}" autofocus style="margin-top:10px">
    <div class="chips" style="margin-top:8px">
      <button class="chip ${p.fresh ? 'on' : ''}" data-act="pickF" data-f="fresh">Not used in 8 wks</button>
      <button class="chip ${p.season ? 'on' : ''}" data-act="pickF" data-f="season">${esc(s)} theme</button>
      ${equips.length ? `<button class="chip ${p.equip === 'none' ? 'on' : ''}" data-act="pickE" data-e="none">No equipment</button>` : ''}
      ${equips.map(x => `<button class="chip ${p.equip === x ? 'on' : ''}" data-act="pickE" data-e="${esc(x)}">${esc(x)}</button>`).join('')}
    </div></div>
    <p class="small muted">${list.length} of ${elements().filter(e => e.kind === p.kind).length}</p>
    <ul class="list">${list.map(e => { const u = lastUsed(e.id); return `<li><div class="rowbtn" style="align-items:flex-start">
      <span class="num">${e.custom ? '★' : e.num}</span>
      <button class="grow" style="background:none;padding:0;text-align:left" data-act="pickPreview" data-id="${e.id}"><b>${esc(e.name)}</b>${e.variant ? ` <span class="muted">(${esc(e.variant)})</span>` : ''}
        <div class="small muted">${[e.ref, u && 'used ' + fmtDate(u), (e.equipment || []).slice(0, 3).join(', ')].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="pv" id="pv-${e.id}" hidden></div></button>
      ${p.sectionId ? `<button class="primary small" data-act="pickUse" data-id="${e.id}">Use</button>` : ''}</div></li>` }).join('')}</ul>
    ${!list.length ? '<p class="empty">Nothing matches. Try clearing a filter.</p>' : ''}`);
}

/* ---------- run class (presenter) ---------- */
let T = null; // AMRAP timer: { end, left, paused, total }
let tick = null, wake = null, actx = null;
function runHTML() {
  const c = getClass(V.id), i = V.i || 0, s = c.sections[i], e = elementOf(s);
  let inner = '';
  if (e) {
    inner += `<p class="small muted">${esc(s.custom ? '' : label(e))}${e.ref ? ' · ' + esc(e.ref) : ''}</p>`;
    inner += s.type === 'prayer' ? `<p class="prayer" style="font-size:24px">${esc(e.body[0]?.t.replace(/^¶/, ''))}</p>` : s.type === 'ancillary' ? '' : bodyHTML(e.body);
  }
  if (s.type === 'amrap') {
    const left = timerLeft();
    inner = `<div class="card" style="margin:12px 0"><div class="timer" id="timer">${mmss(left)}</div>
      <div class="row" style="justify-content:center;margin-top:10px">
        ${!T ? `<button class="gold" data-act="tStart">Start ${s.cap || D.settings.cap}:00</button>` : T.paused ? `<button class="gold" data-act="tResume">Resume</button>` : `<button class="ghost" data-act="tPause">Pause</button>`}
        ${T ? `<button class="ghost" data-act="tReset">Reset</button>` : ''}</div></div>` + inner;
  }
  if (s.type === 'breath' && s.ref) inner += `<div class="card"><div class="eyebrow">Scripture</div><p style="font:600 22px var(--serif)"><a href="${bibleLink(s.ref)}" target="_blank" rel="noopener">${esc(s.ref)}</a></p>${s.study ? `<p class="muted">${esc(s.study)}</p>` : ''}</div>`;
  if (s.type === 'ancillary') inner += `${s.week ? `<p><span class="pill teal">${esc(s.focus || '')} · Week ${s.week} · ${phaseOf(s.week).name}</span></p>` : ''}
    <ul class="body">${(s.lifts || []).map(l => { const cue = e?.lifts?.find(x => x.name === l.name)?.cues || []; return `<li><b>${esc(l.name)}</b> — ${esc(l.scheme)}${cue.length ? `<div class="small muted">${esc(cue.join(' '))}</div>` : ''}</li>` }).join('')}</ul>`;
  if (s.text) inner += `<p class="muted" style="font-size:19px;margin-top:10px">${esc(s.text)}</p>`;
  return `<div class="run"><div class="row between noprint"><button class="back" data-act="back">‹ Exit</button><span class="small muted">${i + 1} / ${c.sections.length}</span></div>
    <div class="progress">${c.sections.map((x, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="stage"><div class="eyebrow">${esc(PROGRAMS[c.program].name)}</div><h1>${esc(s.label)}</h1><div style="margin-top:14px">${inner}</div></div>
    <div class="runbar"><button data-act="runPrev" ${i ? '' : 'disabled'}>‹ Back</button>${i < c.sections.length - 1 ? `<button class="primary" data-act="runNext">Next: ${esc(c.sections[i + 1].label)} ›</button>` : `<button class="primary" data-act="log" data-id="${c.id}">Take attendance ›</button>`}</div></div>`;
}
const timerLeft = () => {
  const c = getClass(V.id), s = c?.sections[V.i || 0], total = (s?.cap || D.settings.cap) * 60;
  if (!T) return total;
  return T.paused ? T.left : Math.max(0, Math.ceil((T.end - Date.now()) / 1000));
};
function startTimerTick() {
  if (!T || T.paused) return;
  tick = setInterval(() => {
    const left = timerLeft(), t = $('#timer');
    if (t) t.textContent = mmss(left);
    if (left <= 0) { stopTimerTick(); T = null; beep(660, .8); try { navigator.vibrate && navigator.vibrate([300, 100, 300]) } catch (e) {} toast('Time! Water break and breathing prayer.'); if (t) t.textContent = '0:00' }
    else if (left === 60) beep(880, .25);
  }, 250);
}
function stopTimerTick() { clearInterval(tick); tick = null }
function beep(freq, dur) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => wake = null) } } catch (e) {} }

/* ---------- attendance & scores ---------- */
function logHTML() {
  const c = getClass(V.id), q = (V.q || '').toLowerCase();
  const anc = c.sections.find(s => s.type === 'ancillary'), lifts = anc?.lifts || [];
  const amrap = c.sections.find(s => s.type === 'amrap');
  const members = [...D.members].sort((a, b) => a.name.localeCompare(b.name)).filter(m => !q || m.name.toLowerCase().includes(q));
  const present = new Set(c.log.present);
  return `${backBtn()}<div class="top"><div><div class="eyebrow">${fmtDate(c.date)} · ${fmtTime(c.time)}</div><h1>Attendance & scores</h1>
    <p class="small muted" style="margin-top:4px">${present.size} present · ${esc(classTitle(c))}</p></div></div>
    <div class="row" style="margin-bottom:12px"><input class="grow" id="logQ" placeholder="Find a member" value="${esc(V.q || '')}" style="flex:1"><button class="primary" data-act="addMember" data-present="${c.id}">+ New</button></div>
    ${!D.members.length ? `<div class="card empty">No members yet. Add the people in today’s class with <b>+ New</b>.</div>` : ''}
    <div class="card" style="padding-top:4px;padding-bottom:4px"><ul class="list">${members.map(m => {
      const on = present.has(m.id), sc = c.log.scores[m.id] || {};
      return `<li><div class="member"><button class="tick ${on ? 'on' : ''}" data-act="togglePresent" data-m="${m.id}" aria-label="${on ? 'Present' : 'Mark present'}">✓</button>
        <div><b>${esc(m.name)}</b><div class="small muted">${memberClasses(m.id).length} classes${m.level ? ' · ' + esc(m.level) : ''}</div></div>
        <button class="link" data-act="openMember" data-id="${m.id}">Profile</button>
        ${on ? `<div class="scorebox">
          ${amrap ? `<div class="grid3"><label>AMRAP rounds<input inputmode="numeric" data-sc="rounds" data-m="${m.id}" value="${sc.rounds ?? ''}"></label>
            <label>+ reps<input inputmode="numeric" data-sc="reps" data-m="${m.id}" value="${sc.reps ?? ''}"></label>
            <label>Version<select data-sc="scaled" data-m="${m.id}"><option value="">As written</option><option value="1" ${sc.scaled ? 'selected' : ''}>Scaled</option></select></label></div>` : ''}
          ${lifts.map(l => { const v = sc.lifts?.[l.name] || {}, best = bestLift(m.id, l.name, c.date); return `<div class="grid3" style="margin-top:8px;align-items:end">
            <label style="grid-column:span 1">${esc(l.name)}<br><span class="small">${esc(l.scheme)}${best ? ` · last ${best.w}×${best.r}` : ''}</span></label>
            <label>Weight (lb)<input inputmode="decimal" data-lift="${esc(l.name)}" data-k="w" data-m="${m.id}" value="${v.w ?? ''}"></label>
            <label>Reps<input inputmode="numeric" data-lift="${esc(l.name)}" data-k="r" data-m="${m.id}" value="${v.r ?? ''}"></label></div>` }).join('')}
          <label style="display:block;margin-top:8px">Note<input data-sc="note" data-m="${m.id}" value="${esc(sc.note || '')}" placeholder="Modifications, how they felt, prayer request…"></label>
        </div>` : ''}</div></li>` }).join('')}</ul></div>
    <button class="primary wide" data-act="back">Done</button>`;
}
function bestLift(mid, name, before) {
  let last = null;
  for (const c of memberClasses(mid)) { if (c.date >= before) break; const v = c.log.scores[mid]?.lifts?.[name]; if (v?.w) last = { w: v.w, r: v.r || '?' } }
  return last;
}

/* ---------- library ---------- */
let libKind = 'amrap', libQ = '', libEquip = '';
function libraryHTML() {
  const q = libQ.toLowerCase();
  const all = elements().filter(e => e.kind === libKind);
  const list = all.filter(e => (!q || (e.name + ' ' + e.ref + ' ' + e.num + ' ' + e.body.map(b => b.t).join(' ')).toLowerCase().includes(q)) && (!libEquip || e.equipment?.includes(libEquip)));
  const equips = [...new Set(all.flatMap(e => e.equipment || []))].sort();
  return `<div class="top"><div><div class="eyebrow">The Laudate Playbook</div><h1>Library</h1></div><button class="primary" data-act="newElement">+ New ${low(KINDS[libKind].one)}</button></div>
    ${LIB.elements.length ? '' : `<div class="card"><b>The playbook isn’t on this device yet</b><p class="small muted">It’s kept private to Laudate coaches. Sign in under <button class="link" data-tab="more" style="padding:0">More → Team sync</button> and it downloads automatically.</p></div>`}
    <div class="chips" style="margin-bottom:10px">${Object.entries(KINDS).map(([k, v]) => `<button class="chip ${k === libKind ? 'on' : ''}" data-act="libKind" data-k="${k}">${v.name} <span class="muted">${elements().filter(e => e.kind === k).length}</span></button>`).join('')}</div>
    <input id="libQ" placeholder="Search ${KINDS[libKind].name.toLowerCase()} — name, scripture, movement…" value="${esc(libQ)}">
    ${equips.length ? `<div class="chips" style="margin-top:8px">${equips.map(x => `<button class="chip ${libEquip === x ? 'on' : ''}" data-act="libEquip" data-e="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
    ${libKind === 'amrap' ? `<button class="card wide" style="text-align:left;margin-top:12px" data-act="newElement" data-mix="1"><b>Mix & match a new AMRAP</b><p class="small muted">Pick movements from any AMRAP or finisher in the playbook and save it as a new option.</p></button>` : ''}
    <div class="card" style="margin-top:12px;padding-top:2px;padding-bottom:2px"><ul class="list">${list.map(e => { const u = lastUsed(e.id); return `<li><button class="rowbtn" data-act="openElement" data-id="${e.id}">
      <span class="num">${e.custom ? '★' : e.num}</span><span class="grow"><b>${esc(e.name)}</b>${e.variant ? ` <span class="muted">(${esc(e.variant)})</span>` : ''}${e.edited ? ' <span class="pill gold">Edited</span>' : ''}
      <span class="small muted" style="display:block">${[e.ref, u && 'last used ' + fmtDate(u), e.seasons?.join(', ')].filter(Boolean).map(esc).join(' · ')}</span></span><span class="chev">›</span></button></li>` }).join('')}</ul>
    ${!list.length ? '<p class="empty">Nothing matches.</p>' : ''}</div>`;
}
function elementHTML() {
  const e = el(V.id); if (!e) return `${backBtn()}<div class="card empty">This element was deleted.</div>`;
  const used = usage(e.id);
  return `${backBtn()}<div class="top"><div class="grow"><div class="eyebrow">${KINDS[e.kind].one}${e.custom ? ' · made by a coach' : ' · Option ' + e.num}</div><h1>${esc(e.name)}</h1>
    ${e.variant ? `<p class="muted">${esc(e.variant)}</p>` : ''}${e.ref ? `<p style="margin-top:4px"><a href="${bibleLink(e.ref)}" target="_blank" rel="noopener">${esc(e.ref)}</a></p>` : ''}</div></div>
    <div class="row" style="margin-bottom:12px">
      <button class="primary" data-act="useElement" data-id="${e.id}">Use in a class</button>
      <button class="ghost" data-act="editElement" data-id="${e.id}">Edit</button>
      <button class="ghost" data-act="dupElement" data-id="${e.id}">Duplicate & remix</button>
      ${e.edited ? `<button class="ghost" data-act="restoreElement" data-id="${e.id}">Restore playbook version</button>` : ''}
      ${e.custom ? `<button class="danger" data-act="delElement" data-id="${e.id}">Delete</button>` : ''}
    </div>
    <div class="card">${e.kind === 'prayer' ? `<p class="prayer">${esc(e.body[0]?.t.replace(/^¶/, ''))}</p>` : e.lifts ? e.lifts.map(l => `<div><b>${esc(l.name)}</b>${l.cues.map(c => `<p class="small muted">${esc(c)}</p>`).join('')}</div>`).join('') : bodyHTML(e.body)}
      ${e.notes?.length ? `<p class="small muted">${esc(e.notes.join(' · '))}</p>` : ''}
      ${(e.equipment || []).length || (e.seasons || []).length ? `<div class="row">${(e.equipment || []).map(x => `<span class="pill">${esc(x)}</span>`).join('')}${(e.seasons || []).map(x => `<span class="pill gold">${esc(x)}</span>`).join('')}</div>` : ''}</div>
    <div class="eyebrow" style="margin-top:16px">Used in ${used.length} class${used.length === 1 ? '' : 'es'} in this app</div>
    ${used.slice(0, 8).map(classCard).join('')}`;
}

/* Editor for a library element or a class section's own copy of one.
 * V.target = { type: 'element', id? , kind } | { type: 'section', classId, sectionId } */
function editHTML() {
  const t = V.target, draft = V.draft;
  const isSec = t.type === 'section', c = isSec && getClass(t.classId), s = isSec && c.sections.find(x => x.id === t.sectionId);
  const kind = isSec ? SECTIONS[s.type].kind : t.kind;
  const showBody = !isSec || kind || SECTIONS[s.type].custom;
  return `${backBtn()}<div class="top"><div><div class="eyebrow">${isSec ? 'Edit section · ' + fmtDate(c.date) : (t.id ? 'Edit ' : 'New ') + low(KINDS[kind].one)}</div><h1>${esc(draft.name || (isSec ? s.label : 'Untitled'))}</h1></div></div>
    <div class="card">
      ${isSec ? `<label class="field" style="margin-top:0">Section heading<input id="edLabel" value="${esc(draft.label)}"></label>` : ''}
      ${showBody ? `<label class="field" ${isSec ? '' : 'style="margin-top:0"'}>${kind === 'prayer' ? 'Prayer title' : 'Workout name'}<input id="edName" value="${esc(draft.name)}" placeholder="e.g. Built on the Rock"></label>
      <label class="field">Scripture<input id="edRef" value="${esc(draft.ref)}" placeholder="e.g. Matthew 7:24-27"></label>
      <label class="field">${kind === 'prayer' ? 'Prayer' : 'Movements'} <span class="small">— one per line. Indent with two spaces for sub-points, start a line with “>” for a coach note, put calls in “quotes”.</span>
        <textarea id="edBody" rows="${Math.min(18, Math.max(6, draft.body.split('\n').length + 2))}">${esc(draft.body)}</textarea></label>
      ${kind === 'amrap' || kind === 'finisher' || SECTIONS[s?.type]?.custom ? `<button class="ghost" data-act="borrow">+ Add movements from other workouts</button>` : ''}` : ''}
      ${isSec && s.type === 'amrap' ? `<label class="field">Time cap (minutes)<input id="edCap" inputmode="numeric" value="${s.cap || D.settings.cap}"></label>` : ''}
      ${isSec && s.type === 'breath' ? `<label class="field">Scripture reading for the mini Bible study<input id="edSRef" value="${esc(s.ref || '')}" placeholder="e.g. Psalm 149"></label>
        <label class="field">Bible study notes / discussion questions<textarea id="edStudy" rows="3">${esc(s.study || '')}</textarea></label>` : ''}
      ${isSec && s.type === 'ancillary' ? ancillaryEditor(s) : ''}
      ${isSec ? `<label class="field">Coach notes for this section<textarea id="edText" rows="2">${esc(draft.text)}</textarea></label>` : ''}
    </div>
    ${isSec && kind && showBody ? `<label class="row small muted" style="margin:4px 0 12px"><input type="checkbox" id="edSaveLib" style="width:auto"> Also save this as a new ${low(KINDS[kind].one)} in the library</label>` : ''}
    <div class="row end"><button class="ghost" data-act="back">Cancel</button><button class="primary" data-act="saveEdit">Save</button></div>`;
}
function ancillaryEditor(s) {
  const groups = elements().filter(e => e.kind === 'ancillary');
  const g = el(s.elementId);
  return `<div class="grid2"><label class="field">Cycle lift focus<input id="edFocus" value="${esc(s.focus || '')}" placeholder="e.g. Squat"></label>
    <label class="field">Cycle week (1–10)<input id="edWeek" inputmode="numeric" value="${s.week || ''}"></label></div>
    <p class="small muted" style="margin-top:6px">Weeks 1–5 hypertrophy (sets of 12) · 6–9 strength (6–8) · 10 peak / test.</p>
    <label class="field">Movement group<select id="edGroup">${groups.map(x => `<option value="${x.id}" ${x.id === s.elementId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <div class="field">Lifts (name and sets × reps)
      <div id="edLifts">${(s.lifts || []).map(l => liftRow(l)).join('')}</div>
      <div class="row" style="margin-top:8px"><select id="edLiftPick" class="grow" style="flex:1"><option value="">Add a lift…</option>${(g?.lifts || groups.flatMap(x => x.lifts)).map(l => `<option>${esc(l.name)}</option>`).join('')}<option value="__other">Other…</option></select></div></div>`;
}
const liftRow = l => `<div class="row lrow" style="margin-top:6px"><input class="grow lname" style="flex:2" value="${esc(l.name)}"><input class="lscheme" style="flex:1" value="${esc(l.scheme)}"><button class="icon" data-act="rmLift">✕</button></div>`;
function borrowSheet(q = '') {
  const pool = movementPool(), ql = q.toLowerCase();
  const list = pool.filter(m => !ql || m.t.toLowerCase().includes(ql)).slice(0, 150);
  sheet(`<div class="sticky"><div class="row between"><h2>Add movements</h2><button class="primary small" data-act="close">Done</button></div>
    <input id="borrowQ" placeholder="Search ${pool.length} movements — burpee, KB swing, plank…" value="${esc(q)}" autofocus style="margin-top:10px"></div>
    <p class="small muted">Tap to add to the end of your workout. You can change the reps afterwards.</p>
    <ul class="list">${list.map((m, i) => `<li><button class="rowbtn" data-act="borrowAdd" data-t="${esc(m.t)}"><span class="grow">${esc(m.t)}<span class="small muted" style="display:block">from ${esc(m.from.slice(0, 2).map(e => e.name).join(', '))}${m.from.length > 2 ? ` +${m.from.length - 2}` : ''}</span></span><span class="chev">+</span></button></li>`).join('')}</ul>`);
}

/* ---------- members ---------- */
let memQ = '';
function membersHTML() {
  const q = memQ.toLowerCase();
  const list = D.members.map(m => { const cs = memberClasses(m.id); return { m, n: cs.length, last: cs.at(-1)?.date } })
    .filter(x => !q || x.m.name.toLowerCase().includes(q)).sort((a, b) => (b.last || '').localeCompare(a.last || '') || a.m.name.localeCompare(b.m.name));
  const cutoff = ymd(addDays(new Date(), -21));
  return `<div class="top"><div><div class="eyebrow">Progress</div><h1>Members</h1></div><button class="primary" data-act="addMember">+ Add member</button></div>
    <input id="memQ" placeholder="Search members" value="${esc(memQ)}" style="margin-bottom:12px">
    ${!D.members.length ? `<div class="card empty">Add members here or straight from a class’s <b>Attendance & scores</b>. Their attendance, AMRAP scores, lifts and goals build up from there.</div>` : ''}
    <div class="card" style="padding-top:2px;padding-bottom:2px"><ul class="list">${list.map(({ m, n, last }) => `<li><button class="rowbtn" data-act="openMember" data-id="${m.id}">
      <span class="avatar">${esc(initials(m.name))}</span><span class="grow"><b>${esc(m.name)}</b><span class="small muted" style="display:block">${n} class${n === 1 ? '' : 'es'}${last ? ' · last ' + fmtDate(last) : ''}</span></span>
      ${last && last < cutoff ? '<span class="pill gold">Check in</span>' : ''}<span class="chev">›</span></button></li>`).join('')}</ul></div>`;
}
let memLift = null;
function memberHTML() {
  const m = getMember(V.id); if (!m) return `${backBtn()}<div class="card empty">This member was removed.</div>`;
  const cs = memberClasses(m.id), lifts = liftHistory(m.id), names = Object.keys(lifts).sort();
  const sel = names.includes(memLift) ? memLift : names[0];
  const d30 = ymd(addDays(new Date(), -30));
  const amraps = cs.filter(c => { const s = c.log.scores[m.id]; return s && (s.rounds != null || s.reps != null) }).reverse();
  return `${backBtn()}<div class="top"><div class="brand"><span class="avatar" style="width:52px;height:52px;font-size:20px">${esc(initials(m.name))}</span><div><div class="eyebrow" style="margin:0">Member${m.joined ? ' since ' + fmtDate(m.joined) : ''}</div><h1>${esc(m.name)}</h1></div></div>
    <button class="ghost small" data-act="editMember" data-id="${m.id}">Edit</button></div>
    <div class="grid3"><div class="stat"><b>${cs.length}</b><span>Classes</span></div><div class="stat"><b>${cs.filter(c => c.date >= d30).length}</b><span>Last 30 days</span></div><div class="stat"><b>${weekStreak(m.id)}</b><span>Week streak</span></div></div>
    ${m.notes ? `<div class="card"><div class="eyebrow">Notes</div><p>${esc(m.notes)}</p></div>` : ''}
    <div class="card"><div class="row between"><div class="eyebrow" style="margin:0">Goals</div><button class="link" data-act="addGoal" data-id="${m.id}">+ Goal</button></div>
      ${(m.goals || []).length ? `<ul class="list">${m.goals.map((g, i) => `<li><div class="member" style="grid-template-columns:auto 1fr auto"><button class="tick ${g.done ? 'on' : ''}" data-act="toggleGoal" data-id="${m.id}" data-i="${i}">✓</button><div ${g.done ? 'class="muted" style="text-decoration:line-through"' : ''}>${esc(g.text)}<div class="small muted">${g.kind === 'faith' ? 'Faith' : 'Fitness'} · set ${fmtDate(g.date)}</div></div><button class="icon" data-act="rmGoal" data-id="${m.id}" data-i="${i}">✕</button></div></li>`).join('')}</ul>` : '<p class="small muted">Goal notecards from class go here — fitness and faith.</p>'}</div>
    <div class="card"><div class="eyebrow">Lifts</div>
      ${names.length ? `<select id="memLift">${names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        ${lineChart(lifts[sel].map(p => ({ x: p.x, y: p.w })), sel + ' weight')}
        <table class="mini"><tr><th>Lift</th><th>Best</th><th>Est. 1RM</th></tr>${names.map(n => { const b = lifts[n].reduce((a, p) => e1rm(p.w, p.r) > e1rm(a.w, a.r) ? p : a); return `<tr><td>${esc(n)}</td><td>${b.w} × ${b.r}</td><td>${Math.round(e1rm(b.w, b.r))} lb</td></tr>` }).join('')}</table>`
      : '<p class="small muted">Weights logged in class Attendance & scores show up here.</p>'}</div>
    <div class="card"><div class="eyebrow">AMRAP scores</div>${amraps.length ? `<table class="mini"><tr><th>Date</th><th>Workout</th><th>Score</th></tr>${amraps.slice(0, 15).map(c => { const s = c.log.scores[m.id]; return `<tr><td>${fmtDate(c.date)}</td><td>${esc(elementOf(c.sections.find(x => x.type === 'amrap'))?.name || '')}</td><td>${s.rounds ?? 0}${s.reps ? ' + ' + s.reps : ''}${s.scaled ? ' <span class="pill">scaled</span>' : ''}</td></tr>` }).join('')}</table>` : '<p class="small muted">No scores yet.</p>'}</div>
    <div class="card"><div class="eyebrow">Attendance</div>${cs.length ? `<ul class="list">${cs.slice().reverse().slice(0, 20).map(c => { const n = c.log.scores[m.id]?.note; return `<li><button class="rowbtn" data-act="openClass" data-id="${c.id}"><span class="grow">${fmtDate(c.date)} · ${esc(classTitle(c))}${n ? `<span class="small muted" style="display:block">${esc(n)}</span>` : ''}</span><span class="chev">›</span></button></li>` }).join('')}</ul>` : '<p class="small muted">Not in any logged classes yet.</p>'}</div>`;
}
function memberSheet(m, presentIn) {
  m = m || { name: '', email: '', phone: '', level: '', joined: ymd(), notes: '' };
  sheet(`<h2>${m.id ? 'Edit member' : 'New member'}</h2>
    <label class="field">Name<input id="mName" value="${esc(m.name)}" autofocus></label>
    <div class="grid2"><label class="field">Email<input id="mEmail" type="email" value="${esc(m.email)}"></label><label class="field">Phone<input id="mPhone" type="tel" value="${esc(m.phone)}"></label></div>
    <div class="grid2"><label class="field">Level<select id="mLevel">${['', 'Beginner', 'Intermediate', 'Advanced'].map(l => `<option ${l === m.level ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field">Joined<input id="mJoined" type="date" value="${m.joined || ''}"></label></div>
    <label class="field">Notes (injuries, modifications, prayer intentions)<textarea id="mNotes" rows="3">${esc(m.notes)}</textarea></label>
    <div class="row end">${m.id ? `<button class="danger" data-act="delMember" data-id="${m.id}">Remove</button><span class="grow"></span>` : ''}<button class="ghost" data-act="close">Cancel</button><button class="primary" data-act="saveMember" data-id="${m.id || ''}" data-present="${presentIn || ''}">Save</button></div>`);
}

/* ---------- more ---------- */
function moreHTML() {
  const st = D.settings, counts = Object.keys(KINDS).map(k => `${elements().filter(e => e.kind === k).length} ${KINDS[k].name.toLowerCase()}`).join(', ');
  return `<div class="top"><div><div class="eyebrow">Settings</div><h1>More</h1></div></div>
    ${window.LCSync ? LCSync.cardHTML() : ''}
    <div class="card"><h2>Coach</h2>
      <label class="field">Your name<input data-set="coach" value="${esc(st.coach)}" placeholder="Shown on the classes you plan"></label>
      <label class="field">Default location<input data-set="location" value="${esc(st.location)}"></label>
      <label class="field">Default AMRAP time cap (minutes)<input data-set="cap" inputmode="numeric" value="${st.cap}"></label></div>
    <div class="card"><h2>Ancillary cycle</h2><p class="small muted">10-week macrocycle: weeks 1–5 hypertrophy (sets of 12), 6–9 strength (6–8), week 10 peak / test.</p>
      <div class="grid2"><label class="field">Week 1 starts<input type="date" data-set="cycleStart" value="${st.cycleStart}"></label><label class="field">Lift focus<input data-set="cycleFocus" value="${esc(st.cycleFocus)}"></label></div>
      <p class="small">This week: <b>${cycleWeek(ymd()) ? `Week ${cycleWeek(ymd())} · ${phaseOf(cycleWeek(ymd())).name}` : 'cycle hasn’t started'}</b></p></div>
    <div class="card"><h2>Class schedule</h2><table class="mini">${SCHEDULE.map(s => `<tr><td>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.day]} ${fmtTime(s.time)}</td><td>${PROGRAMS[s.program].name}</td></tr>`).join('')}</table></div>
    ${LIB.elements.length ? '' : `<div class="card"><h2>Playbook</h2><p class="small muted">Sign in under Team sync to load the Laudate Playbook onto this device.</p></div>`}
    <div class="card"><h2>Gym equipment</h2><p class="small muted">From the playbook’s equipment list.</p>${Object.entries(LIB.equipment).map(([k, v]) => `<details><summary><b>${esc(k)}</b> <span class="muted small">${v.length}</span></summary><ul class="body">${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}</div>
    <div class="card"><h2>Backup</h2><p class="small muted">Everything is saved on this device${window.LCSync ? ' and, once you’re signed in, shared with the team' : ''}. Export a backup to keep a copy in Drive.</p>
      <div class="row"><button data-act="export">Export backup</button><button data-act="import">Import backup</button></div></div>
    <div class="card"><h2>Appearance</h2><div class="row">${['auto', 'light', 'dark'].map(t => `<button class="chip ${(st.theme || 'auto') === t ? 'on' : ''}" data-act="theme" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
    <p class="small muted" style="margin:12px 4px">Library: ${counts}, from the Laudate Playbook. <button class="link" data-act="erase" style="color:var(--danger)">Erase all data on this device</button></p>`;
}
function applyTheme() { const t = D.settings.theme; if (t && t !== 'auto') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme }
async function exportData() {
  const name = `laudate-coach-backup-${ymd()}.json`, blob = new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file], title: 'Laudate Coach backup' }); return } catch (e) { if (e.name === 'AbortError') return }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- events ---------- */
const cur = () => getClass(V.id);
const secOf = el => cur().sections.find(s => s.id === el.dataset.s);
function openEditor(target) {
  let draft;
  if (target.type === 'section') {
    const c = getClass(target.classId), s = c.sections.find(x => x.id === target.sectionId), e = elementOf(s);
    draft = { label: s.label, name: e?.name || '', ref: e?.ref || '', body: e ? bodyToText(e.body) : '', text: s.text || '' };
  } else {
    const e = target.id && el(target.id);
    draft = { name: e ? (target.dup ? e.name + ' (remix)' : e.name) : '', ref: e?.ref || '', body: e ? bodyToText(e.body) : '' };
  }
  go('edit', { target, draft });
}
function readDraft() {
  const d = V.draft, v = id => $(id)?.value;
  if ($('#edLabel')) d.label = v('#edLabel');
  if ($('#edName')) { d.name = v('#edName'); d.ref = v('#edRef'); d.body = v('#edBody') }
  if ($('#edText')) d.text = v('#edText');
  return d;
}
function addCustomElement(kind, d, from) {
  const n = D.elements.filter(e => e.kind === kind).length + 1;
  const e = { id: 'c-' + uid(), kind, num: n, custom: true, name: d.name.trim() || 'Untitled', ref: d.ref.trim(), variant: '', notes: [], body: textToBody(d.body), equipment: [], seasons: [], from: from || null, by: D.settings.coach, created: ymd() };
  const txt = e.name + ' ' + d.body;
  e.equipment = Object.entries({ Kettlebell: /\bKB\b|kettlebell/i, Dumbbell: /\bDBs?\b|dumbbell/i, 'Med ball': /med ?ball/i, 'Slam ball': /slam/i, 'Battle ropes': /rope/i, Hurdles: /hurdle/i, Barbell: /barbell/i, Plates: /plate/i, Bands: /\bband/i }).filter(([, r]) => r.test(txt)).map(([k]) => k);
  if (kind === 'ancillary') e.lifts = e.body.filter(b => b.d === 0).map(b => ({ name: b.t, cues: [] }));
  D.elements.push(e); dirtyLib();
  return e;
}
const actions = {
  back() { back() },
  close() { closeSheet() },
  planSlot(b) { const c = newClass(b.dataset.date, b.dataset.time, b.dataset.program); D.classes.push(c); save(); go('plan', { id: c.id }); toast('Drafted from the playbook — swap anything you like') },
  newClass() { newClassSheet() },
  createClass() {
    const date = $('#ncDate').value || ymd(), time = $('#ncTime').value, prog = $('#ncProg').value, fill = $('#ncFill').value;
    let c;
    if (fill === 'suggest' || fill === 'blank') c = newClass(date, time, prog, fill === 'suggest');
    else {
      const src = getClass(fill);
      c = { ...JSON.parse(JSON.stringify(src)), id: uid(), date, time, program: prog, log: { present: [], scores: {} }, source: `Copied from ${fmtDate(src.date)}` };
      c.sections.forEach(s => { s.id = uid(); if (s.type === 'ancillary' && c.program === 'ep') { s.week = cycleWeek(date); const sch = phaseOf(s.week)?.scheme; if (sch) (s.lifts || []).forEach(l => l.scheme = sch) } });
    }
    D.classes.push(c); save(); closeSheet(); go('plan', { id: c.id });
  },
  openClass(b) { go('plan', { id: b.dataset.id }) },
  swap(b) { pick = { kind: SECTIONS[secOf(b).type].kind, classId: V.id, sectionId: b.dataset.s, fresh: true }; pickerSheet() },
  shuffle(b) {
    const c = cur(), s = secOf(b), next = suggest(SECTIONS[s.type].kind, c.date, [s.elementId]);
    if (next) { setElement(c, s, next.id); save(); scrollKeep(render); toast(`${KINDS[next.kind].one}: ${next.name}`) }
  },
  pickF(b) { pick[b.dataset.f] = !pick[b.dataset.f]; pickerSheet() },
  pickE(b) { pick.equip = pick.equip === b.dataset.e ? '' : b.dataset.e; pickerSheet() },
  pickPreview(b) {
    const box = $('#pv-' + CSS.escape(b.dataset.id)); if (!box) return;
    if (box.hidden) { const e = el(b.dataset.id); box.innerHTML = e.lifts ? `<p class="small">${e.lifts.map(l => esc(l.name)).join(' · ')}</p>` : e.kind === 'prayer' ? `<p class="small prayer" style="font-size:14px">${esc(e.body[0].t.slice(1))}</p>` : bodyHTML(e.body) }
    box.hidden = !box.hidden;
  },
  pickUse(b) {
    if (pick.classId) {
      const c = getClass(pick.classId), s = c.sections.find(x => x.id === pick.sectionId);
      setElement(c, s, b.dataset.id); save(); closeSheet(); scrollKeep(render);
    } else {
      // "Use in a class" from the library: pick.sectionId holds the chosen class
      const c = getClass(pick.target), e = el(b.dataset.id);
      let s = c.sections.find(x => SECTIONS[x.type].kind === e.kind);
      if (!s) { s = section(Object.keys(SECTIONS).find(k => SECTIONS[k].kind === e.kind)); c.sections.push(s) }
      setElement(c, s, e.id); save(); closeSheet(); go('plan', { id: c.id });
    }
  },
  editSection(b) { openEditor({ type: 'section', classId: V.id, sectionId: b.dataset.s }) },
  moveUp(b) { const ss = cur().sections, i = ss.findIndex(s => s.id === b.dataset.s); if (i > 0) { [ss[i - 1], ss[i]] = [ss[i], ss[i - 1]]; save(); scrollKeep(render) } },
  moveDown(b) { const ss = cur().sections, i = ss.findIndex(s => s.id === b.dataset.s); if (i < ss.length - 1) { [ss[i + 1], ss[i]] = [ss[i], ss[i + 1]]; save(); scrollKeep(render) } },
  rmSection(b) { const c = cur(), s = secOf(b); if (confirm(`Remove “${s.label}” from this class?`)) { c.sections = c.sections.filter(x => x !== s); save(); scrollKeep(render) } },
  addSection(b) {
    sheet(`<h2>Add a section</h2><p class="small muted">Mix in another element — a second AMRAP, an extra finisher, a custom block.</p>
      ${Object.entries(SECTIONS).filter(([k]) => k !== 'decade').map(([k, d]) => `<button class="ghost wide" style="text-align:left;margin-top:8px" data-act="addSectionType" data-t="${k}"><b>${d.label}</b>${d.kind ? `<span class="small muted"> — from ${KINDS[d.kind].name.toLowerCase()}</span>` : ''}</button>`).join('')}`);
  },
  addSectionType(b) {
    const c = cur(), t = b.dataset.t, s = section(t, t === 'custom' ? { custom: { name: '', ref: '', body: [] } } : {});
    if (t === 'ancillary') { s.week = cycleWeek(c.date); s.focus = D.settings.cycleFocus }
    const closeAt = c.sections.findIndex(x => x.type === 'closing');
    c.sections.splice(closeAt < 0 ? c.sections.length : closeAt, 0, s);
    save(); closeSheet();
    if (SECTIONS[t].kind) { const p = suggest(SECTIONS[t].kind, c.date); if (p) setElement(c, s, p.id); save(); render() }
    else openEditor({ type: 'section', classId: c.id, sectionId: s.id });
  },
  classMenu(b) {
    sheet(`<h2>${esc(classTitle(cur()))}</h2>
      <button class="ghost wide" style="margin-top:12px" data-act="classDetails">Edit date, time, title & coach</button>
      <button class="ghost wide" style="margin-top:8px" data-act="refill">Re-suggest every element</button>
      <button class="ghost wide" style="margin-top:8px" data-act="copyText">Copy as text (for Google Docs)</button>
      <button class="ghost wide" style="margin-top:8px" data-act="print">Print class sheet</button>
      <button class="ghost wide" style="margin-top:8px" data-act="dupClass">Duplicate class</button>
      <button class="danger wide" style="margin-top:8px" data-act="delClass">Delete class</button>`);
  },
  classDetails() {
    const c = cur();
    sheet(`<h2>Class details</h2>
      <label class="field">Title (optional — defaults to the AMRAP name)<input id="cdTitle" value="${esc(c.title)}"></label>
      <div class="grid2"><label class="field">Date<input type="date" id="cdDate" value="${c.date}"></label><label class="field">Time<input type="time" id="cdTime" value="${c.time}"></label></div>
      <div class="grid2"><label class="field">Coach<input id="cdCoach" value="${esc(c.coach)}"></label><label class="field">Location<input id="cdLoc" value="${esc(c.location)}"></label></div>
      <div class="row end"><button class="ghost" data-act="close">Cancel</button><button class="primary" data-act="saveDetails">Save</button></div>`);
  },
  saveDetails() { const c = cur(); Object.assign(c, { title: $('#cdTitle').value.trim(), date: $('#cdDate').value || c.date, time: $('#cdTime').value, coach: $('#cdCoach').value.trim(), location: $('#cdLoc').value.trim() }); save(); closeSheet(); render() },
  refill() { if (!confirm('Replace every element in this class with fresh suggestions? Your custom sections stay.')) return; const c = cur(); c.sections.filter(s => !s.custom).forEach(s => { s.elementId = null }); autofill(c); save(); closeSheet(); render() },
  async copyText() { try { await navigator.clipboard.writeText(classText(cur())); toast('Copied — paste it into a Google Doc') } catch (e) { toast('Could not copy on this device') } closeSheet() },
  print() { closeSheet(); setTimeout(() => window.print(), 50) },
  dupClass() { closeSheet(); newClassSheet(ymd(addDays(parseYmd(cur().date), 7))); $('#ncFill').value = V.id },
  delClass() { if (!confirm('Delete this class, including its attendance and scores?')) return; D.classes = D.classes.filter(c => c.id !== V.id); save(); closeSheet(); back() },
  run(b) { T = null; go('run', { id: b.dataset.id, i: 0 }); keepAwake() },
  runNext() { T = null; V.i++; render(); window.scrollTo(0, 0) },
  runPrev() { T = null; V.i--; render(); window.scrollTo(0, 0) },
  tStart() { beep(880, .3); T = { end: Date.now() + timerLeft() * 1000, paused: false }; render() },
  tPause() { T = { left: timerLeft(), paused: true }; render() },
  tResume() { T = { end: Date.now() + T.left * 1000, paused: false }; render() },
  tReset() { T = null; render() },
  log(b) { if (V.view === 'run') { V = stack.pop() || V } go('log', { id: b.dataset.id }) },
  togglePresent(b) {
    const c = cur(), m = b.dataset.m, p = c.log.present;
    c.log.present = p.includes(m) ? p.filter(x => x !== m) : p.concat(m); save(); scrollKeep(render);
  },
  // library
  libKind(b) { libKind = b.dataset.k; libEquip = ''; render() },
  libEquip(b) { libEquip = libEquip === b.dataset.e ? '' : b.dataset.e; render() },
  openElement(b) { go('element', { id: b.dataset.id }) },
  newElement(b) { openEditor({ type: 'element', kind: libKind }); if (b.dataset.mix) borrowSheet() },
  editElement(b) { const e = el(b.dataset.id); openEditor({ type: 'element', id: e.id, kind: e.kind }) },
  dupElement(b) { const e = el(b.dataset.id); openEditor({ type: 'element', id: e.id, kind: e.kind, dup: true }) },
  restoreElement(b) { if (confirm('Throw away your edits and go back to the playbook version?')) { delete D.overrides[b.dataset.id]; dirtyLib(); save(); render() } },
  delElement(b) { if (confirm('Delete this element from the library? Classes that already use it keep their copy.')) { const e = el(b.dataset.id); D.classes.forEach(c => c.sections.forEach(s => { if (s.elementId === e.id) { s.custom = { name: e.name, ref: e.ref, body: e.body, from: e.id }; s.elementId = null } })); D.elements = D.elements.filter(x => x.id !== e.id); dirtyLib(); save(); back() } },
  useElement(b) {
    const up = sortedClasses().filter(c => c.date >= ymd()).reverse();
    sheet(`<h2>Use in which class?</h2>
      ${up.map(c => `<button class="ghost wide" style="text-align:left;margin-top:8px" data-act="useIn" data-c="${c.id}" data-id="${b.dataset.id}">${fmtDate(c.date)} · ${fmtTime(c.time)} — ${esc(classTitle(c))}</button>`).join('')}
      ${nextSlots(6).filter(s => !s.plan && s.program === 'ep').map(s => `<button class="ghost wide" style="text-align:left;margin-top:8px" data-act="useIn" data-date="${s.date}" data-time="${s.time}" data-id="${b.dataset.id}">New: ${fmtDate(s.date)} · ${fmtTime(s.time)} Elevated Prayer</button>`).join('')}
      <div class="row end"><button class="ghost" data-act="close">Cancel</button></div>`);
  },
  useIn(b) {
    let c = b.dataset.c && getClass(b.dataset.c);
    if (!c) { c = newClass(b.dataset.date, b.dataset.time, 'ep'); D.classes.push(c) }
    pick = { target: c.id }; actions.pickUse(b);
  },
  borrow() { readDraft(); borrowSheet() },
  borrowAdd(b) {
    const d = V.draft; d.body = (d.body.trim() ? d.body.replace(/\s*$/, '\n') : '') + b.dataset.t;
    const ta = $('#edBody'); if (ta) { ta.value = d.body; ta.rows = Math.min(18, d.body.split('\n').length + 2) }
    toast('Added: ' + b.dataset.t);
  },
  rmLift(b) { b.closest('.lrow').remove() },
  saveEdit() {
    const t = V.target, d = readDraft();
    if (t.type === 'section') {
      const c = getClass(t.classId), s = c.sections.find(x => x.id === t.sectionId), kind = SECTIONS[s.type].kind, orig = elementOf(s);
      s.label = d.label.trim() || SECTIONS[s.type].label; s.text = d.text.trim();
      if ($('#edBody')) {
        const changed = !orig || d.name !== orig.name || d.ref !== (orig.ref || '') || d.body !== bodyToText(orig.body);
        if ($('#edSaveLib')?.checked && kind) { const e = addCustomElement(kind, d, s.elementId); s.elementId = e.id; s.custom = null; toast('Saved to the library') }
        else if (changed) s.custom = { name: d.name.trim(), ref: d.ref.trim(), body: textToBody(d.body), from: s.custom?.from || s.elementId };
      }
      if (s.type === 'amrap') s.cap = parseInt($('#edCap').value) || D.settings.cap;
      if (s.type === 'breath') { s.ref = $('#edSRef').value.trim(); s.study = $('#edStudy').value.trim() }
      if (s.type === 'ancillary') {
        s.focus = $('#edFocus').value.trim(); s.week = parseInt($('#edWeek').value) || null; s.elementId = $('#edGroup').value;
        s.lifts = $$('#edLifts .lrow').map(r => ({ name: r.querySelector('.lname').value.trim(), scheme: r.querySelector('.lscheme').value.trim() })).filter(l => l.name);
      }
      save(); back(); return;
    }
    if (!d.name.trim()) { toast('Give it a name'); return }
    if (t.id && !t.dup) {
      const e = el(t.id);
      if (e.custom) Object.assign(e, { name: d.name.trim(), ref: d.ref.trim(), body: textToBody(d.body) });
      else D.overrides[e.id] = { name: d.name.trim(), ref: d.ref.trim(), body: textToBody(d.body) };
      dirtyLib(); save(); back(); toast('Saved');
    } else {
      const e = addCustomElement(t.kind, d, t.id); save(); V = stack.pop() || V; go('element', { id: e.id }); toast('Added to the library');
    }
  },
  // members
  addMember(b) { memberSheet(null, b.dataset.present) },
  editMember(b) { memberSheet(getMember(b.dataset.id)) },
  openMember(b) { go('member', { id: b.dataset.id }) },
  saveMember(b) {
    const name = $('#mName').value.trim(); if (!name) { toast('Enter a name'); return }
    const f = { name, email: $('#mEmail').value.trim(), phone: $('#mPhone').value.trim(), level: $('#mLevel').value, joined: $('#mJoined').value, notes: $('#mNotes').value.trim() };
    let m = b.dataset.id && getMember(b.dataset.id);
    if (m) Object.assign(m, f); else { m = { id: uid(), goals: [], ...f }; D.members.push(m) }
    const c = b.dataset.present && getClass(b.dataset.present);
    if (c && !c.log.present.includes(m.id)) c.log.present.push(m.id);
    save(); closeSheet(); scrollKeep(render); toast(c ? `${name} added and marked present` : 'Saved');
  },
  delMember(b) {
    if (!confirm('Remove this member and their scores from every class?')) return;
    const id = b.dataset.id; D.members = D.members.filter(m => m.id !== id);
    D.classes.forEach(c => { c.log.present = c.log.present.filter(x => x !== id); delete c.log.scores[id] });
    save(); closeSheet(); back();
  },
  addGoal(b) {
    sheet(`<h2>New goal</h2><label class="field">Goal<input id="gText" placeholder="e.g. 10 strict pushups · pray the rosary daily" autofocus></label>
      <label class="field">Kind<select id="gKind"><option value="fitness">Fitness</option><option value="faith">Faith</option></select></label>
      <div class="row end"><button class="ghost" data-act="close">Cancel</button><button class="primary" data-act="saveGoal" data-id="${b.dataset.id}">Add</button></div>`);
  },
  saveGoal(b) { const t = $('#gText').value.trim(); if (!t) return; const m = getMember(b.dataset.id); (m.goals = m.goals || []).push({ text: t, kind: $('#gKind').value, date: ymd(), done: false }); save(); closeSheet(); scrollKeep(render) },
  toggleGoal(b) { const g = getMember(b.dataset.id).goals[b.dataset.i]; g.done = !g.done; save(); scrollKeep(render); if (g.done) toast('Praise God! 🙌') },
  rmGoal(b) { getMember(b.dataset.id).goals.splice(b.dataset.i, 1); save(); scrollKeep(render) },
  // settings
  theme(b) { D.settings.theme = b.dataset.t; save(); applyTheme(); render() },
  export() { exportData() },
  import() { $('#importFile').click() },
  erase() { if (!confirm('Erase all classes, members and library edits on this device? This cannot be undone.')) return; localStorage.removeItem(KEY); load(); dirtyLib(); tabTo('today') },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]'); if (t) { tabTo(t.dataset.tab); return }
  const a = e.target.closest('[data-act]'); if (a && actions[a.dataset.act]) { e.preventDefault(); actions[a.dataset.act](a) }
});
let searchTimer;
document.addEventListener('input', e => {
  const t = e.target;
  const live = (fn, ms = 200) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { const pos = t.selectionStart; fn(); const n = document.getElementById(t.id); if (n) { n.focus(); n.setSelectionRange(pos, pos) } }, ms) };
  if (t.id === 'pickQ') { pick.q = t.value; live(pickerSheet); return }
  if (t.id === 'borrowQ') { live(() => borrowSheet(t.value)); return }
  if (t.id === 'libQ') { libQ = t.value; live(render); return }
  if (t.id === 'memQ') { memQ = t.value; live(render); return }
  if (t.id === 'logQ') { V.q = t.value; live(render); return }
  if (t.dataset.sc || t.dataset.lift) {
    const c = cur(), sc = c.log.scores[t.dataset.m] = c.log.scores[t.dataset.m] || {};
    if (t.dataset.lift) { sc.lifts = sc.lifts || {}; const l = sc.lifts[t.dataset.lift] = sc.lifts[t.dataset.lift] || {}; l[t.dataset.k] = num(t.value) }
    else sc[t.dataset.sc] = t.dataset.sc === 'note' ? t.value : t.dataset.sc === 'scaled' ? !!t.value : num(t.value);
    save();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'memLift') { memLift = t.value; scrollKeep(render); return }
  if (t.id === 'edLiftPick' && t.value) {
    const name = t.value === '__other' ? prompt('Lift name') : t.value;
    if (name) { const s = getClass(V.target.classId).sections.find(x => x.id === V.target.sectionId); $('#edLifts').insertAdjacentHTML('beforeend', liftRow({ name, scheme: phaseOf(parseInt($('#edWeek').value))?.scheme || '3×10' })) }
    t.value = ''; return;
  }
  if (t.id === 'edGroup') { readDraft(); const s = getClass(V.target.classId).sections.find(x => x.id === V.target.sectionId); s.elementId = t.value; scrollKeep(render); return }
  if (t.id === 'importFile' && t.files[0]) {
    t.files[0].text().then(txt => {
      const d = JSON.parse(txt);
      if (!d || !Array.isArray(d.classes) || !Array.isArray(d.members)) throw new Error('bad file');
      if (!confirm(`Replace everything on this device with this backup (${d.classes.length} classes, ${d.members.length} members)?`)) return;
      const base = defaults(); D = { ...base, ...d, settings: { ...base.settings, ...d.settings }, seeded: true };
      dirtyLib(); save(); applyTheme(); tabTo('today'); toast('Backup restored');
    }).catch(() => toast("That file isn't a Laudate Coach backup")).finally(() => t.value = '');
    return;
  }
  const k = t.dataset.set; if (!k) return;
  D.settings[k] = k === 'cap' ? (parseInt(t.value) || 20) : t.value.trim(); save(); render(); toast('Saved');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet() });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && V.view === 'run') keepAwake() });

load(); applyTheme(); render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
