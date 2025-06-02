const express = require('express');
const router = express.Router();
const { handleMailStatus } = require('../controllers/emailController');

// Handle mail status updates from Airtable
router.post('/status', express.json(), handleMailStatus);

module.exports = router; 