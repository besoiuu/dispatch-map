import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
// @ts-expect-error no types
import * as topojsonClient from 'topojson-client';
// @ts-expect-error no types
import * as topojsonSimplify from 'topojson-simplify';
import { DE_REGION_LABELS } from './de-labels';

type PolyFeature = Feature<Polygon | MultiPolygon>;

export async function processGermany(inputPath: string, outputDir: string) {
  console.log('Reading TopoJSON...');
  const raw = fs.readFileSync(inputPath);
  const data = raw[0] === 0x7b
    ? raw
    : zlib.brotliDecompressSync(raw);
  const topology = JSON.parse(data.toString('utf-8'));
  const objectName = Object.keys(topology.objects)[0];
  const geomCount = topology.objects[objectName].geometries.length;
  console.log(`  ${geomCount} geometries, ${topology.arcs.length} shared arcs`);

  // Simplify the topology (preserves shared borders)
  console.log('Simplifying topology...');
  const presimplified = topojsonSimplify.presimplify(topology);
  const simplified = topojsonSimplify.simplify(presimplified, 5e-6);
  console.log(`  Simplification complete`);

  // Convert to GeoJSON
  const geojson = topojsonClient.feature(
    simplified,
    simplified.objects[objectName]
  ) as FeatureCollection;

  // Normalize properties
  console.log('Normalizing features...');
  const features: PolyFeature[] = [];
  let id = 0;
  for (const f of geojson.features) {
    const postcode = String(f.properties?.postcode ?? '');
    if (!postcode || !/^\d{5}$/.test(postcode)) continue;
    f.id = id++;
    const plz2 = postcode.slice(0, 2);
    f.properties = {
      plz5: postcode,
      plz2,
      name: DE_REGION_LABELS[plz2] ?? '',
    };
    features.push(f as PolyFeature);
  }
  console.log(`  ${features.length} valid features`);

  // Write detail layer
  const plz5Collection: FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };
  const plz5Path = path.join(outputDir, 'plz5.geojson');
  fs.writeFileSync(plz5Path, JSON.stringify(plz5Collection));
  const plz5Size = fs.statSync(plz5Path).size;
  console.log(`  plz5.geojson written: ${(plz5Size / 1024 / 1024).toFixed(1)} MB`);

  // Dissolve 2-digit regions
  console.log('Dissolving 2-digit regions...');
  const groups = new Map<string, PolyFeature[]>();
  for (const f of features) {
    const plz2 = f.properties!.plz2 as string;
    if (!groups.has(plz2)) groups.set(plz2, []);
    groups.get(plz2)!.push(f);
  }
  console.log(`  ${groups.size} 2-digit groups`);

  const plz2Features: Feature[] = [];
  for (const [plz2, groupFeatures] of groups) {
    try {
      let merged: PolyFeature = groupFeatures[0];
      if (groupFeatures.length > 1) {
        for (let i = 1; i < groupFeatures.length; i++) {
          try {
            const result = turf.union(turf.featureCollection([merged, groupFeatures[i]]));
            if (result) merged = result as PolyFeature;
          } catch {
            try {
              const buffered = turf.buffer(groupFeatures[i], 0, { units: 'meters' });
              if (buffered) {
                const result = turf.union(turf.featureCollection([merged, buffered as PolyFeature]));
                if (result) merged = result as PolyFeature;
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
        plz2,
        label: DE_REGION_LABELS[plz2] ?? '',
        centroid: centroid.geometry.coordinates as [number, number],
        bbox: bbox as [number, number, number, number],
        featureCount: groupFeatures.length,
      };
      plz2Features.push(simplifiedRegion);
      process.stdout.write(`  Region ${plz2} (${groupFeatures.length} PLZ) - ${DE_REGION_LABELS[plz2] ?? ''}\n`);
    } catch (err) {
      console.error(`  Failed to dissolve group ${plz2}:`, err);
    }
  }

  const plz2Collection: FeatureCollection = { type: 'FeatureCollection', features: plz2Features };
  const plz2Path = path.join(outputDir, 'plz2.geojson');
  fs.writeFileSync(plz2Path, JSON.stringify(plz2Collection));
  const plz2Size = fs.statSync(plz2Path).size;
  console.log(`  plz2.geojson written: ${(plz2Size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`\nDone! ${plz2Features.length} regions, ${features.length} detail features`);
}
