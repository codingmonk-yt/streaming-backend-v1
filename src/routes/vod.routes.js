const express = require('express');
const {
  syncAndGetVodStreams,
  getAllSavedVodStreams,
  setVodFavorite,
  setVodHide
} = require('../controller/vod.controller');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

// Sync and upsert VOD
router.get('/sync/:providerId', authenticate, syncAndGetVodStreams);

// Get all (with pagination/filter support)
router.get('/', authenticate, getAllSavedVodStreams);

// Set/unset favorite by stream (PATCH recommended for partial update)
router.patch('/favorite/:id', authenticate, setVodFavorite);

// Set/unset hide by stream
router.patch('/hide/:id', authenticate, setVodHide);

module.exports = router;
