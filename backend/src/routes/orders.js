const express  = require('express');
const { pool } = require('../models/db');
const { authenticate } = require('../middleware/auth');
const router   = express.Router();

const DELIVERY_CHARGE          = 40;
const FREE_DELIVERY_THRESHOLD  = 299;

/* ---- Create Order ---- */
router.post('/', authenticate, async (req, res) => {
  const { items, delivery_date, delivery_slot, payment_method, special_instructions, coupon_code } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'At least one item required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calculate totals
    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const { rows } = await client.query(
        'SELECT id, name, price_per_unit, unit_label, is_by_weight FROM products WHERE id=$1 AND in_stock=true',
        [item.product_id]
      );
      if (!rows.length) throw new Error(`Product ${item.product_id} not found or out of stock`);
      const prod      = rows[0];
      const qty       = parseFloat(item.qty);
      const unitPrice = parseFloat(prod.price_per_unit);
      const lineTotal = prod.is_by_weight ? (qty * unitPrice) : (qty * unitPrice);
      subtotal += lineTotal;
      lineItems.push({ prod, qty, unitPrice, lineTotal });
    }

    // Apply delivery charge rules
    let discount = 0;
    if (coupon_code === 'FRESH10') discount = Math.round(subtotal * 0.1);
    const discountedSubtotal = subtotal - discount;
    const deliveryCharge     = discountedSubtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;
    const total              = discountedSubtotal + deliveryCharge;

    // Get user address from their profile
    const { rows: userRows } = await client.query(
      `SELECT u.tower, u.apt_number, s.name as society, s.area
       FROM users u LEFT JOIN societies s ON u.society_id = s.id WHERE u.id=$1`,
      [req.user.id]
    );
    const u = userRows[0];
    const deliveryAddress = {
      society: u?.society || 'Not specified',
      area: u?.area || '',
      tower: u?.tower || '',
      apt: u?.apt_number || '',
    };

    // Insert order
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (user_id, order_type, subtotal, delivery_charge, discount, total,
        delivery_address, delivery_date, delivery_slot, payment_method, special_instructions)
       VALUES ($1,'one_off',$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, total, status, created_at`,
      [req.user.id, subtotal, deliveryCharge, discount, total,
       JSON.stringify(deliveryAddress),
       delivery_date || null,
       delivery_slot || '07:00',
       payment_method || 'cod',
       special_instructions || null]
    );
    const order = orderRows[0];

    // Insert order items
    for (const { prod, qty, unitPrice, lineTotal } of lineItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, qty, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, prod.id, prod.name, qty, unitPrice, lineTotal]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      order: { ...order, subtotal, delivery_charge: deliveryCharge, discount, total },
      message: `Order #${order.id} placed successfully! ${deliveryCharge === 0 ? 'Free delivery applied 🎉' : `Delivery: ₹${deliveryCharge}`}`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message || 'Order failed. Please try again.' });
  } finally {
    client.release();
  }
});

/* ---- Get user's orders ---- */
router.get('/', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.order_type, o.status, o.payment_status, o.payment_method,
            o.subtotal, o.delivery_charge, o.discount, o.total,
            o.delivery_date, o.delivery_slot, o.created_at,
            json_agg(json_build_object('name', oi.product_name,'qty',oi.qty,'unit_price',oi.unit_price,'line_total',oi.line_total)) as items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
     GROUP BY o.id ORDER BY o.created_at DESC`,
    [req.user.id]
  );
  res.json({ orders: rows });
});

/* ---- Get single order ---- */
router.get('/:id', authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, json_agg(oi.*) as items FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id=$1 AND o.user_id=$2
     GROUP BY o.id`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: rows[0] });
});

module.exports = router;
