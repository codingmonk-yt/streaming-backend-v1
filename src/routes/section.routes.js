const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { 
  createSection, 
  getSections, 
  updateSection, 
  deleteSection
  ,
  removeSelectedCategoryIds
} = require('../controller/section.controller');

// Routes
// Public route to get all sections
router.get('/', getSections);

// Protected routes for admin operations
router.post('/', authenticate, createSection);
router.put('/:id', authenticate, updateSection);
// Remove one or more category ids from a section
router.patch('/:id/categories/remove', authenticate, removeSelectedCategoryIds);
router.delete('/:id', authenticate, deleteSection);

module.exports = router;
