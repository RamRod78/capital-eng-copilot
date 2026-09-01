import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { statsRouter } from './routes/stats.js';
import { ingestRouter } from './routes/ingest.js';
import { extractionsRouter } from './routes/extractions.js';
import { scopingRouter } from './routes/scoping.js';
import { feedbackRouter } from './routes/feedback.js';
import { searchRouter } from './routes/search.js';
import { documentsRouter } from './routes/documents.js';
import { adminRouter } from './routes/admin.js';
import { kgRouter } from './routes/kg.js';
import { initDatabase } from './db/init.js';

dotenv.config();

// Ensure database schema and extensions are initialized
initDatabase().catch((err) => {
  console.error('Failed to initialize database schema:', err);
});

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors());

// API Routes
app.route('/api/stats', statsRouter);
app.route('/api/ingest', ingestRouter);
app.route('/api/documents', documentsRouter);
app.route('/api/extractions', extractionsRouter);
app.route('/api/scoping', scopingRouter);
app.route('/api/feedback', feedbackRouter);
app.route('/api/search', searchRouter);
app.route('/api/kg', kgRouter);
app.route('/api/admin', adminRouter);

// Healthcheck
app.get('/_stcore/health', (c) => c.text('OK'));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve static React client build in production
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDistPath)) {
  app.use('/*', serveStatic({ root: './dist/client' }));
}

// 404 Not Found Handler: API routes always return JSON; non-API routes serve SPA HTML or fallback
app.notFound((c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: `API route not found: ${c.req.method} ${c.req.path}` }, 404);
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return c.html(fs.readFileSync(indexPath, 'utf-8'));
  }
  return c.text('Capital Engineering Copilot API');
});

// Global API Error Handler: API routes always return JSON error payloads
app.onError((err, c) => {
  console.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, err);
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  }
  return c.text('Internal Server Error', 500);
});

const port = Number(process.env.PORT || process.env.STREAMLIT_SERVER_PORT || 3000);

console.log(`🏗️ Capital Engineering Copilot server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});
