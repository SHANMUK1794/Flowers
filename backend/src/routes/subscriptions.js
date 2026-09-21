const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');
const { sendError } = require('../utils/response');

const router = express.Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, errors.array()[0].msg, 400, errors.array());
  }
  next();
};

/* ---- Subscribe to a plan or custom bundle ---- */
router.post(
  '/',
  authenticate,
  subscriptionController.createSubscription
);

/* ---- Get User Subscriptions ---- */
router.get('/', authenticate, subscriptionController.getUserSubscriptions);

/* ---- Pause Subscription ---- */
router.put('/:id/pause', authenticate, subscriptionController.pauseSubscription);

/* ---- Resume Subscription ---- */
router.put('/:id/resume', authenticate, subscriptionController.resumeSubscription);

/* ---- Cancel Subscription ---- */
router.delete('/:id', authenticate, subscriptionController.cancelSubscription);

module.exports = router;
