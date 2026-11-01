/* Laudate Playbook → Laudate Coach, automatically.
 *
 * Runs in Google Apps Script under the owner's Google account. Every hour it checks whether the Laudate Playbook
 * Google Doc has changed; if so it reads the doc, turns it into the app's library (the same conversion as
 * tools/parse_playbook.py) and writes it to team/laudate/playbook/current in the laudate-coach Firestore database.
 * Coaches' apps pick the new version up on their own. If the result looks wrong (a section came out empty or much
 * smaller than last time, usually because a heading was renamed), nothing is uploaded and the owner gets an email.
 *
 * Setup: see tools/apps-script/README.md. Run `setup` once; after that it runs by itself.
 */
const PLAYBOOK_DOC_ID = '1kan0kGH5zsTRH8miY0oXxmV-k3U4ayj9-MQXCGbMZmA';
const FIREBASE_PROJECT = 'laudate-coach';
const CHECK_EVERY_HOURS = 1;

/** Run once: checks the doc now and schedules the hourly check. */
function setup() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'updatePlaybook').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('updatePlaybook').timeBased().everyHours(CHECK_EVERY_HOURS).create();
  updatePlaybook(true);
}

/** Uploads the playbook if the doc changed since the last upload (or always, when force is true). */
function updatePlaybook(force) {
  const props = PropertiesService.getScriptProperties();
  const modified = DriveApp.getFileById(PLAYBOOK_DOC_ID).getLastUpdated().toISOString();
  if (force !== true && props.getProperty('docModified') === modified) return 'unchanged';

  const lib = parsePlaybook(exportMarkdown_(PLAYBOOK_DOC_ID));
  const counts = countKinds(lib);
  const previous = JSON.parse(props.getProperty('counts') || '{}');
  const problems = checkLibrary(counts, previous);
  if (problems.length) {
    // tell the owner once per doc version, not every hour
    if (props.getProperty('warnedFor') !== modified) {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Laudate Coach: playbook not updated',
        'The Laudate Playbook changed, but the app was not updated because:\n\n- ' + problems.join('\n- ') +
        '\n\nThis usually means a section heading (AMRAP, Finishers, Unison Prayers, Breathing, Ancillary Movements, Warmup) ' +
        'or the "OPTION 12: Name" lines were renamed. Coaches keep the previous version until it is fixed.\n\n' +
        'Doc: https://docs.google.com/document/d/' + PLAYBOOK_DOC_ID + '/edit');
      props.setProperty('warnedFor', modified);
    }
    console.warn('Not uploaded: ' + problems.join('; '));
    return 'refused';
  }

  writeFirestore_('team/laudate/playbook/current', {
    updated: Date.now(), deleted: false, by: Session.getEffectiveUser().getEmail().toLowerCase(),
    data: { sig: signature(lib), source: 'google-doc', docModified: modified, lib: lib },
  });
  props.setProperties({ docModified: modified, counts: JSON.stringify(counts) });
  props.deleteProperty('warnedFor');
  console.log('Uploaded playbook: ' + JSON.stringify(counts));
  return 'uploaded';
}

function exportMarkdown_(id) {
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const urls = ['https://docs.google.com/document/d/' + id + '/export?format=md',
    'https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text%2Fmarkdown'];
  let last;
  for (const url of urls) {
    const res = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return res.getContentText('UTF-8');
    last = res.getResponseCode() + ' ' + res.getContentText().slice(0, 200);
  }
  throw new Error('Could not read the playbook doc: ' + last);
}

// Writes as the owner, through Google Cloud permissions (the app's security rules apply to coaches, not to this).
function writeFirestore_(path, obj) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/%28default%29/documents/' + path;
  const res = UrlFetchApp.fetch(url, {
    method: 'patch', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': FIREBASE_PROJECT },
    payload: JSON.stringify({ fields: toFields(obj) }),
  });
  if (res.getResponseCode() !== 200) throw new Error('Firestore refused the upload: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 500));
}

/* ---------- everything below is plain JavaScript (no Apps Script calls), so it can be tested with Node ---------- */

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(o) { const f = {}; Object.keys(o).forEach(k => { if (o[k] !== undefined) f[k] = toValue(o[k]) }); return f }

function countKinds(lib) { const c = {}; lib.elements.forEach(e => { c[e.kind] = (c[e.kind] || 0) + 1 }); return c }
function checkLibrary(counts, previous) {
  const problems = [];
  ['amrap', 'finisher', 'prayer', 'breath', 'ancillary', 'warmup'].forEach(k => {
    const n = counts[k] || 0, before = previous[k] || 0;
    if (!n) problems.push(`no ${k} elements were found`);
    else if (before && n < before * 0.8) problems.push(`only ${n} ${k} elements were found (last time ${before})`);
  });
  return problems;
}
function signature(lib) {
  const t = JSON.stringify(lib); let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + '-' + t.length;
}

/* The conversion itself — keep in step with tools/parse_playbook.py. */
function cleanText(s) {
  s = s.replace(/\\!/g, '!').replace(/\\#/g, '#').replace(/\\\*/g, '*').replace(/\\\[/g, '[').replace(/\\\]/g, ']')
    .replace(/\\-/g, '-').replace(/\\_/g, '_').replace(/\\\./g, '.').replace(/\\\\/g, '').replace(/\\([^\w\s])/g, '$1');
  s = s.replace(/\*\*|__/g, '');
  s = s.replace(/(^|[^\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1$2');
  s = s.replace(/ /g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const BOOKS = 'Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Tobit|Judith|Esther|Maccabees|Job|Psalms?|Proverbs?|Ecclesiastes|Song|Wisdom|Sirach|Isaiah|Jeremiah|Lamentations|Baruch|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation';
const REF_ANY = new RegExp('\\b((?:[1-3] )?(?:' + BOOKS + ')\\.? ?\\d+(?:[:\\-–,]\\s?\\d+[a-z]?)*(?:[-–]\\d+(?::\\d+)?)?)');
const EQUIP = {
  'Kettlebell': /\bKB\b|kettlebell/i, 'Dumbbell': /\bDBs?\b|dumbbell/i, 'Med ball': /med ?ball/i,
  'Slam ball': /slam ?ball|ball slam/i, 'Battle ropes': /rope swing|double rope|battle rope|\bropes?\b/i,
  'Hurdles': /hurdle/i, 'Agility ladder': /\bladders?\b(?! breathing)/i, 'Barbell': /barbell/i,
  'Plates': /\bplates?\b|plated/i, 'Bands': /\bbands?\b/i, 'Rings': /\brings?\b/i, 'Sled': /\bsled\b/i,
  'Box': /\bbox(es)?\b|step.?up/i, 'Sandbag': /sand ?bag/i, 'Wall ball': /wall ball/i,
};
const SEASONS = {
  'Advent': /advent/i, 'Christmas': /christmas|nativity|bethlehem/i, 'Epiphany': /epiphany|magi|wise men/i,
  'Lent': /\blent|ash wednesday|wilderness|temptation/i, 'Holy Week': /holy week|palm sunday|good friday|golgotha|passion|holy saturday/i,
  'Easter': /easter|risen|resurrection|empty tomb/i, 'Pentecost': /pentecost|tongues of fire/i,
  'All Saints': /all saints|cloud of witnesses/i, 'Thanksgiving': /thanksgiving/i,
};
const tagsFor = (text, table) => Object.keys(table).filter(k => table[k].test(text));

function parsePlaybook(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const heading = word => new RegExp('^#{1,4}\\s.*' + word, 'i');
  function section(start, end) {
    const s = lines.findIndex(l => start.test(l));
    if (s < 0) return [];
    let e = lines.findIndex((l, i) => i > s && end.test(l));
    if (e < 0) e = lines.length;
    return lines.slice(s + 1, e);
  }
  // List depth comes from how far each bullet is indented compared with the bullets above it, because Google's
  // export indents checklist items further than plain bullets.
  function bodyLines(raw) {
    const res = [], stack = [];
    raw.forEach(l => {
      if (!l.trim() || l.includes('<!-- end list -->') || /^\s*[—\-_\\]{6,}\s*$/.test(l)) return;
      if (/^\s*\|/.test(l)) {
        const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(cleanText);
        if (cells.every(c => /^:?-+:?$/.test(c) || c === '')) return;
        res.push({ t: cells.join(' | '), d: -1 });
        return;
      }
      const m = l.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/);
      let depth, t;
      if (m) {
        const w = m[1].replace(/\t/g, '  ').length;
        while (stack.length && stack[stack.length - 1] > w) stack.pop();
        if (!stack.length || stack[stack.length - 1] < w) stack.push(w);
        depth = stack.length - 1; t = cleanText(m[2].replace(/^\[[ xX]\]\s+/, ''));
      } else { depth = 0; t = cleanText(l); if (t) t = '¶' + t; stack.length = 0 }
      if (t && t !== '¶') res.push({ t, d: depth });
    });
    return res;
  }
  const OPT = /^\s*\*{0,2}OPTION:?\s*(\d+)\s*:?\s*(.*)$/;
  function splitOptions(raw) {
    const items = []; let cur = null;
    raw.forEach(l => {
      const m = l.match(OPT);
      if (m) { cur = { num: +m[1], head: cleanText(m[2]), raw: [] }; items.push(cur) }
      else if (cur) cur.raw.push(l);
    });
    return items;
  }
  function parseHead(head) {
    const h = head.trim().replace(/[-–:\s]+$/, '').trim();
    const rm = h.match(REF_ANY), ref = rm ? rm[1].trim() : '';
    let variant = '';
    const vm = h.match(/[-–]?\s*(Al\w*nat\w*|Alt\.?)(\s*#?\d+)?/i);
    if (vm) variant = 'Alternative' + (/\d/.test(vm[0]) ? ' ' + vm[0].replace(/\D/g, '') : '');
    let name = h.replace(/\([^)]*\)/g, '').replace(/[-–]?\s*(Al\w*nat\w*|Alt\.?)\s*#?\d*/gi, ' ').replace(/\s+/g, ' ');
    name = name.trim().replace(/[-–:]\s*$/, '').replace(/^[\s\-–:]+|[\s\-–:]+$/g, '');
    const notes = (h.match(/\(([^)]*)\)/g) || []).map(x => x.slice(1, -1).trim()).filter(x => !REF_ANY.test(x));
    return { name: name || h, ref, variant, notes };
  }

  const lib = [];
  const ids = new Set();
  function uniqueId(base) { let id = base, n = 2; while (ids.has(id)) id = base + '-' + n++; ids.add(id); return id }
  function add(kind, num, head, raw) {
    const p = parseHead(head), body = bodyLines(raw);
    const joined = [head].concat(body.map(b => b.t)).join(' ');
    let ref = p.ref;
    if (!ref) { const m = body.slice(0, 3).map(b => b.t).join(' ').match(REF_ANY); ref = m ? m[1] : '' }
    lib.push({
      id: uniqueId(kind + '-' + num + (p.variant ? '-' + p.variant.replace(/\W+/g, '').toLowerCase() : '')),
      kind, num, name: p.name, ref, variant: p.variant, notes: p.notes, body,
      equipment: tagsFor(joined, EQUIP), seasons: tagsFor(joined, SEASONS),
    });
  }

  splitOptions(section(heading('\\*\\*AMRAP'), heading('Breathing'))).forEach(o => add('amrap', o.num, o.head, o.raw));
  splitOptions(section(heading('\\*\\*Finishers'), heading('Equipment List'))).forEach(o => add('finisher', o.num, o.head, o.raw));

  splitOptions(section(heading('Ancillary Movements'), heading('Unison'))).forEach(o => {
    const body = bodyLines(o.raw), lifts = []; let cur = null;
    body.forEach(b => {
      if (b.d === 0 && !b.t.startsWith('¶')) { cur = { name: b.t, cues: [] }; lifts.push(cur) }
      else if (cur) cur.cues.push(b.t.replace(/^¶/, ''));
    });
    lib.push({ id: uniqueId('ancillary-' + o.num), kind: 'ancillary', num: o.num, name: cleanText(o.head), ref: '', variant: '', notes: [], body, lifts,
      equipment: tagsFor(body.map(b => b.t).join(' '), EQUIP), seasons: [] });
  });

  splitOptions(section(heading('Unison Prayers'), heading('\\*\\*Finishers'))).forEach(o => {
    const t = cleanText([o.head].concat(o.raw).join(' '));
    const words = t.split(/[.!]/)[0].split(/\s+/);
    const first = words.slice(0, 6).join(' ').replace(/,$/, '') + (words.length > 6 ? '…' : '');
    lib.push({ id: uniqueId('prayer-' + o.num), kind: 'prayer', num: o.num, name: first, ref: '', variant: '', notes: [], body: [{ t: '¶' + t, d: 0 }], equipment: [], seasons: tagsFor(t, SEASONS) });
  });

  const br = bodyLines(section(heading('Breathing'), heading('Ancillary Movements')));
  const guide = [], techniques = []; let inside = false, cur = null;
  br.forEach(b => {
    if (b.t.startsWith('Breathing Exercises to Practice')) { inside = true; return }
    if (!inside) { guide.push(b); return }
    if (b.d === 1) {
      const i = b.t.indexOf(':'), name = i < 0 ? b.t : b.t.slice(0, i), how = i < 0 ? '' : b.t.slice(i + 1).trim();
      cur = { name: name.trim(), body: how ? [{ t: how, d: 0 }] : [] }; techniques.push(cur);
    } else if (cur) cur.body.push({ t: b.t, d: b.d - 2 });
  });
  techniques.forEach((t, i) => lib.push({ id: 'breath-' + (i + 1), kind: 'breath', num: i + 1, name: t.name, ref: '', variant: '', notes: [], body: t.body, equipment: [], seasons: tagsFor(t.body.map(x => x.t).join(' '), SEASONS) }));

  const wu = bodyLines(section(heading('\\*\\*Warmup'), heading('\\*\\*AMRAP')));
  lib.push({ id: 'warmup-1', kind: 'warmup', num: 1, name: 'Standard Laudate Warmup (bands + mobility)', ref: '', variant: '', notes: [], body: wu.filter(b => !b.t.startsWith('¶')), equipment: ['Bands'], seasons: [] });

  const structure = section(heading('Overall Training Structure'), heading('Main Workouts'))
    .filter(l => /^\s*\d+\./.test(l)).map(l => cleanText(l.replace(/^\s*\d+\.\s*/, '')));
  const equipment = {}; let cat = 'Other';
  section(heading('Equipment List'), /^\s*(#{1,4}\s.*)?WORK IN PROGRESS/i).forEach(l => {
    const t = cleanText(l);
    if (!t || t.startsWith('~~')) return;
    if (['CARDIO', 'MACHINES', 'FREE WEIGHT', 'EQUIPMENT'].includes(t)) { cat = t.charAt(0) + t.slice(1).toLowerCase().replace(/ (\w)/g, (m, c) => ' ' + c.toUpperCase()); equipment[cat] = [] }
    else (equipment[cat] = equipment[cat] || []).push(t);
  });

  return { source: 'Laudate Playbook', structure, breathGuide: guide, equipment, elements: lib };
}

if (typeof module !== 'undefined') module.exports = { parsePlaybook, countKinds, checkLibrary, signature, toFields };
