const { pool } = require('../models/db');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');

// GET /api/admin/stats
const getStats = async (_req, res) => {
  try {
    // 1. Total revenue
    const revQuery = await pool.query(
      "SELECT COALESCE(SUM(total), 0) as total_revenue FROM orders WHERE payment_status = 'paid' OR status = 'delivered'"
    );

    // 2. Active subscriptions
    const subQuery = await pool.query(
      "SELECT COUNT(*) as active_subscriptions, COALESCE(SUM(monthly_price), 0) as mrr FROM subscriptions WHERE status = 'active'"
    );

    // 3. Orders today
    const ordersTodayQuery = await pool.query(
      "SELECT COUNT(*) as today_orders FROM orders WHERE created_at::date = CURRENT_DATE"
    );

    // 4. Total registered customers
    const userQuery = await pool.query(
      "SELECT COUNT(*) as total_customers FROM users WHERE role = 'customer'"
    );

    // 5. Total gated societies
    const societyQuery = await pool.query(
      "SELECT COUNT(*) as total_societies, COUNT(*) FILTER (WHERE status = 'active') as active_societies FROM societies"
    );

    // 6. Pending inquiries
    const inquiryQuery = await pool.query(
      "SELECT COUNT(*) as pending_inquiries FROM contact_inquiries WHERE status = 'pending' OR status IS NULL"
    );

    return sendSuccess(res, {
      stats: {
        totalRevenue: parseFloat(revQuery.rows[0].total_revenue),
        activeSubscriptions: parseInt(subQuery.rows[0].active_subscriptions, 10),
        monthlyRecurringRevenue: parseFloat(subQuery.rows[0].mrr),
        todayOrders: parseInt(ordersTodayQuery.rows[0].today_orders, 10),
        totalCustomers: parseInt(userQuery.rows[0].total_customers, 10),
        activeSocieties: parseInt(societyQuery.rows[0].active_societies, 10),
        totalSocieties: parseInt(societyQuery.rows[0].total_societies, 10),
        pendingInquiries: parseInt(inquiryQuery.rows[0].pending_inquiries, 10)
      }
    });
  } catch (err) {
    console.error('admin getStats error:', err);
    return sendError(res, 'Failed to fetch admin stats.', 500);
  }
};

// GET /api/admin/dispatch
// 4:30 AM Morning Route Sheet for delivery partners
const getMorningDispatch = async (req, res) => {
  const { date, society_id } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    // Get active subscriptions delivering today
    let subQuery = `
      SELECT s.id as subscription_id, s.monthly_price, s.custom_items,
             u.id as user_id, u.name as customer_name, u.phone as customer_phone,
             u.tower, u.apt_number,
             soc.id as society_id, soc.name as society_name, soc.area as society_area, soc.delivery_slot,
             p.name as package_name, p.badge as package_badge,
             'subscription' as delivery_type,
             'pending' as delivery_status
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN societies soc ON u.society_id = soc.id
      LEFT JOIN packages p ON s.package_id = p.id
      WHERE s.status = 'active'
    `;
    const params = [];

    if (society_id) {
      params.push(society_id);
      subQuery += ` AND u.society_id = $${params.length}`;
    }

    subQuery += ' ORDER BY soc.name ASC, u.tower ASC, u.apt_number ASC';

    const { rows: subDeliveries } = await pool.query(subQuery, params);

    // Get one-time orders scheduled for this date
    let orderQuery = `
      SELECT o.id as order_id, o.total, o.delivery_slot, o.status as delivery_status,
             o.special_instructions, o.delivery_address,
             u.name as customer_name, u.phone as customer_phone,
             u.tower, u.apt_number,
             soc.id as society_id, soc.name as society_name, soc.area as society_area,
             'order' as delivery_type
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN societies soc ON u.society_id = soc.id
      WHERE (o.delivery_date = $1 OR o.created_at::date = $1)
        AND o.status NOT IN ('cancelled', 'delivered')
    `;
    const orderParams = [targetDate];

    if (society_id) {
      orderParams.push(society_id);
      orderQuery += ` AND u.society_id = $${orderParams.length}`;
    }

    orderQuery += ' ORDER BY soc.name ASC, u.tower ASC, u.apt_number ASC';

    const { rows: orderDeliveries } = await pool.query(orderQuery, orderParams);

    const allDeliveries = [...subDeliveries, ...orderDeliveries];

    // Group summary by society
    const societySummary = {};
    allDeliveries.forEach(d => {
      const sName = d.society_name || 'Individual Community';
      if (!societySummary[sName]) {
        societySummary[sName] = { count: 0, area: d.society_area || 'Hyderabad', slot: d.delivery_slot || '06:00 AM' };
      }
      societySummary[sName].count += 1;
    });

    return sendSuccess(res, {
      date: targetDate,
      totalDeliveries: allDeliveries.length,
      societySummary,
      deliveries: allDeliveries
    });
  } catch (err) {
    console.error('getMorningDispatch error:', err);
    return sendError(res, 'Failed to fetch dispatch route sheet.', 500);
  }
};

