const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../models/db');
const router  = express.Router();

router.post('/', [
  body('name').trim().notEmpty(),
  body('phone').optional().matches(/^[6-9]\d{9}$/),
  body('message').trim().notEmpty().withMessage('Message is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, phone, enquiry_type, message } = req.body;
  try {
    await pool.query(
      'INSERT INTO contact_enquiries (name, email, phone, enquiry_type, message) VALUES ($1,$2,$3,$4,$5)',
      [name, email || null, phone || null, enquiry_type || 'general', message]
    );
    res.json({ success: true, message: "Thank you! We'll get back to you within 4 hours on WhatsApp." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit. Please call us directly.' });
  }
});

module.exports = router;
