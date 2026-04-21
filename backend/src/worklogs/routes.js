const express = require('express');
const { validateWorklogQuery } = require('./schemas');
const worklogService = require('./service');

const router = express.Router();

/**
 * GET /worklogs
 * Lists worklogs with optional filtering by remittance_status, user_id, and date range.
 * Each worklog includes its calculated amount.
 */
router.get('/worklogs', async (req, res) => {
  try {
    const filters = validateWorklogQuery(req.query);
    const worklogs = await worklogService.listWorklogs(filters);

    return res.status(200).json({
      data: worklogs,
      meta: {
        timestamp: new Date().toISOString(),
        count: worklogs.length,
      },
    });
  } catch (err) {
    if (err.message && !err.message.includes('Internal')) {
      return res.status(400).json({
        data: null,
        meta: { timestamp: new Date().toISOString(), error: err.message },
      });
    }
    console.error('[worklogs route]', err);
    return res.status(500).json({
      data: null,
      meta: { timestamp: new Date().toISOString(), error: 'Internal server error' },
    });
  }
});

module.exports = router;
