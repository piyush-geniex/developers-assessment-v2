const express = require('express');
const { validateGenerateRequest } = require('./schemas');
const settlementService = require('./service');
const { SettlementError } = require('./errors');

const router = express.Router();

/**
 * POST /generate-remittances
 * Runs a settlement for the given period, creating one remittance per eligible user.
 */
router.post('/generate-remittances', async (req, res) => {
  try {
    const { periodStart, periodEnd } = validateGenerateRequest(req.body);
    const result = await settlementService.generateRemittances(periodStart, periodEnd);

    const status = result.succeeded > 0 ? 201 : 200;
    return res.status(status).json({
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    if (err instanceof SettlementError) {
      return res.status(err.statusCode).json({
        data: null,
        meta: { timestamp: new Date().toISOString(), error: err.message },
      });
    }
    console.error('[settlement route]', err);
    return res.status(500).json({
      data: null,
      meta: { timestamp: new Date().toISOString(), error: 'Internal server error' },
    });
  }
});

module.exports = router;
