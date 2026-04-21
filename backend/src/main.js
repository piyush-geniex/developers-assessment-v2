const express = require('express');
const config = require('./config');
const { seed } = require('./database/seed');
const settlementRoutes = require('./settlement/routes');
const worklogRoutes = require('./worklogs/routes');

const app = express();

app.use(express.json());

app.use('/', settlementRoutes);
app.use('/', worklogRoutes);

/**
 * Health check endpoint.
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  await seed();
  app.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port}`);
  });
}

start().catch(err => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
