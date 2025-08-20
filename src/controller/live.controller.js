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

// Standard route to fetch all saved for provider (without sync/run job)
async function getAllSavedLiveStreams(req, res) {
  try {
    const { providerId } = req.params;
    if (!providerId || !/^[0-9a-fA-F]{24}$/.test(providerId)) {
      return res.status(400).json({ message: "Invalid providerId" });
    }
    const streams = await LiveStream.find({ provider: providerId });
    res.json({ streams });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { syncAndGetLiveStreams, getAllSavedLiveStreams };
