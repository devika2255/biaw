const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');

router.post('/submit-data', formController.submitData);

module.exports = router;
