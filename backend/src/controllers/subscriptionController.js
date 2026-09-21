const { pool } = require('../models/db');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');

// POST /api/subscriptions
const createSubscription = async (req, res) => {
  const { package_id, custom_items, start_date, delivery_notes } = req.body;

  try {
    let monthlyPrice = 0;

    if (package_id) {
      const { rows: pkg } = await pool.query('SELECT price FROM packages WHERE id = $1', [package_id]);
      if (!pkg.length) {
        return sendError(res, 'Package not found.', 404);
      }
      monthlyPrice = parseFloat(pkg[0].price);
    } else if (custom_items && Array.isArray(custom_items)) {
      // Calculate custom items monthly total (30 deliveries per month)
      let dailyCost = 0;
      for (const item of custom_items) {
        const ratePer50g = parseFloat(item.ratePer50g || item.price || 25);
        const grams = parseFloat(item.grams || 50);
        dailyCost += (grams / 50) * ratePer50g;
      }
      if (req.body.include_coconut) {
        dailyCost += 35 * (req.body.coconut_qty || 1);
      }
      monthlyPrice = dailyCost * 30; // 30-day monthly plan
    } else {
      return sendError(res, 'Please provide either a package_id or custom_items.', 400);
    }

    const { rows } = await pool.query(
      `INSERT INTO subscriptions (
        user_id, package_id, custom_items, status,
        start_date, next_delivery, delivery_notes, monthly_price
      ) VALUES ($1, $2, $3, 'active', COALESCE($4, CURRENT_DATE), COALESCE($4, CURRENT_DATE), $5, $6)
      RETURNING *`,
      [
        req.user.id,
        package_id || null,
        custom_items ? JSON.stringify(custom_items) : null,
        start_date || null,
        delivery_notes || null,
        monthlyPrice
      ]
    );

    return sendCreated(res, { subscription: rows[0] }, 'Subscription created successfully!');
  } catch (err) {
    console.error('createSubscription error:', err);
    return sendError(res, 'Failed to create subscription.', 500);
  }
};

// GET /api/subscriptions
const getUserSubscriptions = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, p.name as package_name, p.badge, p.icon
       FROM subscriptions s
       LEFT JOIN packages p ON s.package_id = p.id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );

    return sendSuccess(res, { subscriptions: rows });
  } catch (err) {
    console.error('getUserSubscriptions error:', err);
    return sendError(res, 'Failed to fetch subscriptions.', 500);
  }
};

// PUT /api/subscriptions/:id/pause
const pauseSubscription = async (req, res) => {
  const { id } = req.params;
  const { pause_until } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE subscriptions
       SET status = 'paused', pause_until = $1
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [pause_until || null, id, req.user.id]
    );

    if (!rows.length) {
      return sendError(res, 'Subscription not found.', 404);
    }

    return sendSuccess(res, { subscription: rows[0] }, 'Subscription paused successfully.');
  } catch (err) {
    console.error('pauseSubscription error:', err);
    return sendError(res, 'Failed to pause subscription.', 500);
  }
};

// PUT /api/subscriptions/:id/resume
const resumeSubscription = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE subscriptions
       SET status = 'active', pause_until = NULL
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.user.id]
    );

    if (!rows.length) {
      return sendError(res, 'Subscription not found.', 404);
    }

    return sendSuccess(res, { subscription: rows[0] }, 'Subscription resumed successfully.');
  } catch (err) {
    console.error('resumeSubscription error:', err);
    return sendError(res, 'Failed to resume subscription.', 500);
  }
};

// DELETE /api/subscriptions/:id
const cancelSubscription = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE subscriptions
       SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.user.id]
    );

    if (!rows.length) {
      return sendError(res, 'Subscription not found.', 404);
    }

    return sendSuccess(res, { subscription: rows[0] }, 'Subscription cancelled.');
  } catch (err) {
    console.error('cancelSubscription error:', err);
    return sendError(res, 'Failed to cancel subscription.', 500);
  }
};

module.exports = {
  createSubscription,
  getUserSubscriptions,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription
};
