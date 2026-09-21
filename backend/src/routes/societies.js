const express = require('express');
const societyController = require('../controllers/societyController');

const router = express.Router();

router.get('/', societyController.getAllSocieties);
router.get('/check-delivery', societyController.checkDelivery);

module.exports = router;
