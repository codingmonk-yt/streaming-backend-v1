function validateCreateCategory(req, res, next) {
  const { category_name, provider, category_type } = req.body || {};
  if (!category_name || !provider || !category_type)
    return res.status(400).json({ message: 'category_name, provider, and category_type are required' });

  if (req.body.category_id) {
    const categoryIdRegex = /^\d{4}$/;
    if (!categoryIdRegex.test(req.body.category_id))
      return res.status(400).json({ message: 'category_id must be exactly 4 digits (e.g., 1234)' });
  }
  if (req.body.parent_id !== undefined && req.body.parent_id !== null) {
    const parentIdRegex = /^\d{1}$/;
    if (!parentIdRegex.test(req.body.parent_id))
      return res.status(400).json({ message: 'parent_id must be exactly 1 digit (e.g., 0) or null' });
  }
  if (String(category_name).trim().length === 0) return res.status(400).json({ message: 'category_name cannot be empty' });
  if (String(provider).trim().length === 0) return res.status(400).json({ message: 'provider cannot be empty' });
  if (String(category_type).trim().length === 0) return res.status(400).json({ message: 'category_type cannot be empty' });
  next();
}

function validateUpdateCategory(req, res, next) {
  const { category_name, provider, category_type, parent_id } = req.body || {};
  const allowedFields = ['category_name', 'parent_id', 'provider', 'category_type'];
  const bodyKeys = Object.keys(req.body || {});
  const hasValidField = bodyKeys.some(key => allowedFields.includes(key));
  if (!hasValidField)
    return res.status(400).json({ message: 'At least one valid field (category_name, parent_id, provider, category_type) is required' });

  if (category_name !== undefined && String(category_name).trim().length === 0)
    return res.status(400).json({ message: 'category_name cannot be empty' });
  if (provider !== undefined && String(provider).trim().length === 0)
    return res.status(400).json({ message: 'provider cannot be empty' });
  if (category_type !== undefined && String(category_type).trim().length === 0)
    return res.status(400).json({ message: 'category_type cannot be empty' });
  if (parent_id !== undefined && parent_id !== null) {
    const parentIdRegex = /^\d{1}$/;
    if (!parentIdRegex.test(parent_id))
      return res.status(400).json({ message: 'parent_id must be exactly 1 digit (e.g., 0) or null' });
  }
  next();
}

function validateObjectId(req, res, next) {
  const { id } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(id))
    return res.status(400).json({ message: 'Invalid category id format' });
  next();
}

function validateProviderId(req, res, next) {
  const { providerId } = req.params;
  if (!/^[0-9a-fA-F]{24}$/.test(providerId))
    return res.status(400).json({ message: 'Invalid provider ID format' });
  next();
}

function validateCategoryId(req, res, next) {
  const { category_id } = req.params;
  const categoryIdRegex = /^\d{4}$/;
  if (!category_id || !categoryIdRegex.test(category_id))
    return res.status(400).json({ message: 'Invalid category_id format. Must be exactly 4 digits (e.g., 1234)' });
  next();
}

module.exports = {
  validateCreateCategory,
  validateUpdateCategory,
  validateObjectId,
  validateCategoryId,
  validateProviderId,
};
