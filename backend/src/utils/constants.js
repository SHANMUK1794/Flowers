/**
 * Business constants for FreshPetal Hyderabad
 * Covers delivery zones (Uppal to Shamshabad corridors, IT corridor, etc.)
 */

module.exports = {
  CITY: 'Hyderabad',
  
  // Delivery zones across the Uppal to Shamshabad axis and major IT/residential corridors
  COVERED_AREAS: [
    'Uppal',
    'Nagole',
    'LB Nagar',
    'Dilsukhnagar',
    'Kothapet',
    'Malakpet',
    'Chandrayangutta',
    'Santosh Nagar',
    'Falaknuma',
    'Aramghar',
    'Mailardevpally',
    'Rajendranagar',
    'Shamshabad',
    'Attapur',
    'Mehdipatnam',
    'Banjara Hills',
    'Jubilee Hills',
    'Madhapur',
    'Gachibowli',
    'Kondapur',
    'Hitec City',
    'Financial District',
    'Nanakramguda',
    'Tellapur',
    'Kollur',
    'Manikonda',
    'Narsingi',
    'Kokapet',
    'Kukatpally',
    'Miyapur',
    'Nizampet',
    'Secunderabad',
    'Begumpet',
    'Tarnaka',
    'Habsiguda'
  ],

  // Pricing rules
  PRICING: {
    STANDARD_DELIVERY_FEE: 30,
    FREE_DELIVERY_THRESHOLD: 149, // Free single-order delivery above ₹149
    SUBSCRIPTION_DELIVERY_FREE: true, // All subscriptions get 100% free daily/weekly delivery
    MIN_FLOWER_WEIGHT_GRAMS: 50,
  },

  // Standard early morning delivery time slots
  DELIVERY_SLOTS: [
    '05:30 AM - 06:30 AM (Early Pooja)',
    '06:30 AM - 07:30 AM (Standard Morning)',
    '07:30 AM - 08:30 AM (Late Morning)',
    '05:00 PM - 06:30 PM (Evening Sandhya Aarti)'
  ],

  // Order & subscription status enums
  ORDER_STATUSES: ['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'],
  PAYMENT_STATUSES: ['pending', 'paid', 'failed', 'refunded'],
  SUBSCRIPTION_STATUSES: ['active', 'paused', 'cancelled'],

  // Active discount coupons
  COUPONS: {
    FRESH10: { type: 'percent', value: 10, minOrder: 99, maxDiscount: 50, desc: '10% off for daily pooja orders' },
    FIRST50: { type: 'flat', value: 50, minOrder: 199, maxDiscount: 50, desc: '₹50 off on your first order' },
    SUBGATED: { type: 'percent', value: 15, minOrder: 299, maxDiscount: 100, desc: '15% off first month subscription for gated community residents' }
  }
};
