// Reads config/delivery-zip-tiers.csv into ordered tiers:
//   [{ title, price, zips: [...] }] sorted by price (cheapest first).
// Columns used: zip, tier, price. The rest (city, miles, ...) are for humans.

const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, '..', '..', 'config', 'delivery-zip-tiers.csv');

function readTiers() {
  const [header, ...lines] = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  // Split on commas outside double quotes.
  const split = (l) => l.match(/("([^"]*)"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').trim());
  const cols = split(header);
  const at = (name) => {
    const i = cols.indexOf(name);
    if (i < 0) throw new Error(`delivery-zip-tiers.csv is missing the "${name}" column`);
    return i;
  };
  const [iZip, iTier, iPrice] = [at('zip'), at('tier'), at('price')];

  const byTitle = new Map();
  const seen = new Map();
  lines.forEach((line, n) => {
    const c = split(line);
    const zip = c[iZip];
    const title = c[iTier];
    const price = Number(c[iPrice]);
    if (!/^\d{5}$/.test(zip)) throw new Error(`Row ${n + 2}: bad ZIP "${zip}"`);
    if (!title || !Number.isFinite(price)) throw new Error(`Row ${n + 2}: missing tier/price`);
    if (seen.has(zip)) throw new Error(`ZIP ${zip} is listed twice (rows ${seen.get(zip)} and ${n + 2})`);
    seen.set(zip, n + 2);
    const tier = byTitle.get(title) ?? { title, price, zips: [] };
    if (tier.price !== price) throw new Error(`Row ${n + 2}: "${title}" priced ${price}, elsewhere ${tier.price}`);
    tier.zips.push(zip);
    byTitle.set(title, tier);
  });
  return [...byTitle.values()].sort((a, b) => a.price - b.price);
}

module.exports = { readTiers, CSV };
