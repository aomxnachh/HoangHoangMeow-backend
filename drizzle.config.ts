import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgresql://postgres:d8282c9d94f587ee8f608dba6353d7a260a6e532f8362243c290ce3d0afdc0388ae00a87ac2bec66f66b70d0c8cd27ef18b3c814af23932ab9286988969faae4@127.0.0.1:5433/hoanghoangmeow?sslmode=disable',
  },
});
