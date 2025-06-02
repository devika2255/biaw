const express = require('express');
const cors = require('cors');
require('dotenv').config();
const formRoutes = require('./routes/formRoutes');
const stripeRoutes = require('./routes/stripeRoutes');
const emailRoutes = require('./routes/emailRoutes');
const autopayRoutes = require('./routes/autopayRoutes');
const productCheckoutRoutes = require('./routes/productCheckoutRoutes');
const productAutopayRoutes = require('./routes/productAutopayRoutes');
const airtableWebhookRoutes = require('./routes/airtableWebhookRoutes');

const app = express();

// Stripe webhook endpoint must be before express.json() middleware
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

const allowedOrigins = ["https://biaw-stage-api.webflow.io"];
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.send("Server is running and ready to accept requests.");
});

app.use('/api', formRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/email', emailRoutes);
app.use('/api', autopayRoutes);
// builder subscription
app.use('/api/product', productCheckoutRoutes);
app.use('/api/product-autopay', productAutopayRoutes);
// board meeting
app.use('/api/airtable', airtableWebhookRoutes);

module.exports = app;
