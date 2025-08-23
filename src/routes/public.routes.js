const express = require('express');
const router = express.Router();
const { getProcessedHeroCarousel, getMovieById, getStreamUrl, getSectionsWithMovies } = require('../controller/public.controller');

router.get('/hero-carousel', getProcessedHeroCarousel);
router.get('/movies/:id', getMovieById);
router.get('/stream-url/:providerId/:streamId', getStreamUrl);
router.get('/sections', getSectionsWithMovies);

module.exports = router;