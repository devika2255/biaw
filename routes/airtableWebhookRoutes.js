const express = require('express');
const router = express.Router();
const { handleAirtableWebhook, handleAirtableUpdateWebhook } = require('../controllers/airtableWebhookController');

// Airtable webhook endpoint
router.post('/webhook', handleAirtableWebhook);
// Airtable update webhook endpoint
router.post('/airtable-update-webhook', handleAirtableUpdateWebhook);

module.exports = router; 