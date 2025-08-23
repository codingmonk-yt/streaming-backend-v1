const express = require('express');
const router = express.Router();
const { getProcessedHeroCarousel, getMovieById } = require('../controller/public.controller');

router.get('/hero-carousel', getProcessedHeroCarousel);
router.get('/movies/:id', getMovieById);

module.exports = router;