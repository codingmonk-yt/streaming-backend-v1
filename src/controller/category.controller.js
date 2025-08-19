const mongoose = require('mongoose');
const Category = require('../models/Category');
const Provider = require('../models/Provider');
const { syncQueue } = require('../bull/syncQueue');

// Utility: Generate random 4-digit category_id
async function generateUniqueCategoryId() {
  let categoryId, exists = true;
  while (exists) {
    categoryId = Math.floor(1000 + Math.random() * 9000).toString();
    exists = !!(await Category.findOne({ category_id: categoryId }));
  }
  return categoryId;
}

// Utility: Transform external API category to schema
function toSchemaCategory(raw, provider, type) {
  return {
    category_id: String(raw.category_id).padStart(4, '0'),
    category_name: (raw.category_name || '').trim(),
    parent_id: null,
    provider: String(provider),
    category_type: String(type)
  };
}

// BULK SYNC - Enqueues a BullMQ job for all categories
async function bulkSyncAllXtreamCategories(req, res) {
  try {
    const { providerId } = req.params;
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      console.log('❌ Invalid provider ID format:', providerId);
      return res.status(400).json({ message: 'Invalid provider ID format' });
    }
    
    console.log('🔍 Searching for provider:', providerId);
    const provider = await Provider.findById(providerId);
    
    if (!provider) {
      console.log('❌ Provider not found:', providerId);
      return res.status(404).json({ message: 'Provider not found' });
    }
    
    console.log('✅ Provider found:', {
      id: provider._id,
      name: provider.name,
      status: provider.status,
      owner: provider.owner
    });
    
    if (provider.status !== 'Active') {
      console.log('🚫 Provider is not active. Status:', provider.status);
      return res.status(400).json({ 
        message: `Provider is ${provider.status}. Only Active providers can be synced.`,
        providerStatus: provider.status
      });
    }
    
    // Enqueue job in BullMQ
    const job = await syncQueue.add('bulkSyncAll', { providerId });
    
    console.log('✅ Sync job enqueued successfully. Job ID:', job.id);
    return res.json({
      message: 'Sync job enqueued successfully',
      jobId: job.id,
      status: 'queued',
      provider: {
        id: provider._id,
        name: provider.name
      }
    });
  } catch (e) {
    console.error('❌ bulkSyncAllXtreamCategories error:', e);
    res.status(500).json({ 
      message: 'Failed to enqueue sync job', 
      error: e.message 
    });
  }
}

// Single type bulk sync
async function bulkSyncXtreamCategories(req, res) {
  try {
    const { providerId } = req.params;
    const { kind = 'live', category_type = 'Live TV' } = req.body;
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      console.log('❌ Invalid provider ID format:', providerId);
      return res.status(400).json({ message: 'Invalid provider ID format' });
    }
    
    console.log('🔍 Searching for provider for single sync:', providerId);
    const provider = await Provider.findById(providerId);
    
    if (!provider) {
      console.log('❌ Provider not found for single sync:', providerId);
      return res.status(404).json({ message: 'Provider not found' });
    }
    
    console.log('✅ Provider found for single sync:', {
      id: provider._id,
      name: provider.name,
      status: provider.status,
      syncType: category_type
    });
    
    if (provider.status !== 'Active') {
      console.log('🚫 Provider is not active for single sync. Status:', provider.status);
      return res.status(400).json({ 
        message: `Provider is ${provider.status}. Only Active providers can be synced.`,
        providerStatus: provider.status
      });
    }
    
    // Enqueue single type sync job
    const job = await syncQueue.add('bulkSyncOne', { 
      providerId, 
      kind, 
      category_type 
    });
    
    console.log('✅ Single sync job enqueued successfully. Job ID:', job.id);
    return res.json({
      message: 'Single sync job enqueued successfully',
      jobId: job.id,
      status: 'queued',
      syncType: category_type,
      provider: {
        id: provider._id,
        name: provider.name
      }
    });
  } catch (e) {
    console.error('❌ bulkSyncXtreamCategories error:', e);
    res.status(500).json({ 
      message: 'Failed to enqueue sync job', 
      error: e.message 
    });
  }
}

// ===== STANDARD CRUD OPERATIONS =====

