const express = require('express');
const {
  syncAndGetLiveStreams,
  getAllSavedLiveStreams,
  setLiveFavorite,
  setLiveHide
} = require('../controller/live.controller');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

router.get('/sync/:providerId', authenticate, syncAndGetLiveStreams);
router.get('/', authenticate, getAllSavedLiveStreams);

// PATCH /api/lives/favorite/:id
router.patch('/favorite/:id', authenticate, setLiveFavorite);

// PATCH /api/lives/hide/:id
router.patch('/hide/:id', authenticate, setLiveHide);

module.exports = router;
