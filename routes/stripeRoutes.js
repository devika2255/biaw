const express = require('express');
const router = express.Router();
const { handleWebhook, createCheckoutSession, updateWebflowCertificationStatus } = require('../controllers/stripeController');

// Create checkout session
router.post('/create-checkout', createCheckoutSession);

// Stripe webhook endpoint
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Update Webflow certification status
router.post('/confirm-subscription', express.json(), updateWebflowCertificationStatus);

module.exports = router; 