const { calculateOrderTotals, calculateCustomMixPrice } = require('../utils/calculator');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/cart/validate
const validateAndPrice = async (req, res) => {
  const { items, coupon_code, is_subscription } = req.body;

  try {
    const summary = calculateOrderTotals(items || [], coupon_code, is_subscription);
    return sendSuccess(res, summary);
  } catch (err) {
    console.error('validateAndPrice error:', err);
    return sendError(res, 'Failed to calculate cart pricing.', 500);
  }
};

// POST /api/cart/custom-mix
const calculateCustomMix = async (req, res) => {
  const { flowers, include_coconut, coconut_qty } = req.body;

  try {
    const customTotal = calculateCustomMixPrice(flowers || [], include_coconut, coconut_qty);
    return sendSuccess(res, { customTotal, unit: 'daily pooja mix' });
  } catch (err) {
    console.error('calculateCustomMix error:', err);
    return sendError(res, 'Failed to calculate custom flower mix.', 500);
  }
};

module.exports = {
  validateAndPrice,
  calculateCustomMix
};
