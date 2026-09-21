const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const orderController = require('../controllers/orderController');
const { sendError } = require('../utils/response');

const router = express.Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, errors.array()[0].msg, 400, errors.array());
  }
  next();
};

/* ---- Calculate Checkout Pricing (no auth required for preview) ---- */
router.post('/calculate', orderController.calculateCheckout);

/* ---- Place New Order ---- */
router.post(
  '/',
  authenticate,
  [
    body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
    body('delivery_date').optional().isISO8601().withMessage('Valid delivery date required')
  ],
  handleValidation,
  orderController.createOrder
);

/* ---- Get User Orders ---- */
router.get('/', authenticate, orderController.getUserOrders);

/* ---- Get Specific Order Details ---- */
router.get('/:id', authenticate, orderController.getOrderById);

module.exports = router;
