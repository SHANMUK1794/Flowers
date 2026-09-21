const express  = require('express');
const { pool } = require('../models/db');
const { authenticate } = require('../middleware/auth');
const router   = express.Router();

/* ---- Subscribe to a package ---- */
router.post('/', authenticate, async (req, res) => {
  const { package_id, custom_items, delivery_notes } = req.body;
  if (!package_id && !custom_items) return res.status(400).json({ error: 'Package or custom items required.' });

  try {
    let monthly_price = null;
    if (package_id) {
      const { rows } = await pool.query('SELECT price, frequency FROM packages WHERE id=$1 AND is_active=true', [package_id]);
      if (!rows.length) return res.status(404).json({ error: 'Package not found.' });
      monthly_price = rows[0].price;
    }

    const { rows } = await pool.query(
      `INSERT INTO subscriptions (user_id, package_id, custom_items, delivery_notes, monthly_price, next_delivery)
       VALUES ($1,$2,$3,$4,$5, CURRENT_DATE + INTERVAL '1 day')
       RETURNING *`,
      [req.user.id, package_id || null, custom_items ? JSON.stringify(custom_items) : null,
       delivery_notes || null, monthly_price]
    );
    res.status(201).json({ success: true, subscription: rows[0], message: '🌸 Subscription activated! First delivery tomorrow.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create subscription.' });
  }
});

/* ---- Get user subscriptions ---- */
router.get('/', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, p.name as package_name, p.frequency, p.icon, p.color_scheme
     FROM subscriptions s
     LEFT JOIN packages p ON s.package_id = p.id
     WHERE s.user_id = $1 AND s.status != 'cancelled'
     ORDER BY s.created_at DESC`,
    [req.user.id]
  );
  res.json({ subscriptions: rows });
});

/* ---- Pause subscription ---- */
router.patch('/:id/pause', authenticate, async (req, res) => {
  const { pause_until } = req.body;
  const { rows } = await pool.query(
    `UPDATE subscriptions SET status='paused', pause_until=$1
     WHERE id=$2 AND user_id=$3 RETURNING id, status, pause_until`,
    [pause_until || null, req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Subscription not found.' });
  res.json({ success: true, subscription: rows[0], message: '⏸️ Subscription paused. No deliveries until resumed.' });
});

/* ---- Resume subscription ---- */
router.patch('/:id/resume', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE subscriptions SET status='active', pause_until=NULL, next_delivery=CURRENT_DATE + INTERVAL '1 day'
     WHERE id=$1 AND user_id=$2 RETURNING id, status`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Subscription not found.' });
  res.json({ success: true, subscription: rows[0], message: '✅ Subscription resumed! Delivery from tomorrow.' });
});

/* ---- Cancel subscription ---- */
router.patch('/:id/cancel', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE subscriptions SET status='cancelled' WHERE id=$1 AND user_id=$2 RETURNING id, status`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Subscription not found.' });
  res.json({ success: true, message: 'Subscription cancelled.' });
});

module.exports = router;
