const express  = require('express');
const bcrypt   = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool } = require('../models/db');
const { signAccess, signRefresh, authenticate } = require('../middleware/auth');

const router = express.Router();
const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 2 * 60 * 60 * 1000 };

/* ---- Sign Up ---- */
router.post('/signup', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian mobile number required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('society_id').optional().isInt(),
  body('tower').optional().trim(),
  body('apt_number').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, phone, password, society_id, tower, apt_number } = req.body;

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1 OR phone=$2', [email, phone]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email or phone already registered.' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, society_id, tower, apt_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, email, phone, role`,
      [name, email, phone, hash, society_id || null, tower || null, apt_number || null]
    );

    const user     = rows[0];
    const access   = signAccess({ userId: user.id, role: user.role });
    const refresh  = signRefresh({ userId: user.id });

    await pool.query('UPDATE users SET refresh_token=$1 WHERE id=$2', [refresh, user.id]);

    res.cookie('access_token', access, COOKIE_OPTS);
    res.status(201).json({ success: true, user, token: access });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ---- Login ---- */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, password_hash, role, society_id FROM users WHERE email=$1',
      [email]
    );
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const access  = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id });

    await pool.query('UPDATE users SET refresh_token=$1 WHERE id=$2', [refresh, user.id]);

    res.cookie('access_token', access, COOKIE_OPTS);
    delete user.password_hash;
    res.json({ success: true, user, token: access });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ---- Logout ---- */
router.post('/logout', (req, res) => {
  res.clearCookie('access_token');
  res.json({ success: true });
});

/* ---- Get Current User ---- */
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.tower, u.apt_number,
              s.name as society_name, s.area as society_area
       FROM users u LEFT JOIN societies s ON u.society_id = s.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ---- Update Profile ---- */
router.patch('/profile', authenticate, async (req, res) => {
  const { name, phone, society_id, tower, apt_number } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=COALESCE($1,name), phone=COALESCE($2,phone),
       society_id=COALESCE($3,society_id), tower=COALESCE($4,tower),
       apt_number=COALESCE($5,apt_number), updated_at=NOW()
       WHERE id=$6 RETURNING id, name, email, phone`,
      [name, phone, society_id, tower, apt_number, req.user.id]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
