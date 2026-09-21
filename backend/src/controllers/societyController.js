const { pool } = require('../models/db');
const { COVERED_AREAS } = require('../utils/constants');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');

// GET /api/societies
const getAllSocieties = async (req, res) => {
  const { area, search, status } = req.query;

  try {
    let query = 'SELECT * FROM societies WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (area) {
      params.push(`%${area.trim().toLowerCase()}%`);
      query += ` AND LOWER(area) LIKE $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(area) LIKE $${params.length})`;
    }

    query += ' ORDER BY name ASC';

    const { rows } = await pool.query(query, params);
    return sendSuccess(res, { societies: rows, count: rows.length, coveredAreas: COVERED_AREAS });
  } catch (err) {
    console.error('getAllSocieties error:', err);
    return sendError(res, 'Failed to fetch societies.', 500);
  }
};

// GET /api/societies/check-delivery
const checkDelivery = async (req, res) => {
  const { area, society_name } = req.query;

  if (!area && !society_name) {
    return sendError(res, 'Please provide an area or society name to check delivery.', 400);
  }

  try {
    const isCoveredArea = area && COVERED_AREAS.some(a => a.toLowerCase() === area.trim().toLowerCase());

    const { rows } = await pool.query(
      `SELECT * FROM societies 
       WHERE LOWER(name) LIKE $1 OR LOWER(area) LIKE $2`,
      [`%${(society_name || '').trim().toLowerCase()}%`, `%${(area || '').trim().toLowerCase()}%`]
    );

    const available = isCoveredArea || rows.length > 0;

    return sendSuccess(res, {
      available,
      area,
      matchedSocieties: rows,
      slot: '05:30 AM - 07:00 AM',
      message: available
        ? 'Great news! Daily early morning delivery is available in your community.'
        : 'We are expanding rapidly across Hyderabad! Request your society and get 1 week free trial when we launch.'
    });
  } catch (err) {
    console.error('checkDelivery error:', err);
    return sendError(res, 'Failed to check delivery availability.', 500);
  }
};

module.exports = {
  getAllSocieties,
  checkDelivery
};
