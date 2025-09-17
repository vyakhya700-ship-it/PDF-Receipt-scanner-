const fs = require('fs');
const crypto = require('crypto');
const dayjs = require('dayjs');
const pdf = require('pdf-parse');
const db = require('../db');

function computeFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

function upsertReceiptFileOnUpload(file) {
  if (!file) throw Object.assign(new Error('No file uploaded'), { status: 400 });
  if (!fs.existsSync(file.path)) throw Object.assign(new Error('Uploaded file missing on server'), { status: 400 });

  const file_hash = computeFileHash(file.path);
  const file_size = fs.statSync(file.path).size;
  
  // Check for existing file by hash (true duplicate detection)
  const existing = db.prepare('SELECT * FROM receipt_file WHERE file_hash = ?').get(file_hash);
  
  if (existing) {
    // Update existing record with new file info
    db.prepare(`
      UPDATE receipt_file 
      SET file_name = ?, file_path = ?, file_size = ?, is_valid = 0, 
          invalid_reason = NULL, is_processed = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(file.originalname, file.path, file_size, existing.id);
    
    return { id: existing.id, duplicate: true };
  }

  // Insert new file record
  const info = db.prepare(`
    INSERT INTO receipt_file (file_name, file_path, file_hash, file_size, mime_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(file.originalname, file.path, file_hash, file_size, file.mimetype);
  
  return { id: info.lastInsertRowid, duplicate: false };
}

async function validateReceiptFile(id) {
  const row = db.prepare('SELECT * FROM receipt_file WHERE id = ?').get(id);
  if (!row) throw Object.assign(new Error('File not found'), { status: 404 });
  
  if (!fs.existsSync(row.file_path)) {
    db.prepare('UPDATE receipt_file SET is_valid = 0, invalid_reason = ? WHERE id = ?')
      .run('File missing on server', id);
    return { is_valid: false, invalid_reason: 'File missing on server' };
  }

  try {
    await pdf(fs.readFileSync(row.file_path));
    db.prepare('UPDATE receipt_file SET is_valid = 1, invalid_reason = NULL WHERE id = ?')
      .run(id);
    return { is_valid: true, invalid_reason: null };
  } catch (e) {
    db.prepare('UPDATE receipt_file SET is_valid = 0, invalid_reason = ? WHERE id = ?')
      .run('Invalid or unreadable PDF', id);
    return { is_valid: false, invalid_reason: 'Invalid or unreadable PDF' };
  }
}

module.exports = {
  upsertReceiptFileOnUpload,
  validateReceiptFile,
};
