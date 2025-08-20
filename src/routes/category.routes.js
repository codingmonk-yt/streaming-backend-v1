const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const {
  validateCreateCategory,
  validateUpdateCategory,
  validateObjectId,
  validateCategoryId,
  validateProviderId,
} = require('../middlewares/validateCategory');
const ctrl = require('../controller/category.controller');

// --- Bulk Sync for ALL categories (Live TV, VOD, Series) at once ---
router.post(
  '/bulk-sync-all/:providerId',
  authenticate,
  validateProviderId,
  ctrl.bulkSyncAllXtreamCategories
);

// --- Bulk Sync for single category type (live/vod/series) ---
router.post(
  '/bulk-sync/:providerId',
  authenticate,
  validateProviderId,
  ctrl.bulkSyncXtreamCategories
);

// --- Get sync job status ---
router.get(
  '/sync-status/:jobId',
  authenticate,
  ctrl.getSyncJobStatus
);

// --- Category CRUD Endpoints ---

// CREATE category
router.post(
  '/',
  authenticate,
  validateCreateCategory,
  ctrl.createCategory
);

// LIST/SEARCH categories (by providerId, category_type, etc.)
router.get(
  '/',
  authenticate,
  ctrl.listCategories
);

// GET root categories (parent_id is null, filterable)
router.get(
  '/roots',
  authenticate,
  ctrl.getRootCategories
);

// GET category by 4-digit category_id
router.get(
  '/by-category-id/:category_id',
  authenticate,
  validateCategoryId,
  ctrl.getCategoryByCategoryId
);

// GET category by Mongo _id
router.get(
  '/:id',
  authenticate,
  validateObjectId,
  ctrl.getCategory
);

// GET all children for a parent
router.get(
  '/:id/children',
  authenticate,
  validateObjectId,
  ctrl.getChildCategories
);

// UPDATE category
router.patch(
  '/:id',
  authenticate,
  validateObjectId,
  validateUpdateCategory,
  ctrl.updateCategory
);

// DELETE category
router.delete(
  '/:id',
  authenticate,
  validateObjectId,
  ctrl.deleteCategory
);

module.exports = router;
