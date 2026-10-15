// Regenerates config/delivery-zip-tiers.csv from scratch: every California ZIP
// whose centre is within the outermost tier of ORIGIN_ZIP, priced by
// straight-line distance. Only needed to rebuild the whole table (new origin,
// new tier edges) — for one-off fixes just edit the CSV and run sync-zip-tiers.
//
//   node scripts/build-zip-tiers.cjs
//
// Data: US Census ZCTA gazetteer (ZIP centroids, public domain) and GeoNames US
// postal codes (city names + PO-box/unique ZIPs the Census file lacks, CC-BY).
// NOTE: this OVERWRITES the CSV, discarding manual edits.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ORIGIN_ZIP = '94538'; // Fremont, CA
// [max miles (inclusive), shipping-rate title, price] — titles must match the
// rate names in Shopify exactly (see setup-delivery-rates.cjs).
const TIERS = [
  [10, 'Local Delivery', 0],
  [15, 'Semi-Local Delivery', 3.99],
  [25, 'Standard Delivery', 4.99],
  [50, 'Long Distance Delivery', 7.99],
];
const OUT = path.join(__dirname, '..', 'config', 'delivery-zip-tiers.csv');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-tiers-'));

async function fetchZip(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const file = path.join(tmp, path.basename(url));
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  execFileSync(process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar', ['-xf', file, '-C', tmp]);
}

async function main() {
  const year = new Date().getFullYear();
  let gaz;
  for (const y of [year, year - 1, year - 2]) {
    try {
      await fetchZip(`https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${y}_Gazetteer/${y}_Gaz_zcta_national.zip`);
      gaz = path.join(tmp, `${y}_Gaz_zcta_national.txt`);
      break;
    } catch {}
  }
  if (!gaz) throw new Error('Could not download the Census ZCTA gazetteer');
  await fetchZip('https://download.geonames.org/export/zip/US.zip');

  const zcta = new Map();
  for (const l of fs.readFileSync(gaz, 'utf8').split(/\r?\n/).slice(1)) {
    const p = l.split('|');
    if (p.length >= 8) zcta.set(p[0], [parseFloat(p[6]), parseFloat(p[7])]);
  }
  const geo = new Map();
  for (const l of fs.readFileSync(path.join(tmp, 'US.txt'), 'utf8').split(/\r?\n/)) {
    const p = l.split('\t');
    if (p[4] === 'CA') geo.set(p[1], { city: p[2], county: p[5], lat: parseFloat(p[9]), lon: parseFloat(p[10]) });
  }

  const origin = zcta.get(ORIGIN_ZIP);
  const rad = (d) => (d * Math.PI) / 180;
  const miles = ([a, b], [c, d]) => {
    const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
    return 2 * 3958.8 * Math.asin(Math.sqrt(x));
  };

  const rows = [];
  for (const [zip, g] of geo) {
    const mi = miles(origin, zcta.get(zip) || [g.lat, g.lon]);
    const tier = TIERS.find(([max]) => mi <= max);
    if (tier) rows.push({ zip, ...g, mi, tier, src: zcta.has(zip) ? 'zcta' : 'geonames' });
  }
  rows.sort((a, b) => a.mi - b.mi);

  const lines = ['zip,city,county,miles_from_fremont_94538,tier,price,centroid_source'];
  for (const r of rows) {
    lines.push([r.zip, `"${r.city}"`, `"${r.county}"`, r.mi.toFixed(1), r.tier[1], r.tier[2].toFixed(2), r.src].join(','));
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`Wrote ${rows.length} ZIPs to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
