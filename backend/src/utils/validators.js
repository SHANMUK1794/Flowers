/**
 * Validation helpers for user input, Hyderabad phone numbers, and address formats
 */

function isValidIndianPhone(phone) {
  if (!phone) return false;
  const clean = String(phone).replace(/[\s\-\+]/g, '');
  // Indian mobile: 10 digits starting with 6, 7, 8, 9, or prefixed with 91
  return /^(91)?[6-9]\d{9}$/.test(clean);
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function normalizePhone(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/[\s\-\+]/g, '');
  return clean.length === 12 && clean.startsWith('91') ? clean.slice(2) : clean;
}

module.exports = {
  isValidIndianPhone,
  isValidEmail,
  normalizePhone
};
