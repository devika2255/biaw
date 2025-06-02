const base = require('../config/airtableConfig');

const createMainRecord = async (mainRecord) => {
  return await base(process.env.AIRTABLE_TABLE_NAMES).create(mainRecord);
};

const createReferenceRecords = async (referenceRecords) => {
  return await base(process.env.AIRTABLE_TABLE_NAMES2).create(referenceRecords);
};

module.exports = { createMainRecord, createReferenceRecords };
