const express = require('express');
const {
  syncAndGetVodStreams,
  getAllSavedVodStreams,
  setVodFeature,
  setVodHide,
  getPublicMovies
} = require('../controller/vod.controller');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

// Public endpoint to get movies with pagination (no auth required)
router.get('/public', getPublicMovies);

// Sync and upsert VOD
router.get('/sync/:providerId', authenticate, syncAndGetVodStreams);

// Get all (with pagination/filter support)
router.get('/', authenticate, getAllSavedVodStreams);

// Set/unset feature by stream (PATCH recommended for partial update)
router.patch('/feature/:id', authenticate, setVodFeature);

// Set/unset hide by stream
router.patch('/hide/:id', authenticate, setVodHide);

module.exports = router;
