const Category = require('../models/Category');

// Helper function to generate random 4-digit category_id
async function generateUniqueCategoryId() {
  let categoryId;
  let exists = true;
  
  while (exists) {
    // Generate random 4-digit number (1000-9999)
    categoryId = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Check if it already exists
    const existingCategory = await Category.findOne({ category_id: categoryId });
    exists = !!existingCategory;
  }
  
  return categoryId;
}

// Create Category
// POST /api/categories
async function createCategory(req, res) {
  try {
    const { category_id, category_name, parent_id, provider, category_type } = req.body;
    
    // Generate category_id if not provided
    const finalCategoryId = category_id || await generateUniqueCategoryId();
    
    const categoryData = {
      category_id: finalCategoryId,
      category_name: String(category_name).trim(),
      parent_id: parent_id || null,
      provider: String(provider).trim(),
      category_type: String(category_type).trim(),
    };

    const category = await Category.create(categoryData);
    return res.status(201).json(category);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: 'Category with this category_id already exists' });
    }
    console.error('Create category error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// List Categories
// GET /api/categories?provider=xxx&category_type=yyy&parent_id=zzz
async function listCategories(req, res) {
  try {
    const { provider, category_type, parent_id, category_name } = req.query || {};
    const query = {};
    
    if (provider) query.provider = String(provider).trim();
    if (category_type) query.category_type = String(category_type).trim();
    if (parent_id !== undefined) {
      query.parent_id = parent_id ? String(parent_id).trim() : null;
    }
    if (category_name) {
      query.category_name = { $regex: String(category_name).trim(), $options: 'i' };
    }

    const categories = await Category.find(query).sort({ category_id: 1 });
    return res.json(categories);
  } catch (e) {
    console.error('List categories error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Get Category by MongoDB _id
// GET /api/categories/:id
async function getCategory(req, res) {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    return res.json(category);
  } catch (e) {
    console.error('Get category error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Get Category by category_id
// GET /api/categories/by-category-id/:category_id
async function getCategoryByCategoryId(req, res) {
  try {
    const { category_id } = req.params;
    const category = await Category.findOne({ category_id: category_id });
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    return res.json(category);
  } catch (e) {
    console.error('Get category by category_id error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Update Category
// PATCH /api/categories/:id
async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const allowed = ['category_name', 'parent_id', 'provider', 'category_type'];
    const updates = {};
    
    for (const key of allowed) {
      if (key in req.body) {
        if (key === 'parent_id') {
          updates[key] = req.body[key] || null;
        } else {
          updates[key] = String(req.body[key]).trim();
        }
      }
    }

    const category = await Category.findByIdAndUpdate(id, updates, { 
      new: true, 
      runValidators: true 
    });
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    return res.json(category);
  } catch (e) {
    console.error('Update category error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Delete Category
// DELETE /api/categories/:id
async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    
    // First check if category exists
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Check if this category has children
    const hasChildren = await Category.findOne({ parent_id: category.category_id });
    if (hasChildren) {
      return res.status(400).json({ 
        message: 'Cannot delete category that has child categories. Please delete child categories first.' 
      });
    }
    
    await Category.findByIdAndDelete(id);
    return res.json({ message: 'Category deleted successfully' });
  } catch (e) {
    console.error('Delete category error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Get child categories
// GET /api/categories/:id/children
async function getChildCategories(req, res) {
  try {
    const { id } = req.params;
    const parent = await Category.findById(id);
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent category not found' });
    }
    
    const children = await Category.find({ parent_id: parent.category_id }).sort({ category_id: 1 });
    return res.json(children);
  } catch (e) {
    console.error('Get child categories error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// Get all root categories (parent_id is null)
// GET /api/categories/roots
async function getRootCategories(req, res) {
  try {
    const { provider, category_type } = req.query || {};
    const query = { parent_id: null };
    
    if (provider) query.provider = String(provider).trim();
    if (category_type) query.category_type = String(category_type).trim();
    
    const rootCategories = await Category.find(query).sort({ category_id: 1 });
    return res.json(rootCategories);
  } catch (e) {
    console.error('Get root categories error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  createCategory,
  listCategories,
  getCategory,
  getCategoryByCategoryId,
  updateCategory,
  deleteCategory,
  getChildCategories,
  getRootCategories,
};
