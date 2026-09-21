const express = require('express');
const router  = express.Router();

// Stateless server-side cart session helpers
// (Frontend manages cart in localStorage; backend validates on checkout)

router.post('/validate', async (req, res) => {
  const { items } = req.body;
  const { pool } = require('../models/db');
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Items array required' });

  try {
    const validated = [];
    let subtotal = 0;

    for (const item of items) {
      const { rows } = await pool.query(
        'SELECT id, name, price_per_unit, unit_label, is_by_weight, in_stock, min_qty FROM products WHERE id=$1',
        [item.product_id]
      );
      if (!rows.length) continue;
      const prod = rows[0];
      if (!prod.in_stock) {
        validated.push({ ...item, error: `${prod.name} is currently out of stock` });
        continue;
      }
      const qty      = Math.max(parseFloat(item.qty), parseFloat(prod.min_qty));
      const lineTotal = prod.is_by_weight ? qty * prod.price_per_unit : qty * prod.price_per_unit;
      subtotal += lineTotal;
      validated.push({ product_id: prod.id, name: prod.name, qty, unit_label: prod.unit_label, price_per_unit: prod.price_per_unit, line_total: lineTotal });
    }

    const deliveryCharge = subtotal >= 299 ? 0 : 40;
    res.json({
      items: validated,
      subtotal: Math.round(subtotal * 100) / 100,
      delivery_charge: deliveryCharge,
      total: Math.round((subtotal + deliveryCharge) * 100) / 100,
      free_delivery_eligible: subtotal >= 299,
      message: deliveryCharge === 0 ? '🎉 You qualify for FREE delivery!' : `Add ₹${(299 - subtotal).toFixed(0)} more for FREE delivery`
    });
  } catch (err) {
    res.status(500).json({ error: 'Validation failed' });
  }
});

module.exports = router;
