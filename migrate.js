import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running migrations');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try { await migrate(drizzle(pool), { migrationsFolder: './drizzle' }); console.log('Migration successful'); }
catch (error) { console.error('Migration failed:', error); process.exitCode = 1; }
finally { await pool.end(); }
