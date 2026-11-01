"""Turn the Laudate Playbook (Google Doc exported as markdown) into library.js for the coach app.

Usage: python3 -I parse_playbook.py playbook.md out/library.js
"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8').read()
lines = text.split('\n')


def clean(s):
    s = s.replace('\\!', '!').replace('\\#', '#').replace('\\*', '*').replace('\\[', '[').replace('\\]', ']')
    s = s.replace('\\-', '-').replace('\\_', '_').replace('\\.', '.').replace('\\\\', '')
    s = re.sub(r'\*\*|__', '', s)
    s = re.sub(r'(?<!\w)\*(?!\s)([^*]+?)\*(?!\w)', r'\1', s)
    s = s.replace(' ', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def section(start_pat, end_pat):
    s = next(i for i, l in enumerate(lines) if re.search(start_pat, l))
    e = next(i for i in range(s + 1, len(lines)) if re.search(end_pat, lines[i]))
    return lines[s + 1:e]


def body_lines(raw):
    """Markdown list/table/paragraph lines -> [{t, d}] (d = indent depth, -1 = table row)."""
    res = []
    for l in raw:
        if not l.strip() or '<!-- end list -->' in l or re.fullmatch(r'\s*[—\-_\\]{6,}\s*', l):
            continue
        if l.lstrip().startswith('|'):
            cells = [clean(c) for c in l.strip().strip('|').split('|')]
            if all(re.fullmatch(r':?-+:?', c) or c == '' for c in cells):
                continue
            res.append({'t': ' | '.join(cells), 'd': -1})
            continue
        m = re.match(r'^(\s*)(?:[-*]|\d+\.)\s+(.*)$', l)
        if m:
            depth = max(0, (len(m.group(1)) - 2) // 4)
            t = clean(m.group(2))
        else:
            depth, t = 0, clean(l)
            if t:
                t = '¶' + t  # plain paragraph (coach note)
        if t and t != '¶':
            res.append({'t': t, 'd': depth})
    return res


OPT = re.compile(r'^\s*\*{0,2}OPTION:?\s*(\d+)\s*:?\s*(.*)$')


def split_options(raw):
    items, cur = [], None
    for l in raw:
        m = OPT.match(l)
        if m:
            cur = {'num': int(m.group(1)), 'head': clean(m.group(2)), 'raw': []}
            items.append(cur)
        elif cur is not None:
            cur['raw'].append(l)
    return items


EQUIP = {
    'Kettlebell': r'\bKB\b|kettlebell', 'Dumbbell': r'\bDBs?\b|dumbbell', 'Med ball': r'med ?ball',
    'Slam ball': r'slam ?ball|ball slam', 'Battle ropes': r'rope swing|double rope|battle rope|\bropes?\b',
    'Hurdles': r'hurdle', 'Agility ladder': r'\bladders?\b(?! breathing)', 'Barbell': r'barbell',
    'Plates': r'\bplates?\b|plated', 'Bands': r'\bbands?\b', 'Rings': r'\brings?\b', 'Sled': r'\bsled\b',
    'Box': r'\bbox(es)?\b|step.?up', 'Sandbag': r'sand ?bag', 'Wall ball': r'wall ball',
}
SEASONS = {
    'Advent': r'advent', 'Christmas': r'christmas|nativity|bethlehem', 'Epiphany': r'epiphany|magi|wise men',
    'Lent': r'\blent|ash wednesday|wilderness|temptation', 'Holy Week': r'holy week|palm sunday|good friday|golgotha|passion|holy saturday',
    'Easter': r'easter|risen|resurrection|empty tomb', 'Pentecost': r'pentecost|tongues of fire',
    'All Saints': r'all saints|cloud of witnesses', 'Thanksgiving': r'thanksgiving',
}
REF = re.compile(r'\(((?:[1-3] )?[A-Z][a-z]+\.?(?: of [A-Z][a-z]+)?(?: [A-Z][a-z]+)? ?\d+[^)]*)\)')
BOOKS = r'Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Tobit|Judith|Esther|Maccabees|Job|Psalms?|Proverbs?|Ecclesiastes|Song|Wisdom|Sirach|Isaiah|Jeremiah|Lamentations|Baruch|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation'
REF_ANY = re.compile(r'\b((?:[1-3] )?(?:' + BOOKS + r')\.? ?\d+(?:[:\-–,]\s?\d+[a-z]?)*(?:[-–]\d+(?::\d+)?)?)')


def tags_for(text, table):
    return [k for k, p in table.items() if re.search(p, text, re.I)]


def parse_head(head):
    """'Formed by the Beatitudes (Matthew 5:1-12) (Pentecost Theme)- ' -> name, ref, variant."""
    h = head.strip().rstrip('-–: ').strip()
    ref = ''
    m = REF_ANY.search(h)
    if m:
        ref = m.group(1).strip()
    variant = ''
    vm = re.search(r'[-–]?\s*\b(Al\w*nat\w*|Alt\b\.?)(\s*#?\d+)?', h, re.I)
    if vm:
        variant = 'Alternative' + ((' ' + re.sub(r'\D', '', vm.group(0))) if re.search(r'\d', vm.group(0)) else '')
    name = re.sub(r'\([^)]*\)', '', h)
    name = re.sub(r'[-–]?\s*\b(Al\w*nat\w*|Alt\b\.?)\s*#?\d*', ' ', name, flags=re.I)
    name = re.sub(r'\s+', ' ', name)
    name = re.sub(r'[-–:]\s*$', '', name.strip()).strip(' -–:')
    extra = [x.strip() for x in re.findall(r'\(([^)]*)\)', h) if not REF_ANY.search(x)]
    return name or h, ref, variant, extra


lib = []


def add(kind, num, head, raw, extra_text=''):
    name, ref, variant, notes = parse_head(head)
    body = body_lines(raw)
    joined = ' '.join([head] + [b['t'] for b in body])
    if not ref:
        m = REF_ANY.search(' '.join(b['t'] for b in body[:3]))
        ref = m.group(1) if m else ''
    item = {
        'id': f'{kind}-{num}' + ('-' + re.sub(r'\W+', '', variant).lower() if variant else ''),
        'kind': kind, 'num': num, 'name': name, 'ref': ref, 'variant': variant,
        'notes': notes, 'body': body,
        'equipment': tags_for(joined, EQUIP), 'seasons': tags_for(joined, SEASONS),
    }
    # de-dupe identical ids (the doc repeats a few options)
    ids = {x['id'] for x in lib}
    base, n = item['id'], 2
    while item['id'] in ids:
        item['id'] = f'{base}-{n}'
        n += 1
    lib.append(item)


# AMRAPs
for o in split_options(section(r'^### \*\*AMRAP', r'^### \*\*Breathing')):
    add('amrap', o['num'], o['head'], o['raw'])

# Finishers
for o in split_options(section(r'^### \*\*Finishers', r'^## \*\*\(Current Lease')):
    add('finisher', o['num'], o['head'], o['raw'])

# Ancillary groups: each movement (depth 0) becomes a lift with its coaching cue (depth 1+)
for o in split_options(section(r'^### \*\*Ancillary', r'^### \*\*Unison')):
    group = clean(o['head'])
    body = body_lines(o['raw'])
    lifts, cur = [], None
    for b in body:
        if b['d'] == 0 and not b['t'].startswith('¶'):
            cur = {'name': b['t'], 'cues': []}
            lifts.append(cur)
        elif cur:
            cur['cues'].append(b['t'].lstrip('¶'))
    lib.append({'id': f'ancillary-{o["num"]}', 'kind': 'ancillary', 'num': o['num'], 'name': group, 'ref': '',
                'variant': '', 'notes': [], 'body': body, 'lifts': lifts,
                'equipment': tags_for(' '.join(b['t'] for b in body), EQUIP), 'seasons': []})

# Unison prayers (one paragraph each)
for o in split_options(section(r'^### \*\*Unison', r'^### \*\*Finishers')):
    t = clean(' '.join([o['head']] + o['raw']))
    words = re.split(r'[.!]', t)[0].split()
    first = ' '.join(words[:6]).rstrip(',') + ('…' if len(words) > 6 else '')
    lib.append({'id': f'prayer-{o["num"]}', 'kind': 'prayer', 'num': o['num'], 'name': first, 'ref': '', 'variant': '',
                'notes': [], 'body': [{'t': '¶' + t, 'd': 0}], 'equipment': [], 'seasons': tags_for(t, SEASONS)})

# Breathing prayers: the "Breathing Exercises to Practice" bullets
br = body_lines(section(r'^### \*\*Breathing', r'^### \*\*Ancillary'))
guide, techniques, inside, cur = [], [], False, None
for b in br:
    if b['t'].startswith('Breathing Exercises to Practice'):
        inside = True
        continue
    if not inside:
        guide.append(b)
        continue
    if b['d'] == 1:
        name, _, how = b['t'].partition(':')
        cur = {'name': name.strip(), 'body': ([{'t': how.strip(), 'd': 0}] if how.strip() else []) + []}
        techniques.append(cur)
    elif cur:
        cur['body'].append({'t': b['t'], 'd': b['d'] - 2})
for i, t in enumerate(techniques, 1):
    lib.append({'id': f'breath-{i}', 'kind': 'breath', 'num': i, 'name': t['name'], 'ref': '', 'variant': '',
                'notes': [], 'body': t['body'], 'equipment': [], 'seasons': tags_for(' '.join(x['t'] for x in t['body']), SEASONS)})

# Warmup moves (the standard playbook warmup, each line selectable)
wu = body_lines(section(r'^### \*\*Warmup', r'^### \*\*AMRAP'))
lib.append({'id': 'warmup-1', 'kind': 'warmup', 'num': 1, 'name': 'Standard Laudate Warmup (bands + mobility)', 'ref': '',
            'variant': '', 'notes': [], 'body': [b for b in wu if not b['t'].startswith('¶')], 'equipment': ['Bands'], 'seasons': []})

# Class structure + equipment list (reference)
structure = [clean(re.sub(r'^\d+\.\s*', '', l)) for l in section(r'Group \(Class\) Overall Training Structure:\*\*$', r'^## \*\*Main Workouts') if re.match(r'^\d+\.', l.strip())]
equip_raw = section(r'^## \*\*\(Current Lease\) Full Equipment', r'^WORK IN PROGRESS')
equipment, cat = {}, 'Other'
for l in equip_raw:
    t = clean(l)
    if not t or t.startswith('~~'):
        continue
    if t in ('CARDIO', 'MACHINES', 'FREE WEIGHT', 'EQUIPMENT'):
        cat = t.title()
        equipment[cat] = []
    else:
        equipment.setdefault(cat, []).append(t)

js = ('/* Generated from the Laudate Playbook (Google Drive) by parse_playbook.py — edit elements in the app, not here. */\n'
      'window.LAUDATE_LIBRARY = ' + json.dumps({
          'source': 'Laudate Playbook', 'structure': structure, 'breathGuide': guide,
          'equipment': equipment, 'elements': lib}, ensure_ascii=False, indent=0) + ';\n')
open(out, 'w', encoding='utf-8').write(js)
from collections import Counter
print(Counter(x['kind'] for x in lib))
print('no-ref amraps:', sum(1 for x in lib if x['kind'] == 'amrap' and not x['ref']))
