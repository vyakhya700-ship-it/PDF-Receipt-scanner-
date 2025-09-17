const Database = require('better-sqlite3');
const db = new Database('./receipts.db');

db.exec('DELETE FROM receipt WHERE id > 1');
db.exec('DELETE FROM receipt_file WHERE id > 1');
db.exec("UPDATE sqlite_sequence SET seq = 1 WHERE name IN ('receipt', 'receipt_file')");

console.log('All records except ID 1 cleared and counters reset to 1!');
db.close();



