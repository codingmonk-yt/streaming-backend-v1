const express = require('express');
const { syncAndGetLiveStreams, getAllSavedLiveStreams } = require('../controller/live.controller');
const router = express.Router();

const { authenticate } = require('../middlewares/auth');
/**
 * GET /api/lives/sync/:providerId
 * Triggers sync, then returns all the live streams for that provider from your DB.
 */
router.get('/sync/:providerId', authenticate, syncAndGetLiveStreams);

/**
 * GET /api/lives/:providerId
 * Just returns what's already in the DB; doesn't trigger fetch/sync.
 */
router.get('/:providerId', authenticate, getAllSavedLiveStreams);

module.exports = router;
