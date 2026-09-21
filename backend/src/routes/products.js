const express  = require('express');
const { pool } = require('../models/db');
const router   = express.Router();

/* ---- List all products (with optional category filter) ---- */
router.get('/', async (req, res) => {
  const { category, search, in_stock } = req.query;
  try {
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (category) { query += ` AND c.slug = $${idx++}`; params.push(category); }
    if (in_stock === 'true') { query += ` AND p.in_stock = true`; }
    if (search) {
      query += ` AND (p.name ILIKE $${idx} OR p.name_telugu ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    query += ' ORDER BY p.sort_order ASC, p.id ASC';

    const { rows } = await pool.query(query, params);
    res.json({ products: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ---- Get all categories ---- */
router.get('/categories', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM categories ORDER BY sort_order');
  res.json({ categories: rows });
});

/* ---- Get all packages ---- */
router.get('/packages', async (_req, res) => {
  try {
    const { rows: packages } = await pool.query(
      'SELECT * FROM packages WHERE is_active = true ORDER BY sort_order'
    );
    // Fetch items for each package
    for (const pkg of packages) {
      const { rows: items } = await pool.query(
        `SELECT pi.qty, pi.unit_label, p.name, p.image_emoji
         FROM package_items pi
         JOIN products p ON pi.product_id = p.id
         WHERE pi.package_id = $1`, [pkg.id]
      );
      pkg.items = items;
    }
    res.json({ packages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ---- Single product ---- */
router.get('/:slug', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, c.name as category_name, c.slug as category_slug
     FROM products p JOIN categories c ON p.category_id = c.id
     WHERE p.slug = $1`, [req.params.slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: rows[0] });
});

/* ---- Price calculator for custom bouquet ---- */
router.post('/calculate', async (req, res) => {
  const { items } = req.body; // [{ product_id, qty }]
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Items required' });

  try {
    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const { rows } = await pool.query(
        'SELECT id, name, price_per_unit, unit_label, is_by_weight, min_qty FROM products WHERE id=$1',
        [item.product_id]
      );
      if (!rows.length) continue;
      const prod = rows[0];
      const qty  = parseFloat(item.qty) || parseFloat(prod.min_qty);
      const lineTotal = prod.is_by_weight
        ? (qty / 1) * prod.price_per_unit   // price_per_unit is per gram
        : qty * prod.price_per_unit;          // price_per_unit is per piece

      subtotal += lineTotal;
      lineItems.push({ ...prod, qty, lineTotal });
    }

    const DELIVERY_CHARGE = 40;
    const FREE_DELIVERY_THRESHOLD = 299; // orders above this get free delivery
    const deliveryCharge = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;

    res.json({
      subtotal: Math.round(subtotal * 100) / 100,
      delivery_charge: deliveryCharge,
      total: Math.round((subtotal + deliveryCharge) * 100) / 100,
      free_delivery_eligible: subtotal >= FREE_DELIVERY_THRESHOLD,
      items: lineItems
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Calculation failed.' });
  }
});

module.exports = router;
