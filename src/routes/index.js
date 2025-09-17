const express = require('express');
const filesRouter = require('./files');
const receiptsRouter = require('./receipts');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    name: 'Receipt Processing API',
    version: 'v1',
    docs: '/api-docs',
    endpoints: {
      upload: 'POST /api/v1/upload',
      validate: 'POST /api/v1/upload/validate',
      process: 'POST /api/v1/receipts/process',
      list: 'GET /api/v1/receipts',
      get: 'GET /api/v1/receipts/{id}'
    }
  });
});

router.use('/upload', filesRouter);
router.use('/', receiptsRouter);

module.exports = router;


