import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';
import * as schema from './schema.js';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/capital_eng';

export const pool = new pg.Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool, { schema });