// GET /api/admin/orders
const getOrders = async (req, res) => {
  const { status, type, limit = 50 } = req.query;

  try {
    let query = `
      SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             u.tower, u.apt_number,
             s.name as society_name, s.area as society_area
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN societies s ON u.society_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }

    if (type) {
      params.push(type);
      query += ` AND o.order_type = $${params.length}`;
    }

    query += ` ORDER BY o.created_at DESC LIMIT ${parseInt(limit, 10)}`;

    const { rows } = await pool.query(query, params);
    return sendSuccess(res, { orders: rows, count: rows.length });
  } catch (err) {
    console.error('admin getOrders error:', err);
    return sendError(res, 'Failed to fetch orders.', 500);
  }
};

// PUT /api/admin/orders/:id/status
const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status, payment_status } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE orders
       SET status = COALESCE($1, status),
           payment_status = COALESCE($2, payment_status)
       WHERE id = $3
       RETURNING *`,
      [status || null, payment_status || null, id]
    );

    if (!rows.length) {
      return sendError(res, 'Order not found.', 404);
    }

    return sendSuccess(res, { order: rows[0] }, 'Order status updated.');
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    return sendError(res, 'Failed to update order status.', 500);
  }
};

// GET /api/admin/subscriptions
const getSubscriptions = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, u.name as customer_name, u.phone as customer_phone, u.email as customer_email,
             u.tower, u.apt_number,
             soc.name as society_name, soc.area as society_area,
             p.name as package_name, p.badge as package_badge
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN societies soc ON u.society_id = soc.id
      LEFT JOIN packages p ON s.package_id = p.id
      ORDER BY s.created_at DESC
    `);

    return sendSuccess(res, { subscriptions: rows, count: rows.length });
  } catch (err) {
    console.error('admin getSubscriptions error:', err);
    return sendError(res, 'Failed to fetch subscriptions.', 500);
  }
};

// PUT /api/admin/subscriptions/:id/status
const updateSubscriptionStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const { rows } = await pool.query(
      'UPDATE subscriptions SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (!rows.length) {
      return sendError(res, 'Subscription not found.', 404);
    }

    return sendSuccess(res, { subscription: rows[0] }, 'Subscription updated.');
  } catch (err) {
    console.error('updateSubscriptionStatus error:', err);
    return sendError(res, 'Failed to update subscription.', 500);
  }
};

// PUT /api/admin/products/:id
const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { price_per_unit, in_stock, description } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE products
       SET price_per_unit = COALESCE($1, price_per_unit),
           in_stock = COALESCE($2, in_stock),
           description = COALESCE($3, description)
       WHERE id = $4
       RETURNING *`,
      [price_per_unit || null, in_stock !== undefined ? in_stock : null, description || null, id]
    );

    if (!rows.length) {
      return sendError(res, 'Product not found.', 404);
    }

    return sendSuccess(res, { product: rows[0] }, 'Product updated successfully.');
  } catch (err) {
    console.error('updateProduct error:', err);
    return sendError(res, 'Failed to update product.', 500);
  }
};

// POST /api/admin/societies
const createSociety = async (req, res) => {
  const { name, area, delivery_slot, status = 'active' } = req.body;

  if (!name || !area) {
    return sendError(res, 'Society name and Hyderabad area are required.', 400);
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO societies (name, area, delivery_slot, status)
       VALUES ($1, $2, COALESCE($3, '06:00:00'), $4)
       RETURNING *`,
      [name.trim(), area.trim(), delivery_slot || null, status]
    );

    return sendCreated(res, { society: rows[0] }, 'Gated community added successfully!');
  } catch (err) {
    console.error('createSociety error:', err);
    return sendError(res, 'Failed to add society.', 500);
  }
};

// GET /api/admin/inquiries
const getInquiries = async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contact_inquiries ORDER BY created_at DESC');
    return sendSuccess(res, { inquiries: rows });
  } catch (err) {
    console.error('getInquiries error:', err);
    return sendError(res, 'Failed to fetch inquiries.', 500);
  }
};

module.exports = {
  getStats,
  getMorningDispatch,
  getOrders,
  updateOrderStatus,
  getSubscriptions,
  updateSubscriptionStatus,
  updateProduct,
  createSociety,
  getInquiries
};
