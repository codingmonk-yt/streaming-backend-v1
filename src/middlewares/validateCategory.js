// src/middlewares/validateCategory.js

// Validate category creation
function validateCreateCategory(req, res, next) {
  const { category_name, provider, category_type } = req.body || {};
  
  // Required fields check (category_id is optional now)
  if (!category_name || !provider || !category_type) {
    return res.status(400).json({ 
      message: 'category_name, provider, and category_type are required' 
    });
  }
  
  // Validate category_id format if provided (must be 4-digit numeric)
  if (req.body.category_id) {
    const categoryIdRegex = /^\d{4}$/;
    if (!categoryIdRegex.test(req.body.category_id)) {
      return res.status(400).json({ 
        message: 'category_id must be exactly 4 digits (e.g., 1234)' 
      });
    }
  }
  
  // Validate parent_id format if provided (must be 4-digit numeric)
  if (req.body.parent_id) {
    const parentIdRegex = /^\d{1}$/;
    if (!parentIdRegex.test(req.body.parent_id)) {
      return res.status(400).json({ 
        message: 'parent_id must be exactly 1 digit (e.g., 0)' 
      });
    }
  }
  
  // Validate category_name (non-empty after trim)
  if (String(category_name).trim().length === 0) {
    return res.status(400).json({ message: 'category_name cannot be empty' });
  }
  
  // Validate provider (non-empty after trim)
  if (String(provider).trim().length === 0) {
    return res.status(400).json({ message: 'provider cannot be empty' });
  }
  
  // Validate category_type (non-empty after trim)
  if (String(category_type).trim().length === 0) {
    return res.status(400).json({ message: 'category_type cannot be empty' });
  }
  
  next();
}

// Validate category update
function validateUpdateCategory(req, res, next) {
  const { category_name, provider, category_type, parent_id } = req.body || {};
  const allowedFields = ['category_name', 'parent_id', 'provider', 'category_type'];
  const bodyKeys = Object.keys(req.body || {});
  
  // Check if at least one valid field is provided
  const hasValidField = bodyKeys.some(key => allowedFields.includes(key));
  if (!hasValidField) {
    return res.status(400).json({ 
      message: 'At least one valid field (category_name, parent_id, provider, category_type) is required' 
    });
  }
  
  // Validate category_name if provided
  if (category_name !== undefined && String(category_name).trim().length === 0) {
    return res.status(400).json({ message: 'category_name cannot be empty' });
  }
  
  // Validate provider if provided
  if (provider !== undefined && String(provider).trim().length === 0) {
    return res.status(400).json({ message: 'provider cannot be empty' });
  }
  
  // Validate category_type if provided
  if (category_type !== undefined && String(category_type).trim().length === 0) {
    return res.status(400).json({ message: 'category_type cannot be empty' });
  }
  
  // Validate parent_id format if provided (must be 4-digit numeric or null)
  if (parent_id !== undefined && parent_id !== null) {
    const parentIdRegex = /^\d{4}$/;
    if (!parentIdRegex.test(parent_id)) {
      return res.status(400).json({ 
        message: 'parent_id must be exactly 4 digits (e.g., 1234) or null' 
      });
    }
  }
  
  next();
}

// Validate MongoDB ObjectId format
function validateObjectId(req, res, next) {
  const { id } = req.params;
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  
  if (!objectIdRegex.test(id)) {
    return res.status(400).json({ message: 'Invalid category id format' });
  }
  
  next();
}

// Validate category_id format for by-category-id route (4-digit numeric)
function validateCategoryId(req, res, next) {
  const { category_id } = req.params;
  const categoryIdRegex = /^\d{4}$/;
  
  if (!category_id || !categoryIdRegex.test(category_id)) {
    return res.status(400).json({ 
      message: 'Invalid category_id format. Must be exactly 4 digits (e.g., 1234)' 
    });
  }
  
  next();
}

module.exports = {
  validateCreateCategory,
  validateUpdateCategory,
  validateObjectId,
  validateCategoryId,
};
