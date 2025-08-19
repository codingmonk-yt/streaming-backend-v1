const Category = require('../models/Category');
const Provider = require('../models/Provider');

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

/**
 * BULK SYNC ALL (Live TV, VOD, Series) from Xtream API Provider
 * POST /api/categories/bulk-sync-all/:providerId
 */
async function bulkSyncAllXtreamCategories(req, res) {
  try {
    const { providerId } = req.params;
    const provider = await Provider.findById(providerId);
    if (!provider || provider.status !== 'Active') {
      return res.status(404).json({ message: 'Provider not found or inactive' });
    }

    // Fetch credentials
    const creds = await (await fetch(provider.apiEndpoint, { method: 'POST' })).json();
    const dns = creds.dns || provider.dns;
    const username = creds.username;
    const password = creds.password;
    if (!dns || !username || !password) {
      return res.status(400).json({ message: 'Invalid provider credentials' });
    }

    // Helper to fetch & sync one type
    async function syncOne(type, action, stats) {
      const url = `${dns.replace(/\/$/, '')}/player_api.php?username=${username}&password=${password}&action=${action}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed fetch for ${type} categories`);
      const cats = await resp.json();
      if (!Array.isArray(cats)) throw new Error(`Invalid ${type} categories data`);
      for (const c of cats) {
        if (!c.category_id || !/^\d+$/.test(String(c.category_id))) { stats.invalid++; continue; }
        const doc = toSchemaCategory(c, provider.name || provider._id, type);
        try {
          const up = await Category.findOneAndUpdate(
            { category_id: doc.category_id, provider: doc.provider, category_type: doc.category_type },
            doc,
            { upsert: true, setDefaultsOnInsert: true, new: true }
          );
          if (up.createdAt.getTime() === up.updatedAt.getTime()) stats.created++;
          else stats.updated++;
        } catch (err) {
          console.error(`Error processing category ${doc.category_id}:`, err);
          stats.invalid++;
        }
      }
      stats.total += cats.length;
    }

    // Results container
    const stats = {
      'Live TV': { created: 0, updated: 0, invalid: 0, total: 0 },
      'VOD': { created: 0, updated: 0, invalid: 0, total: 0 },
      'Series': { created: 0, updated: 0, invalid: 0, total: 0 }
    };

    await syncOne('Live TV', 'get_live_categories', stats['Live TV']);
    await syncOne('VOD', 'get_vod_categories', stats['VOD']);
    await syncOne('Series', 'get_series_categories', stats['Series']);

    return res.json({ success: true, categories: stats });
  } catch (e) {
    console.error('bulkSyncAllXtreamCategories', e);
    res.status(500).json({ message: 'Bulk (all) sync failed', error: e.message });
  }
}

/**
 * Single type bulk sync (backward compatibility, optional)
 * POST /api/categories/bulk-sync/:providerId (body: { kind: "live"/"vod"/"series", category_type: ... })
 */
async function bulkSyncXtreamCategories(req, res) {
  try {
    const { providerId } = req.params;
    const { kind = 'live', category_type = 'Live TV' } = req.body;
    const provider = await Provider.findById(providerId);
    if (!provider || provider.status !== 'Active') {
      return res.status(404).json({ message: 'Provider not found or inactive' });
    }

    const creds = await (await fetch(provider.apiEndpoint, { method: 'POST' })).json();
    const dns = creds.dns || provider.dns;
    const username = creds.username;
    const password = creds.password;
    if (!dns || !username || !password) {
      return res.status(400).json({ message: 'Invalid provider credentials' });
    }

    let action;
    if (kind === 'live') action = 'get_live_categories';
    else if (kind === 'vod') action = 'get_vod_categories';
    else if (kind === 'series') action = 'get_series_categories';
    else return res.status(400).json({ message: 'Invalid kind parameter' });

    const apiUrl = `${dns.replace(/\/$/, '')}/player_api.php?username=${username}&password=${password}&action=${action}`;
    const resp = await fetch(apiUrl);
    if (!resp.ok) throw new Error('Fetch failed');
    const categories = await resp.json();
    if (!Array.isArray(categories)) return res.status(400).json({ message: 'Invalid categories data' });

    let created = 0, updated = 0, invalid = 0;
    for (const c of categories) {
      if (!c.category_id || !/^\d+$/.test(String(c.category_id))) { invalid++; continue; }
      const doc = toSchemaCategory(c, provider.name || provider._id, category_type);
      try {
        const up = await Category.findOneAndUpdate(
          { category_id: doc.category_id, provider: doc.provider, category_type: doc.category_type },
          doc,
          { upsert: true, setDefaultsOnInsert: true, new: true }
        );
        if (up.createdAt.getTime() === up.updatedAt.getTime()) created++;
        else updated++;
      } catch (err) {
        console.error(`Error processing category ${doc.category_id}:`, err);
        invalid++;
      }
    }
    return res.json({ success: true, created, updated, invalid, total: categories.length });
  } catch (e) {
    console.error('bulkSyncXtreamCategories', e);
    res.status(500).json({ message: 'Bulk sync failed', error: e.message });
  }
}

