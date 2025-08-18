const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const { 
  validateCreateCategory, 
  validateUpdateCategory, 
  validateObjectId, 
  validateCategoryId 
} = require('../middlewares/validateCategory');
const ctrl = require('../controller/category.controller');

// Create category with validation
router.post('/', authenticate, validateCreateCategory, ctrl.createCategory);

// List categories (no validation needed for query params)
router.get('/', authenticate, ctrl.listCategories);

// Get root categories (parent_id is null)
router.get('/roots', authenticate, ctrl.getRootCategories);

// Get category by category_id with validation
router.get('/by-category-id/:category_id', authenticate, validateCategoryId, ctrl.getCategoryByCategoryId);

// Get category by MongoDB _id with validation
router.get('/:id', authenticate, validateObjectId, ctrl.getCategory);

// Get child categories with validation
router.get('/:id/children', authenticate, validateObjectId, ctrl.getChildCategories);

// Update category with validation
router.patch('/:id', authenticate, validateObjectId, validateUpdateCategory, ctrl.updateCategory);

// Delete category with validation
router.delete('/:id', authenticate, validateObjectId, ctrl.deleteCategory);

module.exports = router;
