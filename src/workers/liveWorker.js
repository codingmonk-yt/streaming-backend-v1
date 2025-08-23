const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const axios = require('axios');
const mongoose = require('mongoose');
const LiveStream = require('../models/LiveStream');
const Provider = require('../models/Provider');
const { ExcludeLiveCategories, normalizeCategory } = require('../util/excludeCategories');

require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
mongoose.connection.on('connected', () =>
  console.log('✅ Worker: Connected to MongoDB:', mongoose.connection.db.databaseName)
);
mongoose.connection.on('error', (err) =>
  console.error('❌ Worker: MongoDB connection error:', err)
);

// Redis connection
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
  "live-sync",
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

    // Fetch streams
    const apiUrl = `${dns.replace(/\/$/, '')}/player_api.php?username=${username}&password=${password}&action=get_live_streams`;
    const liveStreams = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

    if (!Array.isArray(liveStreams))
      throw new Error("API did not return an array of live streams");

    // Filter excluded categories
    const filtered = liveStreams.filter(stream => {
      // Normalize the category_id by removing leading zeros
      const normalizedCategoryId = normalizeCategory(stream.category_id);
      
      // Check if the normalized category ID is in the exclude list
      if (normalizedCategoryId && ExcludeLiveCategories.includes(normalizedCategoryId)) return false;
      
      // Check category_ids array if it exists
      if (stream.category_ids && Array.isArray(stream.category_ids)) {
        // Check if any normalized category ID in the array is in the exclude list
        if (stream.category_ids.some(cid => ExcludeLiveCategories.includes(normalizeCategory(cid)))) {
          return false;
        }
      }
      
      return true;
    });

    // Upsert into database (don't store credentials/dns)
    const upserts = filtered.map(item => ({
      updateOne: {
        filter: { provider: provider._id, stream_id: item.stream_id },
        update: {
          ...item,
          provider: provider._id,
          status: "ACTIVE"
        },
        upsert: true,
      }
    }));

    if (upserts.length) {
      await LiveStream.bulkWrite(upserts, { ordered: false });
    }
    return { success: true, total: upserts.length };
  },
  { connection }
);

// Worker Events
worker.on('completed', job => {
  console.log(`✅ Live stream sync job completed for provider=${job.data.providerId}:`, job.returnvalue);
});
worker.on('failed', (job, err) => {
  console.error(`❌ Live stream sync job failed for provider=${job?.data?.providerId}: ${err?.message}`);
});
worker.on('error', err => {
  console.error('❌ Worker error:', err.message);
});

console.log('🚀 Live stream worker started and waiting for jobs...');

module.exports = worker;
