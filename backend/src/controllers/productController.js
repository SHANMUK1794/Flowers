const { pool } = require('../models/db');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/products
const getProducts = async (req, res) => {
  const { category, search, in_stock } = req.query;

  try {
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND c.slug = $${params.length}`;
    }

    if (in_stock !== undefined) {
      params.push(in_stock === 'true');
      query += ` AND p.in_stock = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(p.name) LIKE $${params.length} OR LOWER(p.name_telugu) LIKE $${params.length} OR LOWER(p.description) LIKE $${params.length})`;
    }

    query += ' ORDER BY p.sort_order ASC, p.id ASC';

    const { rows } = await pool.query(query, params);
    return sendSuccess(res, { products: rows, count: rows.length });
  } catch (err) {
    console.error('getProducts error:', err);
    return sendError(res, 'Failed to fetch products.', 500);
  }
};

// GET /api/products/:id
const getProductById = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1 OR p.slug = $1`,
      [id]
    );

    if (!rows.length) {
      return sendError(res, 'Product not found.', 404);
    }

    return sendSuccess(res, { product: rows[0] });
  } catch (err) {
    console.error('getProductById error:', err);
    return sendError(res, 'Failed to fetch product.', 500);
  }
};

// GET /api/products/categories
const getCategories = async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY sort_order ASC');
    return sendSuccess(res, { categories: rows });
  } catch (err) {
    console.error('getCategories error:', err);
    return sendError(res, 'Failed to fetch categories.', 500);
  }
};

// GET /api/products/packages
const getPackages = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pk.*,
             COALESCE(
               json_agg(
                 json_build_object(
                   'product_id', pr.id,
                   'name', pr.name,
                   'name_telugu', pr.name_telugu,
                   'qty', pi.qty,
                   'unit_label', pi.unit_label
                 )
               ) FILTER (WHERE pr.id IS NOT NULL), '[]'
             ) as items
      FROM packages pk
      LEFT JOIN package_items pi ON pk.id = pi.package_id
      LEFT JOIN products pr ON pi.product_id = pr.id
      WHERE pk.is_active = TRUE
      GROUP BY pk.id
      ORDER BY pk.sort_order ASC
    `);

    return sendSuccess(res, { packages: rows });
  } catch (err) {
    console.error('getPackages error:', err);
    return sendError(res, 'Failed to fetch subscription packages.', 500);
  }
};

module.exports = {
  getProducts,
  getProductById,
  getCategories,
  getPackages
};
