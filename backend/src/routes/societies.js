const express  = require('express');
const { pool } = require('../models/db');
const router   = express.Router();

router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM societies ORDER BY status DESC, name ASC');
  res.json({ societies: rows });
});

router.get('/zones', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM service_zones WHERE is_active=true ORDER BY area_name');
  res.json({ zones: rows });
});

router.post('/nominate', async (req, res) => {
  const { society_name, area, pin_code, nominator_name, nominator_phone } = req.body;
  if (!society_name || !nominator_phone) return res.status(400).json({ error: 'Society name and your phone required.' });
  try {
    const existing = await pool.query(
      'SELECT id, vote_count FROM society_nominations WHERE society_name ILIKE $1', [society_name]
    );
    if (existing.rows.length) {
      const { rows } = await pool.query(
        'UPDATE society_nominations SET vote_count=vote_count+1 WHERE id=$1 RETURNING id, society_name, vote_count',
        [existing.rows[0].id]
      );
      return res.json({ success: true, nomination: rows[0], message: `Vote counted! ${rows[0].vote_count}/10 residents registered.` });
    }
    const { rows } = await pool.query(
      `INSERT INTO society_nominations (society_name, area, pin_code, nominator_name, nominator_phone)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, society_name, vote_count`,
      [society_name, area || '', pin_code || '', nominator_name || '', nominator_phone]
    );
    res.status(201).json({ success: true, nomination: rows[0], message: '🗳️ Nomination registered! Share with 9 neighbours to launch the route.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit nomination.' });
  }
});

module.exports = router;
