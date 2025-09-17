const db = require('../db');
const receiptsService = require('../services/receiptsService');

exports.list = (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM receipt ORDER BY id DESC').all();
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM receipt WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.process = async (req, res, next) => {
  try {
    const id = Number(req.body.id);
    if (!id) return res.status(400).json({ error: 'id is required' });
    const result = await receiptsService.processFileToReceipt(id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};


