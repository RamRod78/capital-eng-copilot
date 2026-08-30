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

dotenv.config();

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors());

// API Routes
app.route('/api/stats', statsRouter);
app.route('/api/ingest', ingestRouter);
app.route('/api/extractions', extractionsRouter);
app.route('/api/scoping', scopingRouter);
app.route('/api/feedback', feedbackRouter);
app.route('/api/search', searchRouter);

// Healthcheck
app.get('/_stcore/health', (c) => c.text('OK'));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve static React client build in production
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDistPath)) {
  app.use('/*', serveStatic({ root: './dist/client' }));
  app.get('*', (c) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return c.html(fs.readFileSync(indexPath, 'utf-8'));
    }
    return c.text('Capital Engineering Copilot API');
  });
}

const port = Number(process.env.STREAMLIT_SERVER_PORT || process.env.PORT || 8501);

console.log(`🏗️ Capital Engineering Copilot server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});
