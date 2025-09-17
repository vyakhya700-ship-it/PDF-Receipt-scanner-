const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const pdf = require('pdf-parse');
const db = require('../db');

function now() {
  return dayjs().toISOString();
}

function normalizeText(raw) {
  if (!raw) return '';
  let t = raw
    .replace(/[\u00A0\u2000-\u200B]/g, ' ') // non-breaking/zero-width spaces
    .replace(/\t/g, ' ')
    .replace(/\s+$/gm, '')
    .replace(/\u20B9/g, '₹'); // normalize INR symbol
  return t;
}

function parseDateFromLines(lines) {
  const patterns = [
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i, // 25 Nov 2021
    /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/, // 2021-11-25
    /(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/, // 11/25/2021
    /(?:date|bill date|invoice date)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i
  ];
  
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        let dateStr;
        if (pattern.source.includes('jan|feb')) {
          // Handle "25 Nov 2021" format
          dateStr = `${match[1]} ${match[2]} ${match[3]}`;
        } else {
          dateStr = match[1] || match[0];
        }
        
        const parsed = dayjs(dateStr);
        if (parsed.isValid() && parsed.year() > 1990 && parsed.year() < 2030) {
          return parsed.toISOString();
        }
      }
    }
  }
  return null;
}

function parseTotalFromLines(lines) {
  const keywords = [
    /(?:grand\s*)?total\s*[:\-]?\s*/i,
    /total\s*amount\s*[:\-]?\s*/i,
    /amount\s*(?:due|payable)\s*[:\-]?\s*/i,
    /balance\s*due\s*[:\-]?\s*/i,
    /total\s*due\s*[:\-]?\s*/i,
    /paid\s*master\s*card\s*[:\-]?\s*/i,
    /net\s*amount\s*[:\-]?\s*/i,
    /final\s*amount\s*[:\-]?\s*/i
  ];
  
  // Exclude these patterns to avoid false positives
  const excludePatterns = /sub\s*total|tax\b|tip\b|change\b|discount\b|refund|zip|address|phone|device\s*id/i;
  
  // Money patterns with decimal support
  const moneyPatterns = [
    /\$?\s*(\d{1,4}(?:\.\d{2}))\s*$/,  // $3.86 or 3.86 at end of line
    /(\d{1,4}\.\d{2})\s*\$?/,          // 3.86$ or 3.86
    /\$\s*(\d{1,4}(?:\.\d{2})?)/       // $ 3.86
  ];

  let bestMatch = null;
  let bestScore = 0;

  // Look for keyword + amount patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip lines with exclude patterns
    if (excludePatterns.test(line)) continue;
    
    for (const keyword of keywords) {
      if (keyword.test(line)) {
        // Try to find money in same line after keyword
        const afterKeyword = line.replace(keyword, '').trim();
        
        for (const moneyPattern of moneyPatterns) {
          const m = afterKeyword.match(moneyPattern);
          if (m) {
            const amount = parseFloat(m[1]);
            if (amount && amount > 0 && amount < 10000) {
              const score = 10; // High score for keyword match
              if (score > bestScore) {
                bestMatch = amount;
                bestScore = score;
              }
            }
          }
        }
        
        // Also check next line
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (!excludePatterns.test(nextLine)) {
            for (const moneyPattern of moneyPatterns) {
              const m = nextLine.match(moneyPattern);
              if (m) {
                const amount = parseFloat(m[1]);
                if (amount && amount > 0 && amount < 10000) {
                  const score = 8; // Good score for next line
                  if (score > bestScore) {
                    bestMatch = amount;
                    bestScore = score;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // If no keyword match, look for amounts in likely positions (bottom half of receipt)
  if (!bestMatch) {
    const startFrom = Math.floor(lines.length / 2);
    for (let i = startFrom; i < lines.length; i++) {
      const line = lines[i].trim();
      if (excludePatterns.test(line)) continue;
      
      for (const moneyPattern of moneyPatterns) {
        const m = line.match(moneyPattern);
        if (m) {
          const amount = parseFloat(m[1]);
          if (amount && amount > 0 && amount < 1000) {
            const score = 3; // Lower score for position-based match
            if (score > bestScore) {
              bestMatch = amount;
              bestScore = score;
            }
          }
        }
      }
    }
  }

  return bestMatch;
}

function normalizeMoney(str) {
  if (!str) return null;
  let s = String(str).replace(/[₹$€£\s]/g, '');
  // handle European format 1.234,56
  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;
  if (commaCount === 1 && dotCount > 1) {
    // unlikely, fallback to cleaning separators
    s = s.replace(/[^0-9.,-]/g, '');
  }
  if (/,\d{2}$/.test(s) && /\./.test(s)) {
    // remove thousand dots then replace comma decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // remove thousands commas
    s = s.replace(/,/g, '');
  }
  const num = Number(s.replace(/[()]/g, ''));
  return isNaN(num) ? null : num;
}

function parseMerchantFromLines(lines) {
  const noise = /(receipt|invoice|order|transaction|guest|table|address|tel|phone|tax id|gst|vat|www\.|http|bill|date|time|device|cashier)/i;
  const businessWords = /(restaurant|cafe|store|shop|mart|mall|hotel|pvt|ltd|inc|corp|company|park|pier)/i;
  
  // Look for business name in first few lines
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3) continue;
    if (noise.test(line)) continue;
    if (/^\d+$/.test(line)) continue; // Skip pure numbers
    if (/^\d+\s+\d+/.test(line)) continue; // Skip number sequences
    
    // Check for business indicators or meaningful text
    if ((businessWords.test(line) || line.length > 8) && /[A-Za-z]/.test(line)) {
      return line.slice(0, 120);
    }
  }
  
  return null;
}

function parseReceiptText(text) {
  const t = normalizeText(text);
  const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  // Debug logging
  if (process.env.PARSER_DEBUG) {
    console.log('=== PARSING DEBUG ===');
    console.log('Lines:', lines);
    console.log('=====================');
  }
  
  const purchased_at = parseDateFromLines(lines);
  const total_amount = parseTotalFromLines(lines);
  const merchant_name = parseMerchantFromLines(lines);
  
  if (process.env.PARSER_DEBUG) {
    console.log('Parsed results:');
    console.log('Date:', purchased_at);
    console.log('Amount:', total_amount);
    console.log('Merchant:', merchant_name);
    console.log('===================');
  }
  
  return { merchant_name, total_amount, purchased_at };
}

async function processFileToReceipt(id) {
  const fileRow = db.prepare('SELECT * FROM receipt_file WHERE id = ?').get(id);
  if (!fileRow) throw Object.assign(new Error('File not found'), { status: 404 });
  if (!fileRow.is_valid) throw Object.assign(new Error('File must be valid before processing'), { status: 400 });
  if (!fs.existsSync(fileRow.file_path)) throw Object.assign(new Error('File missing on server'), { status: 400 });

  const pdfData = await pdf(fs.readFileSync(fileRow.file_path));
  const text = pdfData.text || '';
  
  // Debug logging
  if (process.env.PARSER_DEBUG === '1') {
    const outDir = path.join(__dirname, '..', '..', 'tmp');
    try { 
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true }); 
      fs.writeFileSync(path.join(outDir, `extracted-${id}.txt`), text, 'utf8'); 
    } catch (_) {}
  }

  const { merchant_name, total_amount, purchased_at } = parseReceiptText(text);
  
  // Calculate confidence score based on extracted data
  let confidence = 0.0;
  if (merchant_name) confidence += 0.3;
  if (total_amount && total_amount > 0) confidence += 0.4;
  if (purchased_at) confidence += 0.3;

  // Check if receipt already exists for this file
  const existing = db.prepare('SELECT id FROM receipt WHERE receipt_file_id = ?').get(id);
  
  let receiptId;
  if (existing) {
    // Update existing receipt
    db.prepare(`
      UPDATE receipt 
      SET purchased_at = ?, merchant_name = ?, total_amount = ?, 
          raw_text = ?, confidence_score = ?
      WHERE id = ?
    `).run(purchased_at, merchant_name, total_amount, text, confidence, existing.id);
    receiptId = existing.id;
  } else {
    // Insert new receipt
    const info = db.prepare(`
      INSERT INTO receipt (receipt_file_id, purchased_at, merchant_name, total_amount, raw_text, confidence_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, purchased_at, merchant_name, total_amount, text, confidence);
    receiptId = info.lastInsertRowid;
  }

  // Mark file as processed
  db.prepare('UPDATE receipt_file SET is_processed = 1 WHERE id = ?').run(id);
  
  return { 
    receipt_id: receiptId, 
    merchant_name, 
    total_amount, 
    purchased_at,
    confidence_score: confidence
  };
}

module.exports = {
  processFileToReceipt,
};


