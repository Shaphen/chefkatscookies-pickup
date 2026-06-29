// @ts-check
// Pickup delivery-customization for Chef Kat's Cookies.
//
// Makes the "Local Pickup" ($0) shipping rate safe and exclusive:
//   - PICKUP cart (cart attribute "Fulfillment Method" == configured pickup value)
//     -> hide every delivery option EXCEPT "Local Pickup", so the customer can't
//     pay a delivery fee on a pickup order.
//   - Otherwise (delivery / unset) -> hide the "Local Pickup" option, so a delivery
//     customer can never select the free pickup rate to dodge the delivery fee.
//
// Config comes from the app-owned metafield
//   $app:pickup-delivery-customization / function-configuration
// shaped as: { "pickupOptionTitle": "Local Pickup", "pickupValue": "Pickup" }
// Both fall back to sensible defaults if the metafield is missing.

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

/**
 * @param {CartDeliveryOptionsTransformRunInput} input
 * @returns {CartDeliveryOptionsTransformRunResult}
 */
export function cartDeliveryOptionsTransformRun(input) {
  const config = input?.deliveryCustomization?.metafield?.jsonValue ?? {};
  const pickupTitle = String(config.pickupOptionTitle ?? "Local Pickup").trim().toLowerCase();
  const pickupValue = String(config.pickupValue ?? "Pickup").trim().toLowerCase();

  const attrValue = String(input?.cart?.attribute?.value ?? "").trim().toLowerCase();
  const isPickupCart = attrValue === pickupValue;

  /** @type {{ deliveryOptionHide: { deliveryOptionHandle: string } }[]} */
  const operations = [];

  for (const group of input?.cart?.deliveryGroups ?? []) {
    for (const option of group?.deliveryOptions ?? []) {
      const title = String(option?.title ?? "").trim().toLowerCase();
      const isPickupOption = title === pickupTitle;

      // Pickup cart -> hide everything that is NOT the pickup option.
      // Other cart  -> hide the pickup option only.
      const shouldHide = isPickupCart ? !isPickupOption : isPickupOption;

      if (shouldHide && option?.handle) {
        operations.push({ deliveryOptionHide: { deliveryOptionHandle: option.handle } });
      }
    }
  }

  return operations.length ? { operations } : NO_CHANGES;
}