// ===== Standard CRUD OPERATIONS =====

// Create Category
async function createCategory(req, res) {
  try {
    const { category_id, category_name, parent_id, provider, category_type } = req.body;
    const finalCategoryId = category_id || await generateUniqueCategoryId();
    const data = {
      category_id: finalCategoryId,
      category_name: String(category_name).trim(),
      parent_id: parent_id || null,
      provider: String(provider).trim(),
      category_type: String(category_type).trim(),
    };
    const cat = await Category.create(data);
    res.status(201).json(cat);
  } catch (e) {
    if (e?.code === 11000)
      return res.status(409).json({ message: 'Category with this category_id already exists' });
    console.error('Create category error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// List Categories (with optional filters)
async function listCategories(req, res) {
  try {
    const { provider, category_type, parent_id, category_name } = req.query || {};
    const query = {};
    if (provider) query.provider = String(provider).trim();
    if (category_type) query.category_type = String(category_type).trim();
    if (parent_id !== undefined) query.parent_id = parent_id ? String(parent_id).trim() : null;
    if (category_name) query.category_name = { $regex: String(category_name).trim(), $options: 'i' };
    const categories = await Category.find(query).sort({ category_id: 1 });
    res.json(categories);
  } catch (e) {
    console.error('List categories error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get Category by MongoDB _id
async function getCategory(req, res) {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (e) {
    console.error('Get category error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get Category by category_id
async function getCategoryByCategoryId(req, res) {
  try {
    const { category_id } = req.params;
    const category = await Category.findOne({ category_id: category_id });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (e) {
    console.error('Get category by category_id error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// Update Category by _id
async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const allowed = ['category_name', 'parent_id', 'provider', 'category_type'];
    const updates = {};
    for (const key of allowed) {
      if (key in req.body) {
        if (key === 'parent_id') updates[key] = req.body[key] || null;
        else updates[key] = String(req.body[key]).trim();
      }
    }
    const cat = await Category.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    res.json(cat);
  } catch (e) {
    console.error('Update category error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// Delete Category
async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    const cat = await Category.findById(id);
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    const hasChildren = await Category.findOne({ parent_id: cat.category_id });
    if (hasChildren) {
      return res.status(400).json({ message: 'Cannot delete category that has child categories. Please delete child categories first.' });
    }
    await Category.findByIdAndDelete(id);
    res.json({ message: 'Category deleted successfully' });
  } catch (e) {
    console.error('Delete category error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get child categories
async function getChildCategories(req, res) {
  try {
    const { id } = req.params;
    const parent = await Category.findById(id);
    if (!parent) return res.status(404).json({ message: 'Parent category not found' });
    const children = await Category.find({ parent_id: parent.category_id }).sort({ category_id: 1 });
    res.json(children);
  } catch (e) {
    console.error('Get child categories error:', e);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get all root categories (parent_id is null)
async function getRootCategories(req, res) {
  try {
    const { provider, category_type } = req.query || {};
    const query = { parent_id: null };
    if (provider) query.provider = String(provider).trim();
    if (category_type) query.category_type = String(category_type).trim();
    const rootCategories = await Category.find(query).sort({ category_id: 1 });
    res.json(rootCategories);
  } catch (e) {
    console.error('Get root categories error:', e);
    res.status(500).json({ message: 'Server error' });
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
