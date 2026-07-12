const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../dropship_ai.db');
const dir = path.join(__dirname, '../backups');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const dest = path.join(dir, `dropship_ai-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
fs.copyFileSync(src, dest);
console.log(`Backup written to ${dest}`);
