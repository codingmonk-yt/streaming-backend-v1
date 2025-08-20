const VodStream = require('../models/VodStream');
const Provider = require('../models/Provider');
const { vodQueue } = require('../bull/vodQueue');

async function syncAndGetVodStreams(req, res) {
  try {
    const { providerId } = req.params;
    if (!providerId || !/^[0-9a-fA-F]{24}$/.test(providerId)) {
      return res.status(400).json({ message: "Invalid providerId" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ message: "Provider not found" });

    // Enqueue BullMQ job
    const job = await vodQueue.add('vodSync', { providerId });
    // Wait for job to finish (demo: 1500ms)
    setTimeout(async () => {
      const streams = await VodStream.find({ provider: providerId });
      res.json({ jobId: job.id, streams });
    }, 1500);

  } catch (e) {
    res.status(500).json({ message: "Sync error", error: e.message });
  }
}

async function getAllSavedVodStreams(req, res) {
  try {
    const { providerId, search, status, category_id, page = 1, limit = 10 } = req.query;
    
    // Build query filters
    const query = {};
    
    // Apply provider filter if provided
    if (providerId) {
      if (!/^[0-9a-fA-F]{24}$/.test(providerId)) {
        return res.status(400).json({ message: "Invalid providerId format" });
      }
      query.provider = providerId;
    }
    
    // Apply search filter if provided
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Apply status filter if provided
    if (status) {
      query.status = status;
    }
    
    // Apply category filter if provided
    if (category_id && /^[0-9a-fA-F]{24}$/.test(category_id)) {
      query.category_id = category_id;
    }
    
    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Get total count for pagination info
    const totalItems = await VodStream.countDocuments(query);
    
    // Execute query with pagination
    const streams = await VodStream.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ updatedAt: -1 });
    
    // Prepare pagination metadata
    const totalPages = Math.ceil(totalItems / limitNum);
    
    // Return response with pagination info
    res.json({
      streams,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNum,
        pageSize: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1
      },
      filters: {
        search,
        status,
        provider: providerId,
        category_id
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { syncAndGetVodStreams, getAllSavedVodStreams };
