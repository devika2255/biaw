const express = require('express');
const router = express.Router();
const { updateProductAutopayStatus } = require('../controllers/productAutopayController');

// Route to update product subscription status
router.post('/update-status', updateProductAutopayStatus);

module.exports = router; 