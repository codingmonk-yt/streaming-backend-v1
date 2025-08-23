const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const axios = require('axios');
const mongoose = require('mongoose');
const VodStream = require('../models/VodStream');
const Provider = require('../models/Provider');
const { ExcludeVodCategories, normalizeCategory } = require('../util/excludeCategories');

require('dotenv').config();

mongoose.connect(process.env.URL, {
  maxPoolSize: 30,
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
    try {
      const { providerId } = job.data;
      console.log(`🚀 Starting VOD sync for provider: ${providerId}`);
      
      if (!mongoose.Types.ObjectId.isValid(providerId)) {
        console.error(`❌ Invalid providerId format: ${providerId}`);
        throw new Error("Invalid providerId!");
      }

      // Update progress - Step 1: Finding provider
      job.updateProgress(10);
      console.log(`🔍 Finding provider with ID: ${providerId}`);
      
      const provider = await Provider.findById(providerId);
      if (!provider) {
        console.error(`❌ Provider not found with ID: ${providerId}`);
        throw new Error("Provider not found");
      }
      
      console.log(`✅ Found provider: ${provider.name} (${provider.status})`);
      
      if (provider.status !== "Active") {
        console.error(`❌ Provider ${provider.name} is not active. Current status: ${provider.status}`);
        throw new Error("Provider is not active");
      }

      // Update progress - Step 2: Getting credentials
      job.updateProgress(20);
      console.log(`🔑 Fetching credentials for provider: ${provider.name}`);
      
      // Get credentials
      try {
        const creds = await axios.post(provider.apiEndpoint, {}).then(r => r.data);
        console.log(`✅ Credentials API response received for ${provider.name}`);
        
        const username = creds.username;
        const password = creds.password;
        const dns = provider.dns;

        if (!username) {
          console.error(`❌ Missing username in credentials for provider: ${provider.name}`);
          throw new Error("Missing username in provider credentials");
        }
        
        if (!password) {
          console.error(`❌ Missing password in credentials for provider: ${provider.name}`);
          throw new Error("Missing password in provider credentials");
        }
        
        if (!dns) {
          console.error(`❌ Missing DNS in provider config: ${provider.name}`);
          throw new Error("Missing DNS in provider configuration");
        }
        
        console.log(`✅ Valid credentials and DNS found for provider: ${provider.name}`);
      } catch (error) {
        console.error(`❌ Error fetching credentials for provider ${provider.name}:`, error.message);
        if (error.response) {
          console.error(`API Response Status: ${error.response.status}`);
          console.error(`API Response Data:`, error.response.data);
        }
        throw new Error(`Failed to get credentials: ${error.message}`);
      }

      // Update progress - Step 3: Fetching VOD streams
      job.updateProgress(30);
      console.log(`📡 Fetching VOD streams from provider: ${provider.name}`);
      
      // Fetch VOD streams
      let vodStreams;
      try {
        const apiUrl = `${provider.dns.replace(/\/$/, '')}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_vod_streams`;
        console.log(`📡 VOD API URL: ${apiUrl.replace(/password=.*?(&|$)/, 'password=***$1')}`);
        
        const response = await axios.get(apiUrl, { timeout: 20000 });
        vodStreams = response.data;
        
        console.log(`✅ VOD API response received with status: ${response.status}`);
        
        if (!Array.isArray(vodStreams)) {
          console.error(`❌ API did not return an array of VOD streams. Response type: ${typeof vodStreams}`);
          console.error('Response preview:', JSON.stringify(vodStreams).substring(0, 200) + '...');
          throw new Error("API did not return an array of VOD streams");
        }
        
        console.log(`📊 Total VOD streams received: ${vodStreams.length}`);
      } catch (error) {
        console.error(`❌ Error fetching VOD streams for provider ${provider.name}:`, error.message);
        if (error.response) {
          console.error(`API Response Status: ${error.response.status}`);
          console.error(`API Response Data:`, error.response.data);
        }
        throw new Error(`Failed to fetch VOD streams: ${error.message}`);
      }

      // Update progress - Step 4: Filtering
      job.updateProgress(50);
      console.log(`🔍 Filtering ${vodStreams.length} VOD streams for excluded categories`);
      
      // Filter excluded categories
      const filtered = vodStreams.filter(stream => {
        // Normalize the category_id by removing leading zeros
        const normalizedCategoryId = normalizeCategory(stream.category_id);
        
        // Check if the normalized category ID is in the exclude list
        if (normalizedCategoryId && ExcludeVodCategories.includes(normalizedCategoryId)) {
          console.log(`⏭️ Skipping stream ${stream.stream_id} - ${stream.name} (excluded category: ${normalizedCategoryId})`);
          return false;
        }
        
        // Check category_ids array if it exists
        if (stream.category_ids && Array.isArray(stream.category_ids)) {
          // Check if any normalized category ID in the array is in the exclude list
          const excludedCatId = stream.category_ids.find(cid => 
            ExcludeVodCategories.includes(normalizeCategory(cid))
          );
          
          if (excludedCatId) {
            console.log(`⏭️ Skipping stream ${stream.stream_id} - ${stream.name} (excluded category in array: ${normalizeCategory(excludedCatId)})`);
            return false;
          }
        }
        
        return true;
      });
      
      console.log(`📊 Filtered VOD streams: ${filtered.length} (removed ${vodStreams.length - filtered.length})`);

      // Update progress - Step 5: Preparing database operations
      job.updateProgress(70);
      console.log(`🔧 Preparing database operations for ${filtered.length} VOD streams`);
      
      // Check if any streams remain after filtering
      if (filtered.length === 0) {
        console.warn(`⚠️ No VOD streams remain after filtering for provider: ${provider.name}`);
        return { success: true, total: 0, message: "No streams to process after filtering" };
      }
      
      // Upsert into database (do NOT save credentials/dns)
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
      
      console.log(`📊 Prepared ${upserts.length} database operations`);
      
      // Sample the first few updates to log their structure
      if (upserts.length > 0) {
        const sampleItem = upserts[0];
        console.log('📝 Sample update operation:');
        console.log(`  - Filter: provider=${sampleItem.updateOne.filter.provider}, stream_id=${sampleItem.updateOne.filter.stream_id}`);
        console.log(`  - Update sample keys: ${Object.keys(sampleItem.updateOne.update).slice(0, 5).join(', ')}...`);
      }

      // Update progress - Step 6: Writing to database
      job.updateProgress(80);
      console.log(`💾 Executing bulk write for ${upserts.length} VOD streams`);
      
      if (upserts.length) {
        try {
          const result = await VodStream.bulkWrite(upserts, { ordered: false });
          console.log(`✅ Database operation results:`);
          console.log(`  - Matched: ${result.matchedCount}`);
          console.log(`  - Modified: ${result.modifiedCount}`);
          console.log(`  - Inserted: ${result.insertedCount}`);
          console.log(`  - Upserted: ${result.upsertedCount}`);
        } catch (error) {
          console.error(`❌ Database operation failed:`, error);
          console.error(`Error name: ${error.name}`);
          console.error(`Error code: ${error.code}`);
          
          if (error.writeErrors) {
            console.error(`Write errors count: ${error.writeErrors.length}`);
            console.error(`First few write errors:`);
            error.writeErrors.slice(0, 3).forEach((writeError, index) => {
              console.error(`  Error ${index + 1}: ${writeError.errmsg}`);
              console.error(`  Error code: ${writeError.code}`);
              if (writeError.op) {
                console.error(`  Operation: stream_id=${writeError.op.update.stream_id}`);
              }
            });
          }
          
          throw new Error(`Database operation failed: ${error.message}`);
        }
      }
      
      // Verify data was inserted/updated
      const count = await VodStream.countDocuments({ provider: provider._id });
      console.log(`✅ Total VOD streams in database for provider ${provider.name}: ${count}`);
      
      // Completed
      job.updateProgress(100);
      console.log(`✅ VOD sync completed for provider: ${provider.name}`);
      
      return { success: true, total: upserts.length, providerName: provider.name, count: count };
    } catch (error) {
      console.error(`❌ VOD sync error: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
      throw error; // Re-throw the error to mark the job as failed
    }
  },
  { connection }
);

worker.on('completed', job => {
  console.log(`✅ VOD sync job completed for provider=${job.data.providerId}:`, job.returnvalue);
  console.log(`📊 Job duration: ${job.processedOn ? ((Date.now() - job.processedOn) / 1000).toFixed(2) : 'unknown'} seconds`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ VOD sync job failed for provider=${job?.data?.providerId}:`);
  console.error(`   Error: ${err?.message}`);
  console.error(`   Stack: ${err?.stack}`);
  console.error(`   Job data:`, job?.data);
  console.error(`   Job attempt: ${job?.attemptsMade} of ${job?.opts?.attempts || 1}`);
  console.error(`   Job duration: ${job?.processedOn ? ((Date.now() - job?.processedOn) / 1000).toFixed(2) : 'unknown'} seconds`);
});

worker.on('error', err => {
  console.error('❌ VOD Worker global error:', err.message);
  console.error('Stack trace:', err.stack);
});

worker.on('active', job => {
  console.log(`🏃 VOD sync job started for provider=${job.data.providerId}, job ID=${job.id}`);
});

worker.on('progress', (job, progress) => {
  console.log(`📈 VOD sync job progress: ${progress}% for provider=${job.data.providerId}, job ID=${job.id}`);
});

console.log('🚀 VOD worker started and waiting for jobs...');

module.exports = worker;
