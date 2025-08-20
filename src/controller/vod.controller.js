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
    const { providerId } = req.params;
    if (!providerId || !/^[0-9a-fA-F]{24}$/.test(providerId)) {
      return res.status(400).json({ message: "Invalid providerId" });
    }
    const streams = await VodStream.find({ provider: providerId });
    res.json({ streams });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { syncAndGetVodStreams, getAllSavedVodStreams };
