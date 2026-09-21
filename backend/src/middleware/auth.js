const jwt      = require('jsonwebtoken');
const { pool } = require('../models/db');

const JWT_SECRET          = process.env.JWT_SECRET || 'freshpetal_dev_secret_2026';
const JWT_REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET || 'freshpetal_refresh_secret_2026';

function signAccess(payload)   { return jwt.sign(payload, JWT_SECRET,          { expiresIn: '2h'  }); }
function signRefresh(payload)  { return jwt.sign(payload, JWT_REFRESH_SECRET,  { expiresIn: '30d' }); }

async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.access_token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, role, society_id, tower, apt_number FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function optionalAuth(req, res, next) {
  try {
    const token = req.cookies?.access_token || req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
    }
  } catch (_) {}
  next();
}

module.exports = { authenticate, requireAdmin, optionalAuth, signAccess, signRefresh };