async function createCategory(req, res) {
  try {
    const { category_id, category_name, parent_id, provider, category_type } = req.body;
    
    // Validate required fields
    if (!category_name || !provider || !category_type) {
      return res.status(400).json({ 
        message: 'Missing required fields: category_name, provider, and category_type are required' 
      });
    }
    
    // Validate provider exists if provided
    if (provider && mongoose.Types.ObjectId.isValid(provider)) {
      const providerExists = await Provider.findById(provider);
      if (!providerExists) {
        return res.status(400).json({ message: 'Provider not found' });
      }
    }
    
    const finalCategoryId = category_id || await generateUniqueCategoryId();
    const data = {
      category_id: finalCategoryId,
      category_name: String(category_name).trim(),
      parent_id: parent_id || null,
      provider: String(provider).trim(),
      category_type: String(category_type).trim(),
    };
    
    const cat = await Category.create(data);
    console.log('✅ Category created successfully:', cat.category_id);
    res.status(201).json(cat);
  } catch (e) {
    if (e?.code === 11000) {
      console.log('❌ Duplicate category_id:', req.body.category_id);
      return res.status(409).json({ 
        message: 'Category with this category_id already exists' 
      });
    }
    console.error('❌ Create category error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
}

async function listCategories(req, res) {
  try {
    const { provider, category_type, parent_id, category_name, page = 1, limit = 100 } = req.query || {};
    
    const query = {};
    if (provider) query.provider = String(provider).trim();
    if (category_type) query.category_type = String(category_type).trim();
    if (parent_id !== undefined) {
      query.parent_id = parent_id ? String(parent_id).trim() : null;
    }
    if (category_name) {
      query.category_name = { $regex: String(category_name).trim(), $options: 'i' };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const categories = await Category.find(query)
      .sort({ category_id: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Category.countDocuments(query);
    
    res.json({
      categories,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (e) {
    console.error('❌ List categories error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
}

async function getCategory(req, res) {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }
    
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    res.json(category);
  } catch (e) {
    console.error('❌ Get category error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
}

async function getCategoryByCategoryId(req, res) {
  try {
    const { category_id } = req.params;
    
    if (!category_id) {
      return res.status(400).json({ message: 'Category ID is required' });
    }
    
    const category = await Category.findOne({ category_id: category_id });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    res.json(category);
  } catch (e) {
    console.error('❌ Get category by category_id error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
}

async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }
    
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
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
    // Validate provider if being updated
    if (updates.provider && mongoose.Types.ObjectId.isValid(updates.provider)) {
      const providerExists = await Provider.findById(updates.provider);
      if (!providerExists) {
        return res.status(400).json({ message: 'Provider not found' });
      }
    }
    
    const cat = await Category.findByIdAndUpdate(id, updates, { 
      new: true, 
      runValidators: true 
    });
    
    if (!cat) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    console.log('✅ Category updated successfully:', cat.category_id);
    res.json(cat);
  } catch (e) {
    console.error('❌ Update category error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
}

async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }
    
    const cat = await Category.findById(id);
    if (!cat) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Check for child categories
    const hasChildren = await Category.findOne({ parent_id: cat.category_id });
    if (hasChildren) {
      return res.status(400).json({ 
        message: 'Cannot delete category that has child categories. Please delete child categories first.' 
      });
    }
    
    await Category.findByIdAndDelete(id);
    console.log('✅ Category deleted successfully:', cat.category_id);
    res.json({ 
      message: 'Category deleted successfully',
      deletedCategory: {
        id: cat._id,
        category_id: cat.category_id,
        category_name: cat.category_name
      }
    });
  } catch (e) {
    console.error('❌ Delete category error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
}

async function getChildCategories(req, res) {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }
    
    const parent = await Category.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent category not found' });
    }
    
    const children = await Category.find({ parent_id: parent.category_id })
      .sort({ category_id: 1 });
    
    res.json({
      parent: {
        id: parent._id,
        category_id: parent.category_id,
        category_name: parent.category_name
      },
      children: children,
      childCount: children.length
    });
  } catch (e) {
    console.error('❌ Get child categories error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
}

async function getRootCategories(req, res) {
  try {
    const { provider, category_type, page = 1, limit = 100 } = req.query || {};
    
    const query = { parent_id: null };
    if (provider) query.provider = String(provider).trim();
    if (category_type) query.category_type = String(category_type).trim();
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const rootCategories = await Category.find(query)
      .sort({ category_id: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Category.countDocuments(query);
    
    res.json({
      categories: rootCategories,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (e) {
    console.error('❌ Get root categories error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
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
  bulkSyncXtreamCategories,
  bulkSyncAllXtreamCategories,
};
