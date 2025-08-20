const express = require('express');
const { syncAndGetSeriesStreams, getAllSavedSeriesStreams } = require('../controller/series.controller');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
// GET /api/series/sync/:providerId => triggers fetch → sync → filter → save → respond
router.get('/sync/:providerId', authenticate, syncAndGetSeriesStreams);

// GET /api/series/:providerId => returns only database contents
router.get('/:providerId', authenticate, getAllSavedSeriesStreams);

module.exports = router;
