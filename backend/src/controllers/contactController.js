const { pool } = require('../models/db');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');

// POST /api/contact
const submitInquiry = async (req, res) => {
  const { name, phone, email, type = 'general', message, society_name, flat_count, event_date } = req.body;

  if (!name || !phone) {
    return sendError(res, 'Name and phone number are required.', 400);
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO contact_inquiries (name, phone, email, type, message, society_name, flat_count, event_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        name.trim(),
        phone.trim(),
        email ? email.trim() : null,
        type,
        message || null,
        society_name || null,
        flat_count ? parseInt(flat_count, 10) : null,
        event_date || null
      ]
    );

    return sendCreated(res, {
      inquiry_id: rows[0].id,
      message: 'Thank you! Our Hyderabad team will contact you within 2 hours.'
    });
  } catch (err) {
    console.error('submitInquiry error:', err);
    return sendError(res, 'Failed to submit inquiry. Please try again or reach out on WhatsApp.', 500);
  }
};

module.exports = {
  submitInquiry
};
