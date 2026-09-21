const { pool } = require('../models/db');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');

// POST /api/contact
const submitInquiry = async (req, res) => {
  const { name, phone, email, type = 'general', message, society_name, flat_count, event_date } = req.body;

  if (!name || !phone) {
    return sendError(res, 'Name and phone number are required.', 400);
  }

  try {
    const fullMessage = [
      message,
      society_name ? `Society: ${society_name}` : null,
      flat_count ? `Flats: ${flat_count}` : null,
      event_date ? `Event Date: ${event_date}` : null
    ].filter(Boolean).join(' | ');

    const { rows } = await pool.query(
      `INSERT INTO contact_enquiries (name, email, phone, enquiry_type, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [name.trim(), email ? email.trim() : null, phone.trim(), type, fullMessage || null]
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
