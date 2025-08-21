const express = require('express');
const {
  syncAndGetSeriesStreams,
  getAllSavedSeriesStreams,
  setSeriesFavorite,
  setSeriesHide
} = require('../controller/series.controller');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

// Sync and upsert Series
router.get('/sync/:providerId', authenticate, syncAndGetSeriesStreams);

// GET all paginated/filter series
router.get('/', authenticate, getAllSavedSeriesStreams);

// Set/unset favorite
router.patch('/favorite/:id', authenticate, setSeriesFavorite);

// Set/unset hide
router.patch('/hide/:id', authenticate, setSeriesHide);

module.exports = router;
