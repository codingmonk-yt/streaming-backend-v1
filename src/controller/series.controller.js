const SeriesStream = require('../models/SeriesStream');
const Provider = require('../models/Provider');
const { seriesQueue } = require('../bull/seriesQueue');

async function syncAndGetSeriesStreams(req, res) {
  try {
    const { providerId } = req.params;
    if (!providerId || !/^[0-9a-fA-F]{24}$/.test(providerId)) {
      return res.status(400).json({ message: "Invalid providerId" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ message: "Provider not found" });

    // Enqueue BullMQ job
    const job = await seriesQueue.add('seriesSync', { providerId });
    // Wait for job to finish (demo: 1500ms)
    setTimeout(async () => {
      const streams = await SeriesStream.find({ provider: providerId });
      res.json({ jobId: job.id, streams });
    }, 1500);

  } catch (e) {
    res.status(500).json({ message: "Sync error", error: e.message });
  }
}

async function getAllSavedSeriesStreams(req, res) {
  try {
    // Extract query parameters for pagination
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page
    const skip = (page - 1) * limit;

    // Extract filter parameters
    const { search, status, provider, category_id } = req.query;

    // Build filter object
    const filter = {};
    
    // Add provider filter if provided
    if (provider && /^[0-9a-fA-F]{24}$/.test(provider)) {
      filter.provider = provider;
    }

    // Add category_id filter if provided
    if (category_id) {
      filter.category_id = category_id;
    }

    // Add search filter (on name or title)
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter
    if (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
      filter.status = status.toUpperCase();
    }

    // Get total count for pagination metadata
    const totalCount = await SeriesStream.countDocuments(filter);

    // Get paginated results
    const streams = await SeriesStream.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }); // Sort by creation date, newest first

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      streams,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        pageSize: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      filters: {
        search,
        status,
        provider,
        category_id
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { syncAndGetSeriesStreams, getAllSavedSeriesStreams };
