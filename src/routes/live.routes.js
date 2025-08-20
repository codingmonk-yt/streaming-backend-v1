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
 * GET /api/lives
 * Returns live streams with optional filtering and pagination
 * Query parameters:
 * - search: Search term for name, title, or description
 * - category_id: Filter by category ID
 * - provider: Filter by provider ID
 * - status: Filter by status (ACTIVE, INACTIVE, HIDDEN)
 * - page: Page number for pagination (default: 1)
 * - limit: Number of items per page (default: 10)
 */
router.get('/', authenticate, getAllSavedLiveStreams);

module.exports = router;
