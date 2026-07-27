#!/usr/bin/env python3
"""Generate golden fixture payloads from the FY2027 final-roll extract.

These six fixtures are the schema contract for WS1a/WS1b (viz) and the
reproduction target for WS2 (production ETL): the production pipeline must
emit byte-identical payloads for these blocks or change them via reviewed
diff. Rules implemented here mirror PLAN.md (E-1..E-5, D-1, D-8, condo
rule): drop only zero-value class-R0 pointer rows; group condo-range lots
(>=1001) by (boro, block, low(housenum), street); never merge on a blank
key; owner 40-char repair; tail-group beyond 120 groups protecting club
groups; character class; club = group CONTAINS a raw lot > $50M.
Ranks/percentiles are 0 here (production ETL fills them citywide).
"""
import csv, glob, json, math, re, sys, collections, hashlib

RAW = sorted(glob.glob('/Users/hareeshnagaraj/Development/pedaterre/data/raw/fy2027-final-page-*.csv'))
OUT = '/Users/hareeshnagaraj/Development/pedaterre/data/fixtures'
BORO = {'1': 'MN', '2': 'BX', '3': 'BK', '4': 'QN', '5': 'SI'}
TAIL = 120
csv.field_size_limit(10**7)


def repair_owner(o):
    """E-1: rejoin the 40-char fixed-width split when it lands mid-word."""
    if len(o) > 41 and o[40] == ' ':
        a, b = o[:40], o[41:]
        if a and b and a[-1] != ' ' and b[:1] != ' ' and not a.endswith((' AND', ' OF', ' THE', '&')):
            return a + b
    return o


def low_housenum(hn):
    """E-4: normalize range/hyphenated house numbers to their low end."""
    m = re.match(r'\s*([0-9]+)', hn or '')
    return m.group(1) if m else (hn or '').strip()


def load_block(boro, block):
    rows = []
    for f in RAW:
        with open(f, newline='', encoding='utf-8') as fh:
            for row in csv.DictReader(fh):
                if row['boro'] == boro and row['block'] == block:
                    rows.append(row)
    return rows


def build_payload(boro, block, rows, extract_hash):
    groups = collections.OrderedDict()
    billing = {}          # zero-value R0 pointer lots: lot -> (housenum, street)
    n_lots = 0
    for row in rows:
        lot = int(row['lot'] or -1)
        mv = float(row['curmkttot'] or 0)
        cls = (row.get('bldg_class') or '').strip()
        hn, st = (row['housenum_lo'] or '').strip(), (row['street_name'] or '').strip()
        if cls == 'R0' and mv == 0:
            billing[lot] = (low_housenum(hn), st)
            continue
        n_lots += 1
        if lot >= 1001 and hn and st:
            key = ('C', low_housenum(hn), st)
        else:
            key = ('F', lot)          # E-3: blank key parts never merge
        g = groups.setdefault(key, {
            'mv': 0.0, 'n': 0, 'owners': set(), 'lot': lot,
            'hn': low_housenum(hn), 'st': st, 'maxRawLot': 0.0, 'zero': True,
        })
        g['mv'] += mv
        g['n'] += 1
        g['owners'].add(repair_owner(row['owner'] or ''))
        g['maxRawLot'] = max(g['maxRawLot'], mv)
        if mv > 0:
            g['zero'] = False

    items = sorted(groups.items(), key=lambda kv: -kv[1]['mv'])
    if len(items) > TAIL:
        protected = [kv for kv in items if kv[1]['maxRawLot'] > 50e6]
        rest = [kv for kv in items if kv[1]['maxRawLot'] <= 50e6]
        keep = protected + rest[:TAIL - 1 - len(protected)]
        tail = rest[TAIL - 1 - len(protected):]
        tail_mv = sum(kv[1]['mv'] for kv in tail)
        tail_n = sum(kv[1]['n'] for kv in tail)
        items = keep + [(('T', -1), {'mv': tail_mv, 'n': tail_n, 'owners': {'other lots'},
                                     'lot': -1, 'hn': '', 'st': '', 'maxRawLot': 0.0, 'zero': tail_mv == 0})]

    side = max(1, math.ceil(math.sqrt(len(items))))
    lots_out, lot_to_group = [], {}
    for i, (key, g) in enumerate(items):
        owner = next(iter(g['owners'])) if len(g['owners']) == 1 else None  # E-3 suppress on disagree
        entry = {
            'bbl': f'{boro}-{int(block):05d}-{g["lot"]:04d}' if g['lot'] >= 0 else 'other',
            'lot': g['lot'], 'c': i % side, 'r': i // side,
            'v': round(g['mv'] / 1e6, 3), 'nLots': g['n'],
        }
        if owner:
            entry['owner'] = owner[:80]
        if g['maxRawLot'] > 50e6:
            entry['club'] = True
        if g['zero']:
            entry['zero'] = True
        lots_out.append(entry)

    # lot -> group index map (unit lots + billing pointer lots by address)
    addr_index = {(g['hn'], g['st']): i for i, (k, g) in enumerate(items) if g['hn'] and g['st']}
    key_index = {k: i for i, (k, g) in enumerate(items)}
    for row in rows:
        lot = int(row['lot'] or -1)
        mv = float(row['curmkttot'] or 0)
        cls = (row.get('bldg_class') or '').strip()
        hn, st = low_housenum((row['housenum_lo'] or '').strip()), (row['street_name'] or '').strip()
        if cls == 'R0' and mv == 0:
            if (hn, st) in addr_index:
                lot_to_group[str(lot)] = addr_index[(hn, st)]
            continue
        key = ('C', hn, st) if (lot >= 1001 and hn and st) else ('F', lot)
        if key in key_index:
            lot_to_group[str(lot)] = key_index[key]

    total = sum(g['mv'] for g in groups.values())
    largest = max((g['mv'] for g in groups.values()), default=0.0)
    n_groups_real = len(groups)
    values = [g['mv'] for g in groups.values() if g['mv'] > 0]

    if total <= 0:
        character = 'empty'
    elif n_groups_real == 1:
        character = 'single'
    elif largest / total >= 0.32:
        character = 'whale'
    elif values and max(values) / max(min(values), 1) < 3:
        character = 'flat'
    elif any(g['maxRawLot'] > 50e6 for g in groups.values()):
        character = 'spread'
    else:
        character = 'spread' if largest / total >= 0.15 else 'flat'

    return {
        'borough': BORO[boro], 'block': int(block), 'bblPrefix': f'{boro}-{int(block):05d}',
        'totalMv': round(total), 'totalM': round(total / 1e6, 2),
        'rank': 0, 'rankTaxable': 0, 'percentile': 0.0,
        'largestGroupShare': round(largest / total, 4) if total > 0 else None,
        'llcShare': 0.0, 'nLots': n_lots, 'nGroups': len(items),
        'character': character, 'rollYear': 'FY2027', 'extractHash': extract_hash,
        'lotToGroup': lot_to_group, 'lots': lots_out,
    }


