const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');
const { sendError } = require('../utils/response');

const router = express.Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, errors.array()[0].msg, 400, errors.array());
  }
  next();
};

/* ---- Sign Up ---- */
router.post(
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email address is required'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian mobile number required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('society_id').optional().isInt(),
    body('tower').optional().trim(),
    body('apt_number').optional().trim(),
  ],
  handleValidation,
  authController.signup
);

/* ---- Login ---- */
router.post(
  '/login',
  [
    body('email').notEmpty().withMessage('Email or phone is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidation,
  authController.login
);

/* ---- Logout ---- */
router.post('/logout', authController.logout);

/* ---- Get Current User Profile ---- */
router.get('/me', authenticate, authController.getMe);

/* ---- Update Profile ---- */
router.put('/profile', authenticate, authController.updateProfile);

module.exports = router;
