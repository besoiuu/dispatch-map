import * as path from 'path';
import * as fs from 'fs';
import { processGermany } from './processors/de';
import { processNetherlands } from './processors/nl';

const args = process.argv.slice(2);
const countryFlag = args.indexOf('--country');
const country = countryFlag >= 0 ? args[countryFlag + 1] : 'de';

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'public', 'data');

async function main() {
  switch (country) {
    case 'de': {
      const outputDir = path.join(dataDir, 'de');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      // Prefer TopoJSON source (smaller, has topology)
      const topoPath = path.join(rootDir, 'postleitzahlen.topojson.br');
      const geojsonPath = path.join(rootDir, 'postleitzahlen.geojson.br');

      const inputPath = fs.existsSync(topoPath) ? topoPath : geojsonPath;

      if (!fs.existsSync(inputPath)) {
        console.error('No input data found. Place postleitzahlen.topojson.br in project root.');
        process.exit(1);
      }

      console.log(`Using source: ${path.basename(inputPath)}`);
      await processGermany(inputPath, outputDir);
      break;
    }
    case 'nl': {
      const outputDir = path.join(dataDir, 'nl');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const inputPath = path.join(outputDir, 'pc4_raw.geojson');
      if (!fs.existsSync(inputPath)) {
        console.error('No input data found. Place pc4_raw.geojson in public/data/nl/');
        process.exit(1);
      }

      console.log(`Using source: ${path.basename(inputPath)}`);
      await processNetherlands(inputPath, outputDir);
      break;
    }
    default:
      console.error(`Unknown country: ${country}. Supported: de, nl`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Preprocessing failed:', err);
  process.exit(1);
});
