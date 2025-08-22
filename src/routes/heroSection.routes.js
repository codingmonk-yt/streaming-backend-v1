const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { createHeroscarousel, deleteHeroscarousel, getHeroscarousels, getHeroscarousel, updateHeroscarousel } = require('../controller/heroCarousel.controller');

// Public routes
// Get all hero sections
router.get('/', getHeroscarousels);
// Get single hero section by id
router.get('/:id', getHeroscarousel);

// Protected routes
// Create hero section (admin)
router.post('/', authenticate, createHeroscarousel);

// Update hero section (admin)
router.put('/:id', authenticate, updateHeroscarousel);

// Delete hero section by id (admin)
router.delete('/:id', authenticate, deleteHeroscarousel);

module.exports = router;