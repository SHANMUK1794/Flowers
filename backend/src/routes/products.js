const express = require('express');
const productController = require('../controllers/productController');

const router = express.Router();

router.get('/', productController.getProducts);
router.get('/categories', productController.getCategories);
router.get('/packages', productController.getPackages);
router.get('/:id', productController.getProductById);

module.exports = router;
