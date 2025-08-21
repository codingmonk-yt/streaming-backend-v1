const VodStream = require('../models/VodStream');
const Provider = require('../models/Provider');
const { vodQueue } = require('../bull/vodQueue');

// Trigger sync and return VOD from DB after upsert
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
    setTimeout(async () => {
      const streams = await VodStream.find({ provider: providerId });
      res.json({ jobId: job.id, streams });
    }, 1500);

  } catch (e) {
    res.status(500).json({ message: "Sync error", error: e.message });
  }
}

// Paginated, filtered VOD from DB
async function getAllSavedVodStreams(req, res) {
  try {
    const { providerId, search, status, category_id, hide, feature, page = 1, limit = 10 } = req.query;
    const query = {};

    if (providerId) {
      if (!/^[0-9a-fA-F]{24}$/.test(providerId)) {
        return res.status(400).json({ message: "Invalid providerId format" });
      }
      query.provider = providerId;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;
    if (hide !== undefined) query.hide = hide === 'true';
    if (feature !== undefined) query.feature = feature === 'true';
    if (category_id) query.category_id = category_id;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const totalItems = await VodStream.countDocuments(query);
    const streams = await VodStream.find(query)
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
        search,
        status,
        provider: providerId,
        category_id,
        hide,
        feature
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Set/unset feature
async function setVodFeature(req, res) {
  try {
    const { id } = req.params;
    const { feature } = req.body;
    const updated = await VodStream.findByIdAndUpdate(id, { feature: !!feature }, { new: true });
    if (!updated) return res.status(404).json({ message: "VOD not found" });
    res.json({ message: "Feature updated", vod: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Set/unset hide
async function setVodHide(req, res) {
  try {
    const { id } = req.params;
    const { hide } = req.body;
    const updated = await VodStream.findByIdAndUpdate(id, { hide: !!hide }, { new: true });
    if (!updated) return res.status(404).json({ message: "VOD not found" });
    res.json({ message: "Hide updated", vod: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  syncAndGetVodStreams,
  getAllSavedVodStreams,
  setVodFeature,
  setVodHide
};
