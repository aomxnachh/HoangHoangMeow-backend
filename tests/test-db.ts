import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/schema.js';

export const client = new PGlite();
export const db = drizzle(client, { schema });
export const initialize = () => migrate(db, { migrationsFolder: './drizzle' });
