const express = require('express');
const { syncAndGetSeriesStreams, getAllSavedSeriesStreams } = require('../controller/series.controller');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
// GET /api/series/sync/:providerId => triggers fetch → sync → filter → save → respond
router.get('/sync/:providerId', authenticate, syncAndGetSeriesStreams);

// GET /api/series => returns paginated database contents
// Query parameters:
// - page: Page number (default: 1)
// - limit: Number of items per page (default: 10)
// Filtering parameters:
// - search: Search term for name or title fields
// - status: Filter by status (ACTIVE or INACTIVE)
// - provider: Filter by provider ID
// - category_id: Filter by category ID
router.get('/', authenticate, getAllSavedSeriesStreams);

module.exports = router;
