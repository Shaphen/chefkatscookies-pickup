// @ts-check
// Pickup + ZIP-tier delivery-customization for Chef Kat's Cookies.
//
// 1. Makes the "Local Pickup" ($0) shipping rate safe and exclusive:
//   - PICKUP cart (cart attribute "Fulfillment Method" == configured pickup value)
//     -> hide every delivery option EXCEPT "Local Pickup", so the customer can't
//     pay a delivery fee on a pickup order.
//   - Otherwise (delivery / unset) -> hide the "Local Pickup" option, so a delivery
//     customer can never select the free pickup rate to dodge the delivery fee.
//
// 2. Distance-priced delivery via ZIP tiers. Shopify's native Local Delivery is
//    invisible to Apple Pay / Google Pay / PayPal express checkout, so delivery is
//    sold as plain shipping rates (one per tier, e.g. "Standard Delivery" $4.99)
//    and this function shows only the tier whose ZIP list contains the buyer's
//    ZIP. A ZIP in no tier -> every tier is hidden (out of the delivery area).
//    Wallets only reveal the ZIP before payment, so ZIP is the finest grain
//    pricing can be. Options whose title isn't a tier title are left alone.
//
// Config comes from the app-owned metafield
//   $app:pickup-delivery-customization / function-configuration
// shaped as:
//   {
//     "pickupOptionTitle": "Local Pickup",
//     "pickupValue": "Pickup",
//     "deliveryTiers": [{ "title": "Local Delivery", "zips": "94536 94538 ..." }, ...]
//   }
// Pickup fields fall back to defaults; with no deliveryTiers, tiering is off.
// Source of truth for the tiers: config/delivery-zip-tiers.csv (pushed by
// scripts/sync-config.js).

/**
 * @typedef {import("../generated/api").CartDeliveryOptionsTransformRunInput} CartDeliveryOptionsTransformRunInput
 * @typedef {import("../generated/api").CartDeliveryOptionsTransformRunResult} CartDeliveryOptionsTransformRunResult
 */

/**
 * @type {CartDeliveryOptionsTransformRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

const norm = (/** @type {unknown} */ s) => String(s ?? "").trim().toLowerCase();

/**
 * @param {CartDeliveryOptionsTransformRunInput} input
 * @returns {CartDeliveryOptionsTransformRunResult}
 */
export function cartDeliveryOptionsTransformRun(input) {
  const config = input?.deliveryCustomization?.metafield?.jsonValue ?? {};
  const pickupTitle = norm(config.pickupOptionTitle ?? "Local Pickup");
  const pickupValue = norm(config.pickupValue ?? "Pickup");

  const isPickupCart = norm(input?.cart?.attribute?.value) === pickupValue;

  // Tier titles + their space-padded ZIP lists. Lookup is a substring search
  // rather than a Map: splitting ~400 ZIPs into a Map costs ~9M of the 11M
  // instruction budget, while a few `includes` calls are nearly free.
  const tiers = (Array.isArray(config.deliveryTiers) ? config.deliveryTiers : [])
    .map((tier) => ({ title: norm(tier?.title), zips: ` ${String(tier?.zips ?? "")} ` }))
    .filter((tier) => tier.title);
  const tierTitles = new Set(tiers.map((tier) => tier.title));
  const tierForZip = (/** @type {string} */ zip) =>
    /^\d{5}$/.test(zip) ? tiers.find((tier) => tier.zips.includes(` ${zip} `))?.title : undefined;

  /** @type {{ deliveryOptionHide: { deliveryOptionHandle: string } }[]} */
  const operations = [];

  for (const group of input?.cart?.deliveryGroups ?? []) {
    // "94538-1234" / " 94538" -> "94538"
    const zip = String(group?.deliveryAddress?.zip ?? "").trim().slice(0, 5);
    const allowedTier = tierForZip(zip);

    for (const option of group?.deliveryOptions ?? []) {
      const title = norm(option?.title);
      const isPickupOption = title === pickupTitle;

      // Pickup cart -> hide everything that is NOT the pickup option.
      // Other cart  -> hide the pickup option, and any delivery tier that isn't
      //                the buyer's ZIP tier.
      const shouldHide = isPickupCart
        ? !isPickupOption
        : isPickupOption || (tierTitles.has(title) && title !== allowedTier);

      if (shouldHide && option?.handle) {
        operations.push({ deliveryOptionHide: { deliveryOptionHandle: option.handle } });
      }
    }
  }

  return operations.length ? { operations } : NO_CHANGES;
}
