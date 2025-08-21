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
    setTimeout(async () => {
      const streams = await SeriesStream.find({ provider: providerId });
      res.json({ jobId: job.id, streams });
    }, 1500);

  } catch (e) {
    res.status(500).json({ message: "Sync error", error: e.message });
  }
}

// Paginated, filtered Series from DB
async function getAllSavedSeriesStreams(req, res) {
  try {
    const { provider, search, status, category_id, hide, favorite, page = 1, limit = 10 } = req.query;
    const filter = {};

    if (provider && /^[0-9a-fA-F]{24}$/.test(provider)) filter.provider = provider;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }
    if (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) filter.status = status.toUpperCase();
    if (category_id) filter.category_id = category_id;
    if (hide !== undefined) filter.hide = hide === 'true';
    if (favorite !== undefined) filter.feature = favorite === 'true';

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await SeriesStream.countDocuments(filter);
    const streams = await SeriesStream.find(filter)
      .skip(skip)
      .limit(limitNum)
      .sort({ updatedAt: -1 });

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      streams,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNum,
        pageSize: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1
      },
      filters: {
        search,
        status,
        provider,
        category_id,
        hide,
        favorite
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Set/unset feature
async function setSeriesFeature(req, res) {
  try {
    const { id } = req.params;
    const { feature } = req.body;
    const updated = await SeriesStream.findByIdAndUpdate(id, { feature: !!feature }, { new: true });
    if (!updated) return res.status(404).json({ message: "Series not found" });
    res.json({ message: "Feature updated", series: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Set/unset hide
async function setSeriesHide(req, res) {
  try {
    const { id } = req.params;
    const { hide } = req.body;
    const updated = await SeriesStream.findByIdAndUpdate(id, { hide: !!hide }, { new: true });
    if (!updated) return res.status(404).json({ message: "Series not found" });
    res.json({ message: "Hide updated", series: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  syncAndGetSeriesStreams,
  getAllSavedSeriesStreams,
  setSeriesFeature,
  setSeriesHide
};
