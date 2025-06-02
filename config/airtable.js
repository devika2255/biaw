const Airtable = require('airtable');

const base2 = new Airtable({ apiKey: process.env.AIRTABLE_API_KEYS }).base(process.env.AIRTABLE_BASE_ID1);

module.exports = { base2 }; 