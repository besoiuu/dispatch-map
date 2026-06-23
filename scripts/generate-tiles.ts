import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
// @ts-expect-error no types
import geojsonvt from 'geojson-vt';
// @ts-expect-error no types
import vtpbf from 'vt-pbf';
import Database from 'better-sqlite3';

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'public', 'data');
const tilesDir = path.join(rootDir, 'public', 'tiles');
const pmtilesExe = path.join(rootDir, 'scripts', 'bin', 'pmtiles.exe');

interface CountryDef {
  code: string;
  detailFile: string;
  overviewFile: string;
  detailPropKey: string;
  overviewPropKey: string;
}

const COUNTRIES: CountryDef[] = [
  { code: 'de', detailFile: 'plz5.geojson', overviewFile: 'plz2.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'nl', detailFile: 'pc4.geojson', overviewFile: 'pc2.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'fr', detailFile: 'dept.geojson', overviewFile: 'regions.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'be', detailFile: 'pc4.geojson', overviewFile: 'pc2.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'dk', detailFile: 'post4.geojson', overviewFile: 'post2.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'at', detailFile: 'plz4.geojson', overviewFile: 'plz1.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'cz', detailFile: 'okres.geojson', overviewFile: 'region.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'pl', detailFile: 'detail.geojson', overviewFile: 'overview.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'hu', detailFile: 'detail.geojson', overviewFile: 'overview.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'ro', detailFile: 'detail.geojson', overviewFile: 'overview.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'it', detailFile: 'detail.geojson', overviewFile: 'overview.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
  { code: 'sk', detailFile: 'detail.geojson', overviewFile: 'overview.geojson', detailPropKey: 'plz5', overviewPropKey: 'plz2' },
];

function computeCentroid(feature: GeoJSON.Feature): [number, number] | null {
  const coords: number[][] = [];
  const walk = (c: unknown[]) => {
    if (typeof c[0] === 'number') {
      coords.push(c as number[]);
    } else {
      for (const sub of c) walk(sub as unknown[]);
    }
  };
  if ('coordinates' in feature.geometry) {
    walk(feature.geometry.coordinates as unknown[]);
  }
  if (coords.length === 0) return null;
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return [lng, lat];
}

function createLabelPoints(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const points: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    const centroid = f.properties?.centroid
      ? (f.properties.centroid as [number, number])
      : computeCentroid(f);
    if (!centroid) continue;
    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: centroid },
      properties: { ...f.properties },
    });
  }
  return { type: 'FeatureCollection', features: points };
}

function tileRange(z: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const n = 1 << z;
  return { minX: 0, minY: 0, maxX: n - 1, maxY: n - 1 };
}

function writeMBTiles(
  outPath: string,
  layers: { name: string; tileIndex: ReturnType<typeof geojsonvt> }[],
  minZoom: number,
  maxZoom: number,
  description: string,
): void {
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  const db = new Database(outPath);

  db.exec(`
    CREATE TABLE metadata (name TEXT, value TEXT);
    CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
    CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
  `);

  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('format', 'pbf');
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('type', 'overlay');
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('minzoom', String(minZoom));
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('maxzoom', String(maxZoom));
  db.prepare('INSERT INTO metadata VALUES (?, ?)').run('description', description);

  const insert = db.prepare('INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)');
  const batch = db.transaction((tiles: { z: number; x: number; y: number; data: Buffer }[]) => {
    for (const t of tiles) {
      insert.run(t.z, t.x, t.y, t.data);
    }
  });

  let totalTiles = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const { maxX, maxY } = tileRange(z);
    const tileBatch: { z: number; x: number; y: number; data: Buffer }[] = [];

    for (let x = 0; x <= maxX; x++) {
      for (let y = 0; y <= maxY; y++) {
        const layerData: Record<string, unknown> = {};
        let hasData = false;

        for (const layer of layers) {
          const tile = layer.tileIndex.getTile(z, x, y);
          if (tile && tile.features.length > 0) {
            layerData[layer.name] = tile;
            hasData = true;
          }
        }

        if (hasData) {
          const pbf = vtpbf.fromGeojsonVt(layerData);
          const tmsY = (1 << z) - 1 - y;
          tileBatch.push({ z, x, y: tmsY, data: Buffer.from(pbf) });
        }
      }
    }

    if (tileBatch.length > 0) {
      batch(tileBatch);
      totalTiles += tileBatch.length;
    }
    process.stdout.write(`  z${z}: ${tileBatch.length} tiles\n`);
  }

  db.close();
  return;
}

function convertTopmtiles(mbtilesPath: string, pmtilesPath: string): void {
  execSync(`"${pmtilesExe}" convert "${mbtilesPath}" "${pmtilesPath}"`, { stdio: 'pipe' });
  fs.unlinkSync(mbtilesPath);
}

interface MetadataEntry {
  plz2Codes: string[];
  plz5Count: number;
}

async function main() {
  if (!fs.existsSync(pmtilesExe)) {
    console.error(`go-pmtiles not found at ${pmtilesExe}`);
    console.error('Download from: https://github.com/protomaps/go-pmtiles/releases');
    process.exit(1);
  }

  if (!fs.existsSync(tilesDir)) fs.mkdirSync(tilesDir, { recursive: true });

  const metadata: Record<string, MetadataEntry> = {};

  for (const country of COUNTRIES) {
    const countryTilesDir = path.join(tilesDir, country.code);
    if (!fs.existsSync(countryTilesDir)) fs.mkdirSync(countryTilesDir, { recursive: true });

    // --- Overview ---
    const overviewPath = path.join(dataDir, country.code, country.overviewFile);
    if (!fs.existsSync(overviewPath)) {
      console.warn(`Skipping ${country.code} overview: ${overviewPath} not found`);
      continue;
    }

    console.log(`\n=== ${country.code.toUpperCase()} ===`);
    console.log(`Overview: ${country.overviewFile}`);

    const overviewGeo = JSON.parse(fs.readFileSync(overviewPath, 'utf-8')) as GeoJSON.FeatureCollection;
    const overviewLabels = createLabelPoints(overviewGeo);

    const plz2Codes = [...new Set(overviewGeo.features.map(f => String(f.properties?.[country.overviewPropKey] ?? '')))].sort();

    const overviewPolyIndex = geojsonvt(overviewGeo, { maxZoom: 10, tolerance: 3, buffer: 64 });
    const overviewLabelIndex = geojsonvt(overviewLabels, { maxZoom: 10, tolerance: 0, buffer: 64 });

    const mbOverview = path.join(countryTilesDir, 'overview.mbtiles');
    const pmOverview = path.join(countryTilesDir, 'overview.pmtiles');

    writeMBTiles(mbOverview, [
      { name: 'overview', tileIndex: overviewPolyIndex },
      { name: 'overview-labels', tileIndex: overviewLabelIndex },
    ], 0, 10, `${country.code} overview regions`);

    convertTopmtiles(mbOverview, pmOverview);
    const ovSize = (fs.statSync(pmOverview).size / 1024).toFixed(0);
    console.log(`  -> overview.pmtiles (${ovSize}KB)`);

    // --- Detail ---
    const detailPath = path.join(dataDir, country.code, country.detailFile);
    if (!fs.existsSync(detailPath)) {
      console.warn(`Skipping ${country.code} detail: ${detailPath} not found`);
      continue;
    }

    console.log(`Detail: ${country.detailFile}`);

    const detailGeo = JSON.parse(fs.readFileSync(detailPath, 'utf-8')) as GeoJSON.FeatureCollection;
    const detailLabels = createLabelPoints(detailGeo);

    const plz5Count = detailGeo.features.length;

    const detailPolyIndex = geojsonvt(detailGeo, { maxZoom: 14, tolerance: 1, buffer: 64 });
    const detailLabelIndex = geojsonvt(detailLabels, { maxZoom: 14, tolerance: 0, buffer: 64 });

    const mbDetail = path.join(countryTilesDir, 'detail.mbtiles');
    const pmDetail = path.join(countryTilesDir, 'detail.pmtiles');

    writeMBTiles(mbDetail, [
      { name: 'detail', tileIndex: detailPolyIndex },
      { name: 'detail-labels', tileIndex: detailLabelIndex },
    ], 8, 14, `${country.code} detail postal areas`);

    convertTopmtiles(mbDetail, pmDetail);
    const dtSize = (fs.statSync(pmDetail).size / 1024).toFixed(0);
    console.log(`  -> detail.pmtiles (${dtSize}KB)`);

    metadata[country.code] = { plz2Codes, plz5Count };
  }

  // Write metadata
  const metadataPath = path.join(tilesDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`\nMetadata: ${metadataPath}`);
  console.log('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
