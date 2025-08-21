const express = require('express');
const {
  syncAndGetLiveStreams,
  getAllSavedLiveStreams,
  setLiveFeature,
  setLiveHide
} = require('../controller/live.controller');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

router.get('/sync/:providerId', authenticate, syncAndGetLiveStreams);
router.get('/', authenticate, getAllSavedLiveStreams);

// PATCH /api/lives/feature/:id
router.patch('/feature/:id', authenticate, setLiveFeature);

// PATCH /api/lives/hide/:id
router.patch('/hide/:id', authenticate, setLiveHide);

module.exports = router;
