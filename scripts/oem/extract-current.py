#!/usr/bin/env python3
"""Snapshot and extract factual cards linked by the supplied MY17–26 reference.
No runtime scraping, prices, artwork, product descriptions or fitment inference.
Requires BeautifulSoup (python3-bs4) for offline HTML parsing.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.agent/catalog-ingestion'
OUT = ROOT / 'data/oem/extracted'
BASE = 'https://lithiumpowersports.com'
GROUPS = {
    '3-00-18-offroad-rear-wheel-set': ('rear-wheel', 'Rear wheel'),
    '70-100-19-offroad-front-wheel-set': ('front-wheel', 'Front wheel'),
    '70-90-17-90-80-17-supermoto-wheels-set': ('supermoto', 'Optional supermoto wheels'),
    'battery-lock-cover': ('battery-lock', 'Battery lock cover'),
    'controller-battery-charger': ('battery', 'Controller, battery and charger'),
    'drive-system': ('jackshaft', 'Drive system and midshaft'),
    'fender-kit': ('fenders', 'Fender kit'),
    'frame-coverings': ('battery-body', 'Frame and battery coverings'),
    'frame-metal-accessories': ('battery-mounts', 'Frame metal accessories'),
    'frame-subframe-swingarm': ('frame', 'Frame, subframe and swingarm'),
    'front-rear-brake-disc-kit': ('brake-discs', 'Optional brake disc kit'),
    'main-harness-circuit-breaker': ('wiring', 'Main harness and circuit breaker'),
    'motor-system': ('motor', 'Motor'),
    'my17-25-brake-system': ('brakes', 'Braking system'),
    'my17-25-decal-set': ('decals', 'Decals'),
    'my17-25-locks-lights-horn-dc-converter': ('electrical', 'Locks, lights, horn and converter'),
    'my26-decal-set': ('decals', 'Decals'),
    'my26-front-brake-system': ('front-brake', 'Front brake'),
    'my26-locks-lights-horn-dc-converter': ('electrical', 'Locks, lights, horn and converter'),
    'my26-rear-brake-system': ('rear-brake', 'Rear brake'),
    'rear-rubber-fender-kit': ('rear-fender', 'Optional rear fender'),
    'rear-shock-system': ('rear-suspension', 'Rear suspension'),
    'seat': ('seat', 'Seat'),
    'secondary-belt-driver-kit': ('secondary-drive', 'Optional secondary belt drive'),
    'side-stand-foot-pegs': ('footpegs', 'Footpegs and side stand'),
    'steering-system-front-fork': ('front-suspension', 'Steering and front fork'),
    'swingarm-assembly': ('swingarm', 'Swingarm'),
}

def years_from(text):
    match = re.search(r'MY\s*(\d{2})(?:\s*[-–]\s*(?:MY\s*)?(\d{2}))?', text, re.I)
    if match:
        low = 2000 + int(match[1]); high = 2000 + int(match[2] or match[1])
        return list(range(low, high + 1)) if 2017 <= low <= high <= 2026 else []
    match = re.search(r'\b(2[56])\s*MY\b', text, re.I)
    return [2000 + int(match[1])] if match else []

def extract(slug, download=False):
    url = f'{BASE}/collections/surron-light-bee-{slug}'
    path = CACHE / f'lithium-{slug}.html'
    if download and not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (source catalog review)'})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
        path.write_bytes(data)
    if not path.exists():
        return {'slug': slug, 'error': 'Snapshot unavailable; fetch explicitly using --download.'}
    data = path.read_bytes()
    soup = BeautifulSoup(data, 'html.parser')
    title = soup.select_one('h1')
    cards = soup.select('li.lp-item')
    source_id = f'lithium-{slug}'
    assembly_key, assembly_name = GROUPS[slug]
    rows = []
    for ordinal, card in enumerate(cards, 1):
        heading = card.select_one('.lp-title')
        sku = card.select_one('.lp-sku')
        callout = card.select_one('.lp-item-badge')
        description = heading.get_text(' ', strip=True) if heading else ''
        number = re.sub(r'^SKU:\s*', '', sku.get_text(' ', strip=True)).strip() if sku else None
        number = number or None
        reference = re.sub(r'^Item\s*', '', callout.get_text(' ', strip=True)) if callout else None
        product_url = heading.select_one('a').get('href') if heading and heading.select_one('a') else None
        years = years_from(description) or years_from(slug)
        flags = ['retailer-reference-not-factory-confirmed', 'quantity-not-stated']
        if not number: flags.append('missing-oem-number')
        if not years: flags.append('model-year-unknown')
        if not reference: flags.append('missing-callout')
        normalized = re.sub(r'^Surron Light Bee X?\s*(?:OEM\s*)?', '', description, flags=re.I)
        notes = ['Retailer diagram card; source association and explicit year label are claims requiring review. Quantity is not inferred from purchasable units or cart defaults.']
        if product_url: notes.append(f'Product reference: {BASE}{product_url}' if product_url.startswith('/') else product_url)
        if 'drive-system' == slug and number == 'B7-001-17-26-07':
            flags.append('part-number-title-dimension-disagreement')
            notes.append('Card title says 15-24-7 while the exact SKU contains 17-26-07. Both retained; no dimensional correction inferred.')
        rows.append({
            'id': f'{source_id}-p1-r{ordinal}', 'sourceId': source_id, 'page': 1,
            'figure': slug, 'callout': reference, 'rowIndex': ordinal,
            'oemNumber': number, 'originalDescription': description,
            'normalizedName': normalized or description or 'Unidentified source entry',
            'quantity': None, 'quantityText': None, 'dimensionsText': None, 'weightText': None,
            'material': None, 'notes': notes,
            'applicability': 'Explicit retailer year label: ' + ', '.join(map(str, years)) if years else None,
            'modelYears': years, 'itemType': 'assembly' if re.search(r'\b(?:Assy|assembly)\b', description, re.I) else 'component',
            'confidence': 'high' if heading and number else 'low', 'reviewFlags': flags,
            'assemblyKey': assembly_key, 'assemblyName': assembly_name,
            'rawText': f'Item {reference or "unstated"} | SKU: {number or "unstated"} | {description}',
        })
    advertised = None
    body = soup.select_one('.lp-wrap')
    if body:
        match = re.search(r'\b(\d+)\s+parts\b', body.get_text(' ',strip=True))
        if match: advertised = int(match[1])
    exceptions = []
    if not cards: exceptions.append({'callout': None, 'reason': 'No diagram product-card structure found; this source needs manual table extraction.', 'evidence': url})
    if advertised is not None and advertised != len(rows): exceptions.append({'callout': None, 'reason': f'Advertised {advertised} parts but parsed {len(rows)} cards; do not claim complete coverage.', 'evidence': url})
    result = {
        'version': 1,
        'source': {'id': source_id, 'title': 'Lithium Powersports — ' + (title.get_text(' ',strip=True) if title else assembly_name),
                   'filename': None, 'localPath': None, 'url': url, 'sha256': hashlib.sha256(data).hexdigest(),
                   'pageCount': 1, 'edition': 'Web snapshot 2026-10-14 UTC', 'modelYears': [],
                   'applicabilityNotes': 'Retailer claims, not mechanically verified. Years are copied only from explicit product or section labels. No compatibility equivalence is inferred.',
                   'redistribution': 'reference-only', 'retrievedAt': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat().replace('+00:00', 'Z'), 'kind': 'web'},
        'rows': rows,
        'pages': [{'page': 1, 'figures': [slug], 'detectedRows': len(cards), 'importedRows': len(rows),
                   'reviewRowIds': [row['id'] for row in rows], 'exceptions': exceptions,
                   'visualStatus': 'not-inspected', 'notes': ['Factual title/SKU/callout cards parsed from saved HTML. Diagram artwork not copied, read or used to infer quantities.', f'Advertised card count: {advertised if advertised is not None else "not detected"}.']}],
        'notes': ['Supplemental model-year cross-check; not a factory PDF or complete motorcycle bill of materials.',
                  'Retailer overview contains contradictory cross-generation compatibility summaries; no blanket compatibility assertions were imported.'],
    }
    (OUT / f'{source_id}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    return {'slug': slug, 'rows': len(rows), 'advertised': advertised, 'exceptions': len(exceptions)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--download', action='store_true'); args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(extract, slug, args.download): slug for slug in GROUPS}
        results = []
        for future in concurrent.futures.as_completed(futures):
            try: result = future.result()
            except Exception as error: result = {'slug': futures[future], 'error': str(error)}
            results.append(result); print(json.dumps(result), flush=True)
    report = ROOT / 'data/oem/audits/current-web-ingestion.json'
    previous = {item['slug']: item for item in json.loads(report.read_text())} if report.exists() else {}
    if not args.download:
        results = [previous.get(item['slug'], item) if 'error' in item else item for item in results]
    report.write_text(json.dumps(sorted(results, key=lambda item:item['slug']), indent=2) + '\n')
