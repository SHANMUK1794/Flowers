const bcrypt = require('bcryptjs');
const { pool } = require('../models/db');
const { signAccess, signRefresh } = require('../middleware/auth');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');
const { normalizePhone } = require('../utils/validators');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 2 * 60 * 60 * 1000 // 2 hours
};

// POST /api/auth/signup
const signup = async (req, res) => {
  const { name, email, phone, password, society_id, tower, apt_number } = req.body;
  const cleanPhone = normalizePhone(phone);

  try {
    const exists = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email.toLowerCase(), cleanPhone]
    );

    if (exists.rows.length) {
      return sendError(res, 'Email or phone number is already registered.', 409);
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, society_id, tower, apt_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, phone, role, society_id, tower, apt_number, created_at`,
      [name.trim(), email.toLowerCase(), cleanPhone, hash, society_id || null, tower || null, apt_number || null]
    );

    const user = rows[0];
    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id });

    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refresh, user.id]);

    res.cookie('access_token', access, COOKIE_OPTS);
    return sendCreated(res, { user, token: access }, 'Account created successfully!');
  } catch (err) {
    console.error('Signup error:', err);
    return sendError(res, 'Server error during registration.', 500);
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.role, u.society_id, u.tower, u.apt_number,
              s.name as society_name, s.area as society_area
       FROM users u
       LEFT JOIN societies s ON u.society_id = s.id
       WHERE u.email = $1 OR u.phone = $1`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !user.password_hash) {
      return sendError(res, 'Invalid email or password.', 401);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return sendError(res, 'Invalid email or password.', 401);
    }

    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id });

    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refresh, user.id]);

    res.cookie('access_token', access, COOKIE_OPTS);
    delete user.password_hash;

    return sendSuccess(res, { user, token: access }, 'Welcome back to FreshPetal!');
  } catch (err) {
    console.error('Login error:', err);
    return sendError(res, 'Server error during login.', 500);
  }
};

// POST /api/auth/logout
const logout = (_req, res) => {
  res.clearCookie('access_token');
  return sendSuccess(res, {}, 'Logged out successfully.');
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.tower, u.apt_number,
              s.id as society_id, s.name as society_name, s.area as society_area, s.delivery_slot
       FROM users u
       LEFT JOIN societies s ON u.society_id = s.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (!rows.length) {
      return sendError(res, 'User not found.', 404);
    }

    return sendSuccess(res, { user: rows[0] });
  } catch (err) {
    console.error('getMe error:', err);
    return sendError(res, 'Failed to fetch user profile.', 500);
  }
};

// PUT /api/auth/profile
const updateProfile = async (req, res) => {
  const { name, phone, society_id, tower, apt_number } = req.body;
  const cleanPhone = phone ? normalizePhone(phone) : null;

  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           society_id = COALESCE($3, society_id),
           tower = COALESCE($4, tower),
           apt_number = COALESCE($5, apt_number),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, email, phone, role, society_id, tower, apt_number`,
      [name ? name.trim() : null, cleanPhone, society_id || null, tower || null, apt_number || null, req.user.id]
    );

    return sendSuccess(res, { user: rows[0] }, 'Profile updated successfully.');
  } catch (err) {
    console.error('updateProfile error:', err);
    return sendError(res, 'Failed to update profile.', 500);
  }
};

// POST /api/auth/google
const googleLogin = async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return sendError(res, 'Google credential token is required.', 400);
  }

  try {
    // Verify token with Google's public tokeninfo endpoint
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!googleRes.ok) {
      return sendError(res, 'Invalid or expired Google authentication token.', 401);
    }

    const payload = await googleRes.json();
    const { email, name, sub: google_id } = payload;

    if (!email) {
      return sendError(res, 'No verified email address received from Google account.', 400);
    }

    // Check if user exists by email
    let { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.society_id, u.tower, u.apt_number,
              s.name as society_name, s.area as society_area
       FROM users u
       LEFT JOIN societies s ON u.society_id = s.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    let user;
    if (rows.length > 0) {
      user = rows[0];
      // Update Google ID and verify email
      await pool.query(
        'UPDATE users SET google_id = COALESCE(google_id, $1), is_verified = TRUE, updated_at = NOW() WHERE id = $2',
        [google_id, user.id]
      );
    } else {
      // Create new customer account with verified Google email
      const insertRes = await pool.query(
        `INSERT INTO users (name, email, google_id, role, is_verified)
         VALUES ($1, $2, $3, 'customer', TRUE)
         RETURNING id, name, email, phone, role, society_id, tower, apt_number, created_at`,
        [name || email.split('@')[0], email.toLowerCase(), google_id]
      );
      user = insertRes.rows[0];
    }

    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id });

    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refresh, user.id]);
    res.cookie('access_token', access, COOKIE_OPTS);

    return sendSuccess(res, { user, token: access }, 'Google Sign-In successful! 🌸');
  } catch (err) {
    console.error('Google Auth error:', err);
    return sendError(res, 'Server error during Google authentication.', 500);
  }
};

module.exports = {
  signup,
  login,
  logout,
  getMe,
  updateProfile,
  googleLogin
};
