const LiveStream = require('../models/LiveStream');
const Provider = require('../models/Provider');
const { liveQueue } = require('../bull/liveQueue');

// Sync and fetch
async function syncAndGetLiveStreams(req, res) {
  try {
    const { providerId } = req.params;
    if (!providerId || !/^[0-9a-fA-F]{24}$/.test(providerId)) {
      return res.status(400).json({ message: "Invalid providerId" });
    }
    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ message: "Provider not found" });

    // Queue job
    const job = await liveQueue.add('liveSync', { providerId });
    setTimeout(async () => {
      const streams = await LiveStream.find({ provider: providerId });
      res.json({ jobId: job.id, streams });
    }, 1500);

  } catch (e) {
    res.status(500).json({ message: "Sync error", error: e.message });
  }
}

// Filtered, paginated DB fetch
async function getAllSavedLiveStreams(req, res) {
  try {
    const { search, category_id, provider, status, favorite, page = 1, limit = 10 } = req.query;
    const query = {};

    if (provider && /^[0-9a-fA-F]{24}$/.test(provider)) query.provider = provider;
    if (category_id) query.category_id = category_id;
    if (status) query.status = status.toUpperCase();
    if (favorite !== undefined) query.feature = favorite === 'true';

    // Hide logic replaced: if hide=true, filter status HIDDEN; if hide=false, exclude HIDDEN
    if (req.query.hide === 'true') {
      query.status = 'HIDDEN';
    } else if (req.query.hide === 'false') {
      query.status = { $ne: 'HIDDEN' };
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { name: regex },
        { title: regex }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const totalItems = await LiveStream.countDocuments(query);
    const streams = await LiveStream.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ updatedAt: -1 });

    const totalPages = Math.ceil(totalItems / limitNum);
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
        search, category_id, provider, status, hide: req.query.hide, favorite
      }
    });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
}

// PATCH to set/unset feature
async function setLiveFeature(req, res) {
  try {
    const { id } = req.params;
    const { feature } = req.body;
    const updated = await LiveStream.findByIdAndUpdate(id, { feature: !!feature }, { new: true });
    if (!updated) return res.status(404).json({ message: "Live stream not found" });
    res.json({ message: "Feature updated", stream: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}


// PATCH to set/unset hidden status
async function setLiveHide(req, res) {
  try {
    const { id } = req.params;
    const { hide } = req.body;
    const newStatus = hide ? 'HIDDEN' : 'ACTIVE';
    const updated = await LiveStream.findByIdAndUpdate(id, { status: newStatus }, { new: true });
    if (!updated) return res.status(404).json({ message: "Live stream not found" });
    res.json({ message: "Hide updated", stream: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  syncAndGetLiveStreams,
  getAllSavedLiveStreams,
  setLiveFeature,
  setLiveHide
};
