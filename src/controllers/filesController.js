const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dayjs = require('dayjs');
const pdf = require('pdf-parse');
const db = require('../db');

function computeFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

exports.upload = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const file_hash = computeFileHash(file.path);
    
    // Check for duplicate by hash
    const existing = db.prepare('SELECT * FROM receipt_file WHERE file_hash = ?').get(file_hash);
    
    if (existing) {
      return res.json({ 
        id: existing.id, 
        file_name: existing.file_name, 
        file_path: existing.file_path,
        duplicate: true 
      });
    }

    // Insert new file with hash
    const info = db.prepare(`
      INSERT INTO receipt_file (file_name, file_path, file_hash)
      VALUES (?, ?, ?)
    `).run(file.originalname, file.path, file_hash);

    res.status(201).json({
      id: info.lastInsertRowid,
      file_name: file.originalname,
      file_path: file.path
    });
  } catch (err) {
    next(err);
  }
};

exports.validate = async (req, res, next) => {
  try {
    const id = Number(req.body.id);
    if (!id) return res.status(400).json({ error: 'id is required' });

    const row = db.prepare('SELECT * FROM receipt_file WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'File not found' });

    let is_valid = false;
    let invalid_reason = null;

    if (!fs.existsSync(row.file_path)) {
      invalid_reason = 'File missing on server';
    } else {
      try {
        await pdf(fs.readFileSync(row.file_path));
        is_valid = true;
      } catch (e) {
        invalid_reason = 'Invalid or unreadable PDF';
      }
    }

    db.prepare('UPDATE receipt_file SET is_valid = ?, invalid_reason = ? WHERE id = ?')
      .run(is_valid ? 1 : 0, invalid_reason, id);

    res.json({ id, is_valid, invalid_reason });
  } catch (err) {
    next(err);
  }
};

exports.process = async (req, res, next) => {
  try {
    const id = Number(req.body.id);
    if (!id) return res.status(400).json({ error: 'id is required' });

    const fileRow = db.prepare('SELECT * FROM receipt_file WHERE id = ?').get(id);
    if (!fileRow) return res.status(404).json({ error: 'File not found' });
    if (!fileRow.is_valid) return res.status(400).json({ error: 'File must be valid before processing' });

    const pdfData = await pdf(fs.readFileSync(fileRow.file_path));
    const text = pdfData.text || '';

    // Enhanced parsing logic
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    // Better total amount parsing
    let total_amount = null;
    const totalPatterns = [
      /(?:^|\s)(?:total|grand\s*total|final\s*total|amount\s*due|total\s*due)\s*[:\-]?\s*(\d+\.?\d*)/i,
      /(?:^|\s)total\s+(\d+\.?\d*)/i,
      /(\d+\.?\d*)\s*$/ // Amount at end of line
    ];

    // Look for total amount in lines
    for (const line of lines) {
      // Skip discount/tax lines
      if (/discount|tax(?!\s*total)|subtotal/i.test(line)) continue;
      
      for (const pattern of totalPatterns) {
        const match = line.match(pattern);
        if (match) {
          const amount = parseFloat(match[1]);
          if (amount && amount > 0 && amount < 10000) {
            // Prioritize lines with "total" keyword
            if (/total/i.test(line)) {
              total_amount = amount;
              break;
            } else if (!total_amount) {
              total_amount = amount;
            }
          }
        }
      }
      if (total_amount && /total/i.test(line)) break;
    }

    // Simple merchant and date parsing
    const merchantMatch = text.match(/^(.*?)(?:\n|\r)/);
    const dateMatch = text.match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);

    const merchant_name = merchantMatch ? merchantMatch[1].trim().slice(0, 120) : null;
    const purchased_at = dateMatch ? dayjs(dateMatch[1]).toISOString() : null;

    // Check if receipt already exists for this file_path
    const existing = db.prepare('SELECT id FROM receipt WHERE file_path = ?').get(fileRow.file_path);
    
    let receiptId;
    if (existing) {
      // Update existing receipt
      db.prepare(`
        UPDATE receipt 
        SET purchased_at = ?, merchant_name = ?, total_amount = ?
        WHERE id = ?
      `).run(purchased_at, merchant_name, total_amount, existing.id);
      receiptId = existing.id;
    } else {
      // Insert new receipt
      const info = db.prepare(`
        INSERT INTO receipt (purchased_at, merchant_name, total_amount, file_path)
        VALUES (?, ?, ?, ?)
      `).run(purchased_at, merchant_name, total_amount, fileRow.file_path);
      receiptId = info.lastInsertRowid;
    }

    // Mark file as processed
    db.prepare('UPDATE receipt_file SET is_processed = 1 WHERE id = ?').run(id);

    res.json({
      receipt_id: receiptId,
      merchant_name,
      total_amount,
      purchased_at
    });
  } catch (err) {
    next(err);
  }
};
