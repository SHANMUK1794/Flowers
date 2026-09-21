const { PRICING, COUPONS } = require('./constants');

/**
 * Calculates cart / order totals with delivery fee and coupon logic
 * @param {Array} items - Array of { price, qty, is_by_weight }
 * @param {string} couponCode - Optional coupon code
 * @param {boolean} isSubscription - Whether this is a recurring subscription
 */
function calculateOrderTotals(items = [], couponCode = null, isSubscription = false) {
  let subtotal = 0;

  for (const item of items) {
    const unitPrice = parseFloat(item.price || item.unit_price || 0);
    const qty = parseFloat(item.qty || 1);

    if (item.is_by_weight) {
      // qty in grams, unitPrice per 50g base unit
      const baseUnits = qty / 50;
      subtotal += baseUnits * unitPrice;
    } else {
      // per piece or package
      subtotal += qty * unitPrice;
    }
  }

  // Delivery charge rule:
  // Subscriptions have 100% free delivery
  // One-time orders have free delivery over ₹149, else ₹30 standard delivery fee
  let deliveryCharge = 0;
  if (!isSubscription) {
    deliveryCharge = subtotal >= PRICING.FREE_DELIVERY_THRESHOLD || subtotal === 0 ? 0 : PRICING.STANDARD_DELIVERY_FEE;
  }

  // Coupon discount calculation
  let discount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const code = couponCode.trim().toUpperCase();
    const coupon = COUPONS[code];

    if (coupon && subtotal >= coupon.minOrder) {
      if (coupon.type === 'percent') {
        discount = Math.min((subtotal * coupon.value) / 100, coupon.maxDiscount);
      } else if (coupon.type === 'flat') {
        discount = Math.min(coupon.value, subtotal);
      }
      appliedCoupon = { code, discount, description: coupon.desc };
    }
  }

  const total = Math.max(0, subtotal - discount + deliveryCharge);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    deliveryCharge: Math.round(deliveryCharge * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    total: Math.round(total * 100) / 100,
    freeDeliveryUnlocked: deliveryCharge === 0,
    amountNeededForFreeDelivery: Math.max(0, PRICING.FREE_DELIVERY_THRESHOLD - subtotal),
    appliedCoupon
  };
}

/**
 * Calculates custom mix flower price (e.g. 50g Marigold + 50g Chamanthi + 1 Coconut)
 */
function calculateCustomMixPrice(flowerItems = [], includeCoconut = false, coconutQty = 1) {
  let subtotal = 0;
  for (const f of flowerItems) {
    // each flower has rate per 50g
    const grams = f.grams || 50;
    const ratePer50g = f.ratePer50g || 25;
    subtotal += (grams / 50) * ratePer50g;
  }

  if (includeCoconut) {
    const coconutRate = 35; // ₹35 fresh pooja coconut
    subtotal += (coconutQty || 1) * coconutRate;
  }

  return Math.round(subtotal * 100) / 100;
}

module.exports = {
  calculateOrderTotals,
  calculateCustomMixPrice
};
