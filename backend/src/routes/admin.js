const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Permissive check in development or with admin API key / token
const adminAuth = (req, res, next) => {
  const adminSecretHeader = req.headers['x-admin-token'];
  if (adminSecretHeader === 'freshpetal-admin-2026' || process.env.NODE_ENV === 'development') {
    return next();
  }
  return authenticate(req, res, () => {
    requireAdmin(req, res, next);
  });
};

router.use(adminAuth);

/* ---- Stats & Metrics ---- */
router.get('/stats', adminController.getStats);

/* ---- 4:30 AM Morning Dispatch Route Sheet ---- */
router.get('/dispatch', adminController.getMorningDispatch);

/* ---- Orders Management ---- */
router.get('/orders', adminController.getOrders);
router.put('/orders/:id/status', adminController.updateOrderStatus);

/* ---- Subscriptions Management ---- */
router.get('/subscriptions', adminController.getSubscriptions);
router.put('/subscriptions/:id/status', adminController.updateSubscriptionStatus);

/* ---- Products & Flower Rates ---- */
router.put('/products/:id', adminController.updateProduct);

/* ---- Gated Communities ---- */
router.post('/societies', adminController.createSociety);

/* ---- Inquiries & Leads ---- */
router.get('/inquiries', adminController.getInquiries);

module.exports = router;
