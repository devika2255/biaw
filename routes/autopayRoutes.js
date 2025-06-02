const express = require('express');
const router = express.Router();
const { updateAutopayStatus } = require('../controllers/autopayController');

// Update autopay status endpoint
router.post('/autopay', express.json(), updateAutopayStatus);

module.exports = router; 