import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';
// @ts-expect-error no types
import * as topojsonServer from 'topojson-server';
// @ts-expect-error no types
import * as topojsonClient from 'topojson-client';
// @ts-expect-error no types
import * as topojsonSimplify from 'topojson-simplify';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { NL_REGION_LABELS } from './nl-labels';

type PolyFeature = Feature<Polygon | MultiPolygon>;

export async function processNetherlands(inputPath: string, outputDir: string) {
  console.log('Reading GeoJSON...');
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as FeatureCollection;
  console.log(`  ${raw.features.length} features loaded`);

  // Normalize properties
  console.log('Normalizing features...');
  const normalized: PolyFeature[] = [];
  let id = 0;
  for (const f of raw.features) {
    const pc4 = String(f.properties?.pc4_code ?? '');
    if (!pc4 || !/^\d{4}$/.test(pc4)) continue;
    const nf = { ...f } as PolyFeature;
    nf.id = id++;
    nf.properties = {
      plz5: pc4, // reuse plz5 key for consistency
      plz2: pc4.slice(0, 2),
      name: f.properties?.gem_name ?? '',
    };
    normalized.push(nf);
  }
  console.log(`  ${normalized.length} valid features`);

  // Convert to TopoJSON for topology-preserving simplification
  console.log('Building topology and simplifying...');
  const collection: FeatureCollection = { type: 'FeatureCollection', features: normalized };
  const topology = topojsonServer.topology({ pc4: collection });
  const presimplified = topojsonSimplify.presimplify(topology);
  const simplified = topojsonSimplify.simplify(presimplified, 5e-6);
  const result = topojsonClient.feature(simplified, simplified.objects.pc4) as FeatureCollection;

  // Restore IDs
  for (let i = 0; i < result.features.length; i++) {
    result.features[i].id = i;
  }

  console.log(`  ${result.features.length} features after simplification`);

  const pc4Path = path.join(outputDir, 'pc4.geojson');
  fs.writeFileSync(pc4Path, JSON.stringify(result));
  const pc4Size = fs.statSync(pc4Path).size;
  console.log(`  pc4.geojson written: ${(pc4Size / 1024 / 1024).toFixed(1)} MB`);

  // Dissolve 2-digit regions
  console.log('Dissolving 2-digit regions...');
  const groups = new Map<string, PolyFeature[]>();
  for (const f of result.features) {
    const pc2 = String(f.properties!.plz2);
    if (!groups.has(pc2)) groups.set(pc2, []);
    groups.get(pc2)!.push(f as PolyFeature);
  }
  console.log(`  ${groups.size} 2-digit groups`);

  const pc2Features: Feature[] = [];
  for (const [pc2, features] of groups) {
    try {
      let merged: PolyFeature = features[0];
      if (features.length > 1) {
        for (let i = 1; i < features.length; i++) {
          try {
            const r = turf.union(turf.featureCollection([merged, features[i]]));
            if (r) merged = r as PolyFeature;
          } catch {
            try {
              const b = turf.buffer(features[i], 0, { units: 'meters' });
              if (b) {
                const r = turf.union(turf.featureCollection([merged, b as PolyFeature]));
                if (r) merged = r as PolyFeature;
              }
            } catch { /* skip */ }
          }
        }
      }

      let simplifiedRegion: PolyFeature;
      try {
        simplifiedRegion = turf.simplify(merged, { tolerance: 0.003, highQuality: true }) as PolyFeature;
      } catch {
        simplifiedRegion = merged;
      }

      const centroid = turf.centroid(simplifiedRegion);
      const bbox = turf.bbox(simplifiedRegion);
      simplifiedRegion.properties = {
        plz2: pc2,
        label: NL_REGION_LABELS[pc2] ?? '',
        centroid: centroid.geometry.coordinates as [number, number],
        bbox: bbox as [number, number, number, number],
        featureCount: features.length,
      };
      pc2Features.push(simplifiedRegion);
      process.stdout.write(`  Region ${pc2} (${features.length} PC4) - ${NL_REGION_LABELS[pc2] ?? ''}\n`);
    } catch (err) {
      console.error(`  Failed to dissolve group ${pc2}:`, err);
    }
  }

  const pc2Collection: FeatureCollection = { type: 'FeatureCollection', features: pc2Features };
  const pc2Path = path.join(outputDir, 'pc2.geojson');
  fs.writeFileSync(pc2Path, JSON.stringify(pc2Collection));
  const pc2Size = fs.statSync(pc2Path).size;
  console.log(`  pc2.geojson written: ${(pc2Size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`\nDone! ${pc2Features.length} regions, ${result.features.length} detail features`);
}
