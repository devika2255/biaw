const express = require('express');
const router = express.Router();
const { updateCertificationStatus } = require('../controllers/webflowController');

// Update certification status endpoint
router.post('/update-certification', express.json(), updateCertificationStatus);

module.exports = router; 