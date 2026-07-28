import { config } from 'dotenv';
// Local development may use .env.local, while Docker supplies DATABASE_URL via
// the container environment. Keep an explicitly supplied environment value so
// the backend can reach the `db` service instead of its own localhost.
config({ path: '.env.local' });

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
