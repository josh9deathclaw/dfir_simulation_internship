const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const DB_URL = process.env.DATABASE_URL;

console.log('Resetting database...');

try {
  execSync(`psql ${DB_URL} -f ${__dirname}/schema.sql`, { stdio: 'inherit' });
  console.log('Schema created');
  
  execSync(`psql ${DB_URL} -f ${__dirname}/seed.sql`, { stdio: 'inherit' });
  console.log('Seed data inserted');
  
  console.log('Database reset complete');
} catch (err) {
  console.error('Reset failed:', err.message);
}