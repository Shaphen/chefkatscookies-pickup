// Makes sure the shipping zone that holds the $0 "Local Pickup" rate also has
// one flat rate per delivery tier in config/delivery-zip-tiers.csv (same title,
// same price). Creates missing rates and fixes wrong prices; never deletes.
// The Function then shows each buyer only their ZIP's tier.
//
//   node scripts/setup-delivery-rates.cjs           # show the plan
//   node scripts/setup-delivery-rates.cjs --apply   # make the changes

const { gql } = require('./lib/admin.cjs');
const { readTiers } = require('./lib/tiers.cjs');

const PICKUP_RATE = 'Local Pickup';
const apply = process.argv.includes('--apply');

const PROFILES = `{
  deliveryProfiles(first: 20) {
    nodes {
      id name
      profileLocationGroups {
        locationGroup { id }
        locationGroupZones(first: 50) {
          nodes {
            zone { id name }
            methodDefinitions(first: 50) {
              nodes {
                id name active
                rateProvider { ... on DeliveryRateDefinition { id price { amount currencyCode } } }
              }
            }
          }
        }
      }
    }
  }
}`;

const UPDATE = `mutation($id: ID!, $profile: DeliveryProfileInput!) {
  deliveryProfileUpdate(id: $id, profile: $profile) {
    profile { id }
    userErrors { field message }
  }
}`;

async function main() {
  const tiers = readTiers();
  const { deliveryProfiles } = await gql(PROFILES);

  // Locate the zone carrying the Local Pickup rate.
  let target;
  for (const profile of deliveryProfiles.nodes) {
    for (const group of profile.profileLocationGroups) {
      for (const lgz of group.locationGroupZones.nodes) {
        if (lgz.methodDefinitions.nodes.some((m) => m.name === PICKUP_RATE)) {
          if (target) throw new Error(`"${PICKUP_RATE}" exists in more than one zone — refusing to guess`);
          target = { profile, group, lgz };
        }
      }
    }
  }
  if (!target) throw new Error(`No shipping zone has a "${PICKUP_RATE}" rate`);
  const { profile, group, lgz } = target;
  console.log(`Zone "${lgz.zone.name}" in profile "${profile.name}"`);

  const toCreate = [];
  const toUpdate = [];
  for (const tier of tiers) {
    const existing = lgz.methodDefinitions.nodes.find((m) => m.name === tier.title);
    const price = { amount: tier.price, currencyCode: 'USD' };
    if (!existing) {
      toCreate.push({ name: tier.title, active: true, rateDefinition: { price } });
      console.log(`  + create  "${tier.title}"  $${tier.price.toFixed(2)}`);
      continue;
    }
    const rate = existing.rateProvider;
    const current = Number(rate?.price?.amount);
    if (!rate?.id) {
      console.log(`  ! "${tier.title}" exists but isn't a flat rate — fix it in the admin`);
    } else if (current !== tier.price || !existing.active) {
      toUpdate.push({ id: existing.id, active: true, rateDefinition: { id: rate.id, price } });
      console.log(`  ~ update  "${tier.title}"  $${current.toFixed(2)} -> $${tier.price.toFixed(2)}${existing.active ? '' : ' (activate)'}`);
    } else {
      console.log(`  = ok      "${tier.title}"  $${current.toFixed(2)}`);
    }
  }

  if (!toCreate.length && !toUpdate.length) return console.log('Nothing to change.');
  if (!apply) return console.log('\nDry run — re-run with --apply to make these changes.');

  const zone = { id: lgz.zone.id };
  if (toCreate.length) zone.methodDefinitionsToCreate = toCreate;
  if (toUpdate.length) zone.methodDefinitionsToUpdate = toUpdate;
  const data = await gql(UPDATE, {
    id: profile.id,
    profile: { locationGroupsToUpdate: [{ id: group.locationGroup.id, zonesToUpdate: [zone] }] },
  });
  const errors = data.deliveryProfileUpdate.userErrors;
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log('Done.');
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
