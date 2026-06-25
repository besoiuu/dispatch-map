"""
Reassign postal code names from GeoNames for all countries.
GeoNames has town/city names while our data often has municipality/admin names.
"""
import json, sys, os, urllib.request, zipfile, io, csv, math
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

COUNTRIES = {
    'de': 'public/data/de/plz5.geojson',
    'nl': 'public/data/nl/pc4.geojson',
    'fr': 'public/data/fr/dept.geojson',
    'be': 'public/data/be/pc4.geojson',
    'dk': 'public/data/dk/post4.geojson',
    'at': 'public/data/at/plz4.geojson',
    'cz': 'public/data/cz/okres.geojson',
    'pl': 'public/data/pl/detail.geojson',
    'hu': 'public/data/hu/detail.geojson',
    'ro': 'public/data/ro/detail.geojson',
    'it': 'public/data/it/detail.geojson',
    'sk': 'public/data/sk/detail.geojson',
}

def load_geonames(cc):
    """Download and parse GeoNames postal code data for a country."""
    url = f'https://download.geonames.org/export/zip/{cc.upper()}.zip'
    data = urllib.request.urlopen(url, timeout=30).read()
    zf = zipfile.ZipFile(io.BytesIO(data))
    txt = zf.read(f'{cc.upper()}.txt').decode('utf-8')

    # Group by postal code, pick the primary place name
    # GeoNames format: country, postal_code, place_name, admin1, admin2, admin3, ...lat, lng
    codes = defaultdict(list)
    for line in txt.strip().split('\n'):
        parts = line.split('\t')
        if len(parts) < 10:
            continue
        postal = parts[1].strip()
        name = parts[2].strip()
        lat = float(parts[9]) if parts[9] else 0
        lng = float(parts[10]) if parts[10] else 0
        codes[postal].append({'name': name, 'lat': lat, 'lng': lng})

    return codes

def centroid(feature):
    """Compute centroid of a GeoJSON feature."""
    coords = []
    def walk(c):
        if isinstance(c[0], (int, float)):
            coords.append(c)
        else:
            for sub in c:
                walk(sub)
    walk(feature['geometry']['coordinates'])
    if not coords:
        return None
    lng = sum(c[0] for c in coords) / len(coords)
    lat = sum(c[1] for c in coords) / len(coords)
    return (lng, lat)

def dist(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)

def process_country(cc, geojson_path):
    """Update names in a country's GeoJSON using GeoNames data."""
    if not os.path.exists(geojson_path):
        print(f'  SKIP: {geojson_path} not found')
        return 0

    geonames = load_geonames(cc)
    geojson = json.load(open(geojson_path, encoding='utf-8'))

    updated = 0
    total = len(geojson['features'])

    for f in geojson['features']:
        plz = str(f['properties'].get('plz5', ''))
        if not plz:
            continue

        old_name = f['properties'].get('name', '')

        c = centroid(f)

        # Direct match by postal code — pick entry closest to centroid
        entries = geonames.get(plz, [])
        if not entries:
            plz_clean = plz.replace(' ', '').replace('-', '')
            entries = geonames.get(plz_clean, [])

        if entries and c:
            best = min(entries, key=lambda g: dist((g['lng'], g['lat']), c))
            new_name = best['name']
            if new_name and new_name != old_name:
                f['properties']['name'] = new_name
                updated += 1
                continue
        elif entries:
            new_name = entries[0]['name']
            if new_name and new_name != old_name:
                f['properties']['name'] = new_name
                updated += 1
                continue

        # Nearest-neighbor fallback for codes that don't match
        if c:
            all_entries = [e for elist in geonames.values() for e in elist]
            if all_entries:
                nearest = min(all_entries, key=lambda g: dist((g['lng'], g['lat']), c))
                nearest_dist = dist((nearest['lng'], nearest['lat']), c)
                if nearest_dist < 0.05 and nearest['name'] and nearest['name'] != old_name:
                    f['properties']['name'] = nearest['name']
                    updated += 1

    json.dump(geojson, open(geojson_path, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'  Updated {updated}/{total} names')
    return updated

# Also update overview files
OVERVIEW_FILES = {
    'de': 'public/data/de/plz2.geojson',
    'nl': 'public/data/nl/pc2.geojson',
    'be': 'public/data/be/pc2.geojson',
    'dk': 'public/data/dk/post2.geojson',
    'at': 'public/data/at/plz1.geojson',
    'cz': 'public/data/cz/region.geojson',
    'pl': 'public/data/pl/overview.geojson',
    'hu': 'public/data/hu/overview.geojson',
    'ro': 'public/data/ro/overview.geojson',
    'it': 'public/data/it/overview.geojson',
    'sk': 'public/data/sk/overview.geojson',
    'fr': 'public/data/fr/regions.geojson',
}

def process_overview(cc, geojson_path):
    """Update overview region names using GeoNames — pick the main city for each region code."""
    if not os.path.exists(geojson_path):
        return 0

    geonames = load_geonames(cc)
    geojson = json.load(open(geojson_path, encoding='utf-8'))

    # Group GeoNames entries by plz2 prefix — pick the one with shortest code (main city)
    prefix_cities = {}
    for code, entries in geonames.items():
        p2 = code[:2]
        name = entries[0]['name'] if entries else ''
        if p2 not in prefix_cities or len(code) < len(prefix_cities[p2]['code']):
            prefix_cities[p2] = {'code': code, 'name': name}

    updated = 0
    for f in geojson['features']:
        plz2 = str(f['properties'].get('plz2', ''))
        if plz2 in prefix_cities:
            new_name = prefix_cities[plz2]['name']
            old_name = f['properties'].get('name', '')
            if new_name and new_name != old_name:
                f['properties']['name'] = new_name
                if 'label' in f['properties']:
                    f['properties']['label'] = new_name
                updated += 1

    if updated > 0:
        json.dump(geojson, open(geojson_path, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'  Overview: updated {updated} region names')
    return updated

print('=== Reassigning postal code names from GeoNames ===\n')

total_updated = 0
for cc, path in COUNTRIES.items():
    print(f'{cc.upper()}: {path}')
    total_updated += process_country(cc, path)
    if cc in OVERVIEW_FILES:
        total_updated += process_overview(cc, OVERVIEW_FILES[cc])

print(f'\nTotal: {total_updated} names updated')

# Regenerate search index
print('\nRegenerating search index...')
index = []
for cc, path in COUNTRIES.items():
    d = json.load(open(path, encoding='utf-8'))
    for f in d['features']:
        p = f['properties']
        plz = str(p.get('plz5', ''))
        name = str(p.get('name', ''))
        if not plz:
            continue
        coords = []
        def walk(c):
            if isinstance(c[0], (int, float)):
                coords.append(c)
            else:
                for sub in c:
                    walk(sub)
        walk(f['geometry']['coordinates'])
        if not coords:
            continue
        lng = round(sum(c[0] for c in coords) / len(coords), 4)
        lat = round(sum(c[1] for c in coords) / len(coords), 4)
        index.append([cc, plz, name, lng, lat])

index.sort()
json.dump(index, open('public/data/search-index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'Search index: {len(index)} entries')
print('Done!')
