const express = require('express');
const receiptsController = require('../controllers/receiptsController');

const router = express.Router();

router.get('/receipts', receiptsController.list);
router.get('/receipts/:id', receiptsController.getById);
router.post('/receipts/process', express.urlencoded({ extended: true }), receiptsController.process);

module.exports = router;


