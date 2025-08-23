const express = require('express');
const router = express.Router();
const { getProcessedHeroCarousel } = require('../controller/public.controller');

router.get('/hero-carousel', getProcessedHeroCarousel);

module.exports = router;