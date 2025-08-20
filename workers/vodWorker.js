const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const axios = require('axios');
const mongoose = require('mongoose');
const VodStream = require('../src/models/VodStream');
const Provider = require('../src/models/Provider');
const { ExcludeVodCategories } = require('../src/util/excludeCategories');

require('dotenv').config();

mongoose.connect(process.env.URL, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

mongoose.connection.on('connected', () =>
  console.log('✅ VOD Worker: Connected to MongoDB:', mongoose.connection.db.databaseName)
);

mongoose.connection.on('error', (err) =>
  console.error('❌ VOD Worker: MongoDB connection error:', err)
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
  "vod-sync",
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

    // Fetch VOD streams
    const apiUrl = `${dns.replace(/\/$/, '')}/player_api.php?username=${username}&password=${password}&action=get_vod_streams`;
    const vodStreams = await axios.get(apiUrl, { timeout: 20000 }).then(r => r.data);

    if (!Array.isArray(vodStreams))
      throw new Error("API did not return an array of VOD streams");

    // Filter excluded categories
    const filtered = vodStreams.filter(stream => {
      if (stream.category_id && ExcludeVodCategories.includes(String(stream.category_id))) return false;
      if (
        stream.category_ids &&
        stream.category_ids.some(cid => ExcludeVodCategories.includes(String(cid)))
      ) return false;
      return true;
    });

    // Upsert into database (Do NOT save credentials/dns)
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
      await VodStream.bulkWrite(upserts, { ordered: false });
    }
    return { success: true, total: upserts.length };
  },
  { connection }
);

worker.on('completed', job => {
  console.log(`✅ VOD sync job completed for provider=${job.data.providerId}:`, job.returnvalue);
});
worker.on('failed', (job, err) => {
  console.error(`❌ VOD sync job failed for provider=${job?.data?.providerId}: ${err?.message}`);
});
worker.on('error', err => {
  console.error('❌ VOD Worker error:', err.message);
});

console.log('🚀 VOD worker started and waiting for jobs...');

module.exports = worker;
