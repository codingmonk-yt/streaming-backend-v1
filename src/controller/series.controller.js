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
    const { providerId } = req.params;
    if (!providerId || !/^[0-9a-fA-F]{24}$/.test(providerId)) {
      return res.status(400).json({ message: "Invalid providerId" });
    }
    const streams = await SeriesStream.find({ provider: providerId });
    res.json({ streams });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { syncAndGetSeriesStreams, getAllSavedSeriesStreams };
