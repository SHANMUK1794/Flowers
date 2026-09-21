const express = require('express');
const { body, validationResult } = require('express-validator');
const contactController = require('../controllers/contactController');
const { sendError } = require('../utils/response');

const router = express.Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, errors.array()[0].msg, 400, errors.array());
  }
  next();
};

/* ---- Submit general or event / society inquiry ---- */
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').trim().notEmpty().withMessage('Contact phone number is required')
  ],
  handleValidation,
  contactController.submitInquiry
);

module.exports = router;
