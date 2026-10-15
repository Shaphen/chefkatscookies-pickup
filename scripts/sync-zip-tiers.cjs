// Pushes config/delivery-zip-tiers.csv into the delivery customization's config
// metafield (the Function reads it at checkout). Keeps the existing pickup
// settings, replaces `deliveryTiers`, and prints which ZIPs moved.
//
//   node scripts/sync-zip-tiers.cjs           # show the diff
//   node scripts/sync-zip-tiers.cjs --apply   # write it (live immediately)

const { gql } = require('./lib/admin.cjs');
const { readTiers } = require('./lib/tiers.cjs');

const NAMESPACE = '$app:pickup-delivery-customization';
const KEY = 'function-configuration';
const apply = process.argv.includes('--apply');

const CUSTOMIZATIONS = `{
  deliveryCustomizations(first: 20) {
    nodes {
      id title enabled
      metafield(namespace: "${NAMESPACE}", key: "${KEY}") { jsonValue }
    }
  }
}`;

const SET = `mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id }
    userErrors { field message }
  }
}`;

const zipMap = (tiers = []) => {
  const m = new Map();
  for (const t of tiers) for (const z of String(t.zips ?? '').split(/[\s,]+/).filter(Boolean)) m.set(z, t.title);
  return m;
};

async function main() {
  const tiers = readTiers();
  // Only customizations belonging to this app are visible to its token.
  const nodes = (await gql(CUSTOMIZATIONS)).deliveryCustomizations.nodes;
  if (nodes.length !== 1) throw new Error(`Expected 1 delivery customization, found ${nodes.length}`);
  const dc = nodes[0];
  console.log(`Delivery customization "${dc.title}" (${dc.enabled ? 'enabled' : 'DISABLED'})`);

  const current = dc.metafield?.jsonValue ?? {};
  const next = {
    pickupOptionTitle: 'Local Pickup',
    pickupValue: 'Pickup',
    ...current,
    deliveryTiers: tiers.map((t) => ({ title: t.title, zips: t.zips.join(' ') })),
  };

  for (const t of tiers) console.log(`  ${t.title.padEnd(24)} $${t.price.toFixed(2).padStart(5)}  ${t.zips.length} ZIPs`);

  const before = zipMap(current.deliveryTiers);
  const after = zipMap(next.deliveryTiers);
  const changes = [];
  for (const [z, t] of after) if (before.get(z) !== t) changes.push(`  ${z}: ${before.get(z) ?? '(none)'} -> ${t}`);
  for (const [z, t] of before) if (!after.has(z)) changes.push(`  ${z}: ${t} -> (removed, no delivery)`);
  console.log(changes.length ? `\n${changes.length} ZIP change(s):\n${changes.slice(0, 50).join('\n')}${changes.length > 50 ? '\n  …' : ''}` : '\nNo ZIP changes.');

  const value = JSON.stringify(next);
  console.log(`\nConfig size: ${(value.length / 1024).toFixed(1)} KB`);
  if (!changes.length) return;
  if (!apply) return console.log('Dry run — re-run with --apply to write it.');

  const data = await gql(SET, { metafields: [{ ownerId: dc.id, namespace: NAMESPACE, key: KEY, type: 'json', value }] });
  const errors = data.metafieldsSet.userErrors;
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log('Done — live at checkout now.');
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
