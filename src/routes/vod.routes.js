const express = require('express');
const { syncAndGetVodStreams, getAllSavedVodStreams } = require('../controller/vod.controller');
const router = express.Router();

const { authenticate } = require('../middlewares/auth');

// GET /api/vods/sync/:providerId => triggers fetch → sync → filter → save → respond
router.get('/sync/:providerId', authenticate, syncAndGetVodStreams);

// GET /api/vods/:providerId => returns only database contents
router.get('/:providerId', authenticate, getAllSavedVodStreams);

module.exports = router;
