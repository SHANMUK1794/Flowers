const { pool } = require('../models/db');
const { calculateOrderTotals } = require('../utils/calculator');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');

// POST /api/orders
const createOrder = async (req, res) => {
  const {
    items,
    coupon_code,
    order_type = 'one_off',
    delivery_date,
    delivery_slot,
    delivery_address,
    special_instructions,
    payment_method = 'razorpay'
  } = req.body;

  if (!items || !items.length) {
    return sendError(res, 'Order must contain at least one item.', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch product details for all items to avoid trusting client price
    const productIds = items.map(i => i.product_id);
    const { rows: dbProducts } = await client.query(
      'SELECT id, name, price_per_unit, is_by_weight FROM products WHERE id = ANY($1)',
      [productIds]
    );

    const productMap = {};
    dbProducts.forEach(p => { productMap[p.id] = p; });

    // Build verified items array
    const verifiedItems = [];
    for (const item of items) {
      const dbProd = productMap[item.product_id];
      if (!dbProd) {
        await client.query('ROLLBACK');
        return sendError(res, `Product with ID ${item.product_id} not found.`, 400);
      }

      verifiedItems.push({
        product_id: dbProd.id,
        name: dbProd.name,
        unit_price: parseFloat(dbProd.price_per_unit),
        qty: parseFloat(item.qty),
        unit_label: item.unit_label || (dbProd.is_by_weight ? 'grams' : 'pcs'),
        is_by_weight: dbProd.is_by_weight
      });
    }

    const { subtotal, deliveryCharge, discount, total, appliedCoupon } = calculateOrderTotals(
      verifiedItems,
      coupon_code,
      order_type === 'subscription'
    );

    // Insert order
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (
        user_id, order_type, status, payment_status, payment_method,
        subtotal, delivery_charge, discount, total,
        delivery_address, delivery_date, delivery_slot, special_instructions
      ) VALUES ($1, $2, 'pending', 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, created_at, status, total`,
      [
        req.user.id,
        order_type,
        payment_method,
        subtotal,
        deliveryCharge,
        discount,
        total,
        delivery_address ? JSON.stringify(delivery_address) : null,
        delivery_date || null,
        delivery_slot || null,
        special_instructions || null
      ]
    );

    const orderId = orderRows[0].id;

    // Insert order items
    for (const vItem of verifiedItems) {
      const lineTotal = vItem.is_by_weight
        ? (vItem.qty / 50) * vItem.unit_price
        : vItem.qty * vItem.unit_price;

      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, qty, unit_label, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, vItem.product_id, vItem.name, vItem.qty, vItem.unit_label, vItem.unit_price, lineTotal]
      );
    }

    await client.query('COMMIT');

    return sendCreated(res, {
      order_id: orderId,
      total,
      subtotal,
      delivery_charge: deliveryCharge,
      discount,
      applied_coupon: appliedCoupon,
      status: 'pending'
    }, 'Order created successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createOrder error:', err);
    return sendError(res, 'Failed to create order. Please try again.', 500);
  } finally {
    client.release();
  }
};

// GET /api/orders
const getUserOrders = async (req, res) => {
  try {
    const { rows: orders } = await pool.query(
      `SELECT o.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'product_id', oi.product_id,
                    'product_name', oi.product_name,
                    'qty', oi.qty,
                    'unit_label', oi.unit_label,
                    'unit_price', oi.unit_price,
                    'line_total', oi.line_total
                  )
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'
              ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    return sendSuccess(res, { orders });
  } catch (err) {
    console.error('getUserOrders error:', err);
    return sendError(res, 'Failed to fetch orders.', 500);
  }
};

// GET /api/orders/:id
const getOrderById = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT o.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'product_id', oi.product_id,
                    'product_name', oi.product_name,
                    'qty', oi.qty,
                    'unit_label', oi.unit_label,
                    'unit_price', oi.unit_price,
                    'line_total', oi.line_total
                  )
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'
              ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 AND o.user_id = $2
       GROUP BY o.id`,
      [id, req.user.id]
    );

    if (!rows.length) {
      return sendError(res, 'Order not found.', 404);
    }

    return sendSuccess(res, { order: rows[0] });
  } catch (err) {
    console.error('getOrderById error:', err);
    return sendError(res, 'Failed to fetch order.', 500);
  }
};

// POST /api/orders/calculate
const calculateCheckout = async (req, res) => {
  const { items, coupon_code, is_subscription } = req.body;

  try {
    if (!items || !items.length) {
      return sendSuccess(res, {
        subtotal: 0,
        deliveryCharge: 0,
        discount: 0,
        total: 0,
        freeDeliveryUnlocked: false,
        amountNeededForFreeDelivery: 149
      });
    }

    const totals = calculateOrderTotals(items, coupon_code, is_subscription);
    return sendSuccess(res, totals);
  } catch (err) {
    console.error('calculateCheckout error:', err);
    return sendError(res, 'Failed to calculate checkout totals.', 500);
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById,
  calculateCheckout
};
