const Provider = require('../models/Provider');

const providerCache = new Map();
const cacheTimestamps = new Map();

const CACHE_EXPIRY = 5 * 60 * 1000; 

function ownerIdFromReq(req) {
  return String(req.user?.sub || '');
}

function invalidateCache(owner) {
  providerCache.delete(owner);
  cacheTimestamps.delete(owner);
}

function isCacheValid(owner) {
  const timestamp = cacheTimestamps.get(owner);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_EXPIRY;
}

async function getCachedProviders(owner, query = {}) {
  const cacheKey = `${owner}_${JSON.stringify(query)}`;
  
  if (providerCache.has(cacheKey) && isCacheValid(owner)) {
    return providerCache.get(cacheKey);
  }

  const baseQuery = { owner, ...query };
  const docs = await Provider.find(baseQuery).sort({ createdAt: -1 });
  
  providerCache.set(cacheKey, docs);
  cacheTimestamps.set(owner, Date.now());
  
  return docs;
}

// POST /api/providers
async function createProvider(req, res) {
  try {
    const owner = ownerIdFromReq(req);
    if (!owner) return res.status(401).json({ message: 'Unauthorized' });

    const { name, apiEndpoint, maxConcurrentUsers, dns, status = 'Active', expiryHours } = req.body || {};
    if (!name || !apiEndpoint || !maxConcurrentUsers || !dns || !expiryHours) {
      return res.status(400).json({ message: 'name, apiEndpoint, maxConcurrentUsers, dns, expiryHours are required' });
    }

    const payload = {
      owner,
      name: String(name).trim(),
      apiEndpoint: String(apiEndpoint).trim(),
      maxConcurrentUsers: Number(maxConcurrentUsers),
      dns: String(dns).trim(),
      status: status || 'Active',
      expiryHours: Number(expiryHours),
    };

    const doc = await Provider.create(payload);
    
    // Invalidate cache since we created a new provider
    invalidateCache(owner);
    
    return res.status(201).json(doc);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: 'Provider with this name already exists for this account' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/providers?status=Active&name=foo
async function listProviders(req, res) {
  try {
    const owner = ownerIdFromReq(req);
    if (!owner) return res.status(401).json({ message: 'Unauthorized' });

    const { status, name } = req.query || {};
    const queryFilters = {};
    if (status) queryFilters.status = status;
    if (name) queryFilters.name = { $regex: String(name), $options: 'i' };

    // Use cached data if available and valid
    const docs = await getCachedProviders(owner, queryFilters);
    
    // Apply additional filtering for name regex if needed (since we cache base queries)
    let filteredDocs = docs;
    if (name && !queryFilters.name) {
      const nameRegex = new RegExp(String(name), 'i');
      filteredDocs = docs.filter(doc => nameRegex.test(doc.name));
    }
    if (status && !queryFilters.status) {
      filteredDocs = filteredDocs.filter(doc => doc.status === status);
    }

    return res.json(filteredDocs);
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/providers/:id
async function getProvider(req, res) {
  try {
    const owner = ownerIdFromReq(req);
    if (!owner) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    
    // Try to find in cache first
    const cacheKey = `${owner}_{}`;
    if (providerCache.has(cacheKey) && isCacheValid(owner)) {
      const cachedDocs = providerCache.get(cacheKey);
      const doc = cachedDocs.find(item => item._id.toString() === id);
      if (doc) return res.json(doc);
      // If not found in cache, it might not exist
      return res.status(404).json({ message: 'Not found' });
    }

    // Fallback to database query
    const doc = await Provider.findOne({ _id: id, owner });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    return res.json(doc);
  } catch (e) {
    return res.status(400).json({ message: 'Invalid id' });
  }
}

// PATCH /api/providers/:id
async function updateProvider(req, res) {
  try {
    const owner = ownerIdFromReq(req);
    if (!owner) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const allowed = ['name', 'apiEndpoint', 'maxConcurrentUsers', 'dns', 'status', 'expiryHours'];
    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    if ('name' in updates) updates.name = String(updates.name).trim();
    if ('apiEndpoint' in updates) updates.apiEndpoint = String(updates.apiEndpoint).trim();
    if ('dns' in updates) updates.dns = String(updates.dns).trim();
    if ('maxConcurrentUsers' in updates) updates.maxConcurrentUsers = Number(updates.maxConcurrentUsers);
    if ('expiryHours' in updates) updates.expiryHours = Number(updates.expiryHours);

    const doc = await Provider.findOneAndUpdate({ _id: id, owner }, updates, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    
    // Invalidate cache since we updated a provider
    invalidateCache(owner);
    
    return res.json(doc);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: 'Provider with this name already exists for this account' });
    }
    return res.status(400).json({ message: 'Invalid request' });
  }
}

// DELETE /api/providers/:id
async function deleteProvider(req, res) {
  try {
    const owner = ownerIdFromReq(req);
    if (!owner) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const doc = await Provider.findOneAndDelete({ _id: id, owner });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    
    // Invalidate cache since we deleted a provider
    invalidateCache(owner);
    
    return res.json({ message: 'Deleted' });
  } catch (e) {
    return res.status(400).json({ message: 'Invalid id' });
  }
}

// Optional: Function to clear all cache (useful for maintenance)
function clearAllCache() {
  providerCache.clear();
  cacheTimestamps.clear();
}

// Optional: Function to clear expired cache entries (can be called periodically)
function clearExpiredCache() {
  const now = Date.now();
  for (const [owner, timestamp] of cacheTimestamps.entries()) {
    if (now - timestamp >= CACHE_EXPIRY) {
      // Remove all cache entries for this owner
      for (const [key] of providerCache.entries()) {
        if (key.startsWith(owner + '_')) {
          providerCache.delete(key);
        }
      }
      cacheTimestamps.delete(owner);
    }
  }
}

module.exports = {
  createProvider,
  listProviders,
  getProvider,
  updateProvider,
  deleteProvider,
  clearAllCache,
  clearExpiredCache,
};
