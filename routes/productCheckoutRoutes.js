const express = require('express');
const router = express.Router();
const { handleProductCheckout } = require('../controllers/productCheckoutController');

// Product checkout endpoint
router.post('/checkout', express.json(), handleProductCheckout);

module.exports = router; 