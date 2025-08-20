const LiveStream = require('../models/LiveStream');
const Provider = require('../models/Provider');
const { liveQueue } = require('../bull/liveQueue');

// POST/GET route: Enqueue sync job for given provider
async function syncAndGetLiveStreams(req, res) {
  try {
    const { providerId } = req.params;
    if (!providerId || !/^[0-9a-fA-F]{24}$/.test(providerId)) {
      return res.status(400).json({ message: "Invalid providerId" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ message: "Provider not found" });

    // 1. Enqueue BullMQ job
    const job = await liveQueue.add('liveSync', { providerId });
    // 2. Wait for job completion or short pause (for demo, 1.5s)
    setTimeout(async () => {
      // 3. Fetch filtered, saved live streams from DB
      const streams = await LiveStream.find({ provider: providerId });
      res.json({ jobId: job.id, streams });
    }, 1500);

  } catch (e) {
    res.status(500).json({ message: "Sync error", error: e.message });
  }
}

// Standard route to fetch all saved live streams with optional filtering and pagination
async function getAllSavedLiveStreams(req, res) {
  try {
    // Get query parameters
    const { 
      search, 
      category_id, 
      provider, 
      status,
      page = 1, 
      limit = 10 
    } = req.query;

    // Build query object
    const query = {};

    // Add filters if they exist
    if (provider) {
      if (!/^[0-9a-fA-F]{24}$/.test(provider)) {
        return res.status(400).json({ message: "Invalid provider ID format" });
      }
      query.provider = provider;
    }

    if (category_id) {
      if (!/^[0-9a-fA-F]{24}$/.test(category_id)) {
        return res.status(400).json({ message: "Invalid category ID format" });
      }
      query.category_id = category_id;
    }

    if (status) {
      query.status = status.toUpperCase();
    }

    // Add search functionality if search parameter exists
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { title: searchRegex },
        { description: searchRegex }
      ];
    }

    // Parse page and limit to numbers
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    // Calculate skip value for pagination
    const skip = (pageNum - 1) * limitNum;

    // Execute the count query for total items
    const totalItems = await LiveStream.countDocuments(query);

    // Calculate total pages
    const totalPages = Math.ceil(totalItems / limitNum);

    // Get streams with pagination
    const streams = await LiveStream.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ updatedAt: -1 }); // Sort by updatedAt desc by default

    // Return data with pagination info
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
        category_id,
        provider,
        status,
        page: pageNum,
        limit: limitNum
      }
    });
  } catch (e) {
    console.error('Error in getAllSavedLiveStreams:', e);
    res.status(500).json({ message: "Server error", error: e.message });
  }
}

module.exports = { syncAndGetLiveStreams, getAllSavedLiveStreams };
