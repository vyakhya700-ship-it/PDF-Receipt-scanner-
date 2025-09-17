const Database = require('better-sqlite3');
const db = new Database('./receipts.db');

console.log('Dropping all tables...');

try {
  // Drop existing tables completely
  db.exec('DROP TABLE IF EXISTS receipt');
  db.exec('DROP TABLE IF EXISTS receipt_file');

  // Reset sqlite_sequence for auto-increment
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('receipt', 'receipt_file')");

  console.log('✅ All tables dropped and sequences reset!');
  console.log('Run "npm run dev" to recreate tables with new structure');
  
} catch (error) {
  console.error('❌ Error dropping tables:', error.message);
} finally {
  db.close();
}