const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const Provider = require('../src/models/Provider');
const axios = require('axios');

require('dotenv').config();

// Connect to MongoDB - REMOVED deprecated options
mongoose.connect(process.env.URL, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// Database connection logging
mongoose.connection.on('connected', () => {
  console.log('✅ Worker: Connected to MongoDB:', mongoose.connection.db.databaseName);
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Worker: MongoDB connection error:', err);
});

// Always set maxRetriesPerRequest: null for BullMQ!
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
});

function toSchemaCategory(raw, providerId, type) {
  return {
    category_id: String(raw.category_id).padStart(4, '0'),
    category_name: (raw.category_name || '').trim(),
    parent_id: null,
    provider: String(providerId),
    category_type: String(type)
  };
}

// Helper function to make HTTP requests using axios
async function makeApiCall(url, method = 'GET', data = null) {
  try {
    const response = await axios({
      url,
      method,
      data,
      timeout: 15000, // 15 second timeout
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error ${error.response.status}: ${error.response.statusText}`);
    }
    throw new Error(`Network Error: ${error.message}`);
  }
}

const worker = new Worker(
  "category-sync",
  async job => {
    const { providerId } = job.data;
    
    console.log('🔍 Worker: Processing job for provider:', providerId);
    console.log('🔍 Worker: Database name:', mongoose.connection.db.databaseName);
    console.log('🔍 Worker: Connection state:', mongoose.connection.readyState);
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      console.log('❌ Worker: Invalid provider ID format:', providerId);
      throw new Error(`Invalid provider ID format: ${providerId}`);
    }
    
    const provider = await Provider.findById(providerId);
    
    if (!provider) {
      console.log('❌ Worker: Provider not found in database:', providerId);
      const existingProviders = await Provider.find({}, { name: 1, status: 1, _id: 1 }).limit(5);
      console.log('📋 Available providers:', existingProviders.map(p => ({
        id: p._id.toString(),
        name: p.name,
        status: p.status
      })));
      throw new Error(`Provider not found: ${providerId}`);
    }
    
    console.log('✅ Worker: Provider found:', {
      id: provider._id,
      name: provider.name,
      status: provider.status,
      owner: provider.owner,
      apiEndpoint: provider.apiEndpoint
    });
    
    if (provider.status !== 'Active') {
      console.log('🚫 Worker: Provider is not active. Status:', provider.status);
      throw new Error(`Provider is ${provider.status}. Only Active providers can be synced.`);
    }
    
    console.log('🚀 Worker: Starting category sync for provider:', provider.name);
    
    // Fetch credentials from provider API using POST
    let creds;
    try {
      console.log('🔗 Worker: Fetching credentials from:', provider.apiEndpoint);
      creds = await makeApiCall(provider.apiEndpoint, 'POST');
      console.log('📦 Worker: Credentials response received:', {
        hasUsername: !!creds.username,
        hasPassword: !!creds.password,
        hasDns: !!creds.dns,
        credKeys: Object.keys(creds || {})
      });
      
    } catch (error) {
      console.error('❌ Worker: Failed to fetch credentials:', error.message);
      throw new Error(`Failed to fetch provider credentials: ${error.message}`);
    }
    
    // Use DNS from provider model (as you mentioned dns comes from provider)
    const dns = provider.dns;
    const username = creds.username;
    const password = creds.password;
    
    console.log('🔑 Worker: Credentials check:', {
      hasDns: !!dns,
      hasUsername: !!username,
      hasPassword: !!password,
      dns: dns ? dns.substring(0, 50) + '...' : 'missing',
      dnsSource: 'provider model'
    });
    
    if (!dns || !username || !password) {
      throw new Error(`Invalid provider credentials - missing: ${[
        !dns && 'dns',
        !username && 'username', 
        !password && 'password'
      ].filter(Boolean).join(', ')}`);
    }

    async function syncOne(type, action, stats) {
      const url = `${dns.replace(/\/$/, '')}/player_api.php?username=${username}&password=${password}&action=${action}`;
      
      console.log(`📡 Worker: Syncing ${type} categories from: ${url.substring(0, 80)}...`);
      
      let cats;
      try {
        cats = await makeApiCall(url);
      } catch (error) {
        console.error(`❌ Worker: Error fetching ${type} categories:`, error.message);
        throw new Error(`Failed to fetch ${type} categories: ${error.message}`);
      }
      
      if (!Array.isArray(cats)) {
        console.error(`❌ Worker: Invalid ${type} categories data - not an array:`, typeof cats);
        console.error(`❌ Worker: Actual response:`, JSON.stringify(cats).substring(0, 200));
        throw new Error(`Invalid ${type} categories data - expected array, got ${typeof cats}`);
      }
      
      console.log(`📊 Worker: Processing ${cats.length} ${type} categories...`);
      
      let processed = 0;
      let unchanged = 0;
      
      // Updated category processing logic to handle duplicates
      for (const c of cats) {
        if (!c.category_id || !/^\d+$/.test(String(c.category_id))) { 
          stats.invalid++; 
          continue; 
        }
        
        const doc = toSchemaCategory(c, provider._id, type);
        
        try {
          // Check if category already exists
          const existingCategory = await Category.findOne({
            category_id: doc.category_id,
            provider: doc.provider,
            category_type: doc.category_type
          });
          
          if (existingCategory) {
            // Check if anything actually changed
            if (existingCategory.category_name !== doc.category_name) {
              const updated = await Category.findByIdAndUpdate(
                existingCategory._id,
                { category_name: doc.category_name },
                { new: true }
              );
              stats.updated++;
              console.log(`✅ Updated category ${doc.category_id}: "${existingCategory.category_name}" → "${doc.category_name}"`);
            } else {
              // Category exists and is identical - this is normal for re-syncs
              unchanged++;
              // Only log every 25th unchanged category to reduce noise
              if (unchanged % 25 === 0) {
                console.log(`📋 ${unchanged} categories unchanged so far...`);
              }
            }
          } else {
            // Create new category
            const newCategory = await Category.create(doc);
            stats.created++;
            console.log(`✅ Created category ${doc.category_id}: "${doc.category_name}"`);
          }
          
          processed++;
          
          // Log progress every 50 categories for better performance
          if (processed % 50 === 0) {
            console.log(`📈 Worker: Processed ${processed}/${cats.length} ${type} categories... (Created: ${stats.created}, Updated: ${stats.updated}, Unchanged: ${unchanged}, Invalid: ${stats.invalid})`);
          }
          
        } catch (err) {
          if (err.code === 11000) {
            console.log(`⚠️ Duplicate key error for category ${doc.category_id} - skipping`);
            stats.invalid++;
          } else {
            console.error(`❌ Worker: Error processing category ${doc.category_id}:`, err.message);
            stats.invalid++;
          }
        }
      }
      
      stats.total += cats.length;
      stats.unchanged = unchanged; // Track unchanged categories
      
      console.log(`✅ Worker: ${type} sync completed:`, {
        total: cats.length,
        created: stats.created,
        updated: stats.updated,
        unchanged: unchanged,
        invalid: stats.invalid
      });
    }

    const stats = {
      'Live TV': { created: 0, updated: 0, invalid: 0, total: 0, unchanged: 0 },
      'VOD':     { created: 0, updated: 0, invalid: 0, total: 0, unchanged: 0 },
      'Series':  { created: 0, updated: 0, invalid: 0, total: 0, unchanged: 0 }
    };
    
    const startTime = Date.now();
    
    try {
      console.log('🎬 Worker: Starting Live TV categories sync...');
      await syncOne('Live TV', 'get_live_categories', stats['Live TV']);
      
      console.log('🎥 Worker: Starting VOD categories sync...');
      await syncOne('VOD', 'get_vod_categories', stats['VOD']);
      
      console.log('📺 Worker: Starting Series categories sync...');
      await syncOne('Series', 'get_series_categories', stats['Series']);
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      const totalStats = {
        totalCategories: stats['Live TV'].total + stats['VOD'].total + stats['Series'].total,
        totalCreated: stats['Live TV'].created + stats['VOD'].created + stats['Series'].created,
        totalUpdated: stats['Live TV'].updated + stats['VOD'].updated + stats['Series'].updated,
        totalUnchanged: stats['Live TV'].unchanged + stats['VOD'].unchanged + stats['Series'].unchanged,
        totalInvalid: stats['Live TV'].invalid + stats['VOD'].invalid + stats['Series'].invalid
      };
      
      console.log('🎉 Worker: All category types synced successfully for provider:', provider.name);
      console.log(`⏱️ Worker: Total sync duration: ${duration} seconds`);
      console.log('📊 Worker: Final statistics:', {
        ...totalStats,
        breakdown: stats
      });
      
      // Log sync summary
      if (totalStats.totalCreated > 0) {
        console.log(`🆕 Created ${totalStats.totalCreated} new categories`);
      }
      if (totalStats.totalUpdated > 0) {
        console.log(`📝 Updated ${totalStats.totalUpdated} categories`);
      }
      if (totalStats.totalUnchanged > 0) {
        console.log(`📋 ${totalStats.totalUnchanged} categories were already up to date`);
      }
      if (totalStats.totalInvalid > 0) {
        console.log(`⚠️ ${totalStats.totalInvalid} categories had issues`);
      }
      
    } catch (error) {
      console.error('❌ Worker: Error during category sync:', error.message);
      throw error;
    }

    return {
      ...stats,
      syncDuration: ((Date.now() - startTime) / 1000).toFixed(2) + 's',
      provider: {
        id: provider._id,
        name: provider.name
      },
      summary: {
        totalCategories: stats['Live TV'].total + stats['VOD'].total + stats['Series'].total,
        totalCreated: stats['Live TV'].created + stats['VOD'].created + stats['Series'].created,
        totalUpdated: stats['Live TV'].updated + stats['VOD'].updated + stats['Series'].updated,
        totalUnchanged: stats['Live TV'].unchanged + stats['VOD'].unchanged + stats['Series'].unchanged,
        totalInvalid: stats['Live TV'].invalid + stats['VOD'].invalid + stats['Series'].invalid
      }
    };
  },
  { 
    connection,
    concurrency: 1, // Process one job at a time to avoid conflicts
    // Fix for "keepJobs" error - use proper object format instead of numbers
    removeOnComplete: { count: 15 }, // Keep last 10 completed jobs
    removeOnFail: { count: 5 }, // Keep last 5 failed jobs
    // Enhanced settings to prevent lock errors
    lockDuration: 600000, // 10 minutes - longer than your job duration
    lockRenewTime: 15000,  // 15 seconds - more frequent renewal
    stalledInterval: 30000, // 30 seconds
    maxStalledCount: 1,
    // Additional settings
    settings: {
      retryProcessDelay: 5000,
    }
  }
);

worker.on('completed', job => {
  const result = job.returnvalue;
  const summary = result.summary || {};
  
  console.log(`✅ Bulk sync completed for provider=${job.data.providerId}`);
  console.log(`📈 Summary: ${summary.totalCategories || 0} processed, ${summary.totalCreated || 0} created, ${summary.totalUpdated || 0} updated, ${summary.totalUnchanged || 0} unchanged in ${result.syncDuration || 'unknown'}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Bulk sync failed for provider=${job?.data?.providerId}: ${err?.message}`);
});

worker.on('error', err => {
  console.error('❌ Worker error:', err.message);
  // Don't log the full stack trace for known lock errors
  if (!err.message.includes('Missing lock for job')) {
    console.error('❌ Worker error stack:', err.stack);
  }
});

worker.on('stalled', (jobId) => {
  console.log(`⚠️ Job ${jobId} stalled and will be retried`);
});

worker.on('progress', (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${progress}%`);
});

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`🛑 Worker: Received ${signal}, closing worker gracefully...`);
  
  try {
    await worker.close();
    console.log('✅ Worker closed successfully');
    
    await connection.quit();
    console.log('✅ Redis connection closed');
    
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    
    console.log('👋 Worker: Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('🚀 Category sync worker started and waiting for jobs...');
console.log('📋 Worker configuration:', {
  concurrency: 1,
  lockDuration: '10 minutes',
  removeOnComplete: 10,
  removeOnFail: 5
});

module.exports = worker;