def main():
    with open('/Users/hareeshnagaraj/Development/pedaterre/data/raw/extract.sha256') as f:
        extract_hash = f.read()[:8]
    import os
    os.makedirs(OUT, exist_ok=True)
    # (name, boro, block) — chosen in Round 1 review for coverage of extremes
    picks = [
        ('midtown-1398', '1', '1398'),      # condo mix, ~52 groups
        ('bpc-16', '1', '16'),              # 3,852 lots, condo-heavy, Goldman HQ
        ('centralpark-1111', '1', '1111'),  # single lot, $7.3B, character=single
        ('tail-si-2450', '5', '2450'),      # 864 groups -> tail rule fires
    ]
    for name, boro, block in picks:
        rows = load_block(boro, block)
        p = build_payload(boro, block, rows, extract_hash)
        with open(f'{OUT}/{name}.json', 'w') as f:
            json.dump(p, f, separators=(',', ':'))
        print(f'{name}: {p["nLots"]} lots -> {p["nGroups"]} groups, '
              f'${p["totalM"]}M, character={p["character"]}, '
              f'{len(json.dumps(p))} bytes')

    # median + flat + zero picks need a citywide scan
    agg = collections.defaultdict(float)
    for f in RAW:
        with open(f, newline='', encoding='utf-8') as fh:
            for row in csv.DictReader(fh):
                if (row.get('bldg_class') or '').strip() == 'R0' and float(row['curmkttot'] or 0) == 0:
                    continue
                agg[(row['boro'], row['block'])] += float(row['curmkttot'] or 0)
    totals = sorted(agg.items(), key=lambda kv: kv[1])
    median_bk = totals[len(totals) // 2][0]
    zero_bk = next(bk for bk, t in totals if t <= 0)
    for name, (boro, block) in [('median', median_bk), ('zero', zero_bk)]:
        rows = load_block(boro, block)
        p = build_payload(boro, block, rows, extract_hash)
        with open(f'{OUT}/{name}-{BORO[boro].lower()}-{block}.json', 'w') as f:
            json.dump(p, f, separators=(',', ':'))
        print(f'{name} ({BORO[boro]} {block}): {p["nLots"]} lots -> {p["nGroups"]} groups, '
              f'${p["totalM"]}M, character={p["character"]}')


if __name__ == '__main__':
    main()
