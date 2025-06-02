const Airtable = require('airtable');
require('dotenv').config();

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEYS }).base(process.env.AIRTABLE_BASE_ID1);

module.exports = base;
