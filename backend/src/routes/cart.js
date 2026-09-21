const express = require('express');
const cartController = require('../controllers/cartController');

const router = express.Router();

router.post('/validate', cartController.validateAndPrice);
router.post('/custom-mix', cartController.calculateCustomMix);

module.exports = router;
