const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const axios = require('axios');
const mongoose = require('mongoose');
const SeriesStream = require('../models/SeriesStream');
const Provider = require('../models/Provider');
const { ExcludeSeriesCategories } = require('../util/excludeCategories');

require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

mongoose.connection.on('connected', () =>
  console.log('✅ Series Worker: Connected to MongoDB:', mongoose.connection.db.databaseName)
);

mongoose.connection.on('error', (err) =>
  console.error('❌ Series Worker: MongoDB connection error:', err)
);

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 500, 5000);
    console.log(`Redis reconnecting attempt ${times} with delay ${delay}ms`);
    return delay;
  }
});

const worker = new Worker(
  "series-sync",
  async (job) => {
    const { providerId } = job.data;
    if (!mongoose.Types.ObjectId.isValid(providerId))
      throw new Error("Invalid providerId!");

    const provider = await Provider.findById(providerId);
    if (!provider) throw new Error("Provider not found");
    if (provider.status !== "Active") throw new Error("Provider is not active");

    // Get credentials
    const creds = await axios.post(provider.apiEndpoint, {}).then(r => r.data);
    const username = creds.username;
    const password = creds.password;
    const dns = provider.dns;

    if (!username || !password || !dns) {
      throw new Error("Missing required provider credentials");
    }

    // Fetch series streams
    const apiUrl = `${dns.replace(/\/$/, '')}/player_api.php?username=${username}&password=${password}&action=get_series`;
    const seriesStreams = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

    if (!Array.isArray(seriesStreams))
      throw new Error("API did not return an array of series streams");

    // Filter excluded categories
    const filtered = seriesStreams.filter(series => {
      if (series.category_id && ExcludeSeriesCategories.includes(String(series.category_id))) return false;
      if (
        series.category_ids &&
        series.category_ids.some(cid => ExcludeSeriesCategories.includes(String(cid)))
      ) return false;
      return true;
    });

    // Upsert into database (Do NOT save credentials/dns)
    const upserts = filtered.map(item => ({
      updateOne: {
        filter: { provider: provider._id, series_id: item.series_id },
        update: {
          ...item,
          provider: provider._id,
          status: "ACTIVE"
        },
        upsert: true,
      }
    }));

    if (upserts.length) {
      await SeriesStream.bulkWrite(upserts, { ordered: false });
    }
    return { success: true, total: upserts.length };
  },
  { connection }
);

worker.on('completed', job => {
  console.log(`✅ Series sync job completed for provider=${job.data.providerId}:`, job.returnvalue);
});
worker.on('failed', (job, err) => {
  console.error(`❌ Series sync job failed for provider=${job?.data?.providerId}: ${err?.message}`);
});
worker.on('error', err => {
  console.error('❌ Series Worker error:', err.message);
});

console.log('🚀 Series worker started and waiting for jobs...');

module.exports = worker;
