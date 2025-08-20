const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const Provider = require('../src/models/Provider');
const axios = require('axios');

require('dotenv').config();

// Connect to MongoDB with optimized settings
mongoose.connect(process.env.URL, {
  maxPoolSize: 20, // Increased for better concurrency
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

// Optimized Redis connection with better error handling
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  connectTimeout: 10000,
  // Add reconnect strategy
  retryStrategy(times) {
    const delay = Math.min(times * 500, 5000);
    console.log(`Redis reconnecting attempt ${times} with delay ${delay}ms`);
    return delay;
  }
});

// Enhanced category conversion with validation
function toSchemaCategory(raw, providerId, type) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid category data: ${JSON.stringify(raw)}`);
  }
  
  // Validate required fields
  if (!raw.category_id || !/^\d+$/.test(String(raw.category_id))) {
    throw new Error(`Invalid category_id: ${raw.category_id}`);
  }
  
  return {
    category_id: String(raw.category_id).padStart(4, '0'),
    category_name: (raw.category_name || '').trim(),
    parent_id: null,
    provider: String(providerId),
    category_type: String(type)
  };
}

// Improved HTTP request function with retries and exponential backoff
async function makeApiCall(url, method = 'GET', data = null, retries = 3, backoffMs = 1000) {
  let attempt = 0;
  let lastError = null;
  
  while (attempt < retries) {
    try {
      const response = await axios({
        url,
        method,
        data,
        timeout: 20000, // Increased timeout (20 seconds)
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Category-Sync-Worker/1.0',
        },
        validateStatus: status => status < 500 // Accept any non-server error status
      });
      
      // Check for API error responses that may still return 200 status
      if (response.status >= 400) {
        throw new Error(`API Error ${response.status}: ${response.statusText}`);
      }
      
      if (!response.data) {
        throw new Error('API returned empty response');
      }
      
      return response.data;
    } catch (error) {
      lastError = error;
      attempt++;
      
      // Only log retry attempts, not the initial failure
      if (attempt < retries) {
        const waitTime = backoffMs * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`API call failed, retry ${attempt}/${retries} in ${waitTime}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // All retries failed, throw the last error
  if (lastError.response) {
    throw new Error(`API Error ${lastError.response.status}: ${lastError.response.statusText}`);
  }
  throw new Error(`Network Error after ${retries} retries: ${lastError.message}`);
}

// Memory optimization helper
function freeMemory() {
  if (global.gc) {
    try {
      global.gc();
      return true;
    } catch (e) {
      console.error('Error running garbage collection:', e);
    }
  }
  return false;
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

    // IMPROVEMENT: Batch processing with bulkWrite
async function processCategoryBatch(categories, provider, type, stats) {
  // Filter out invalid categories
  const validCategories = categories.filter(category => {
    if (!category.category_id || !/^\d+$/.test(String(category.category_id))) {
      stats.invalid++;
      return false;
    }
    return true;
  });
  
  if (validCategories.length === 0) {
    console.log(`⚠️ Worker: No valid categories in batch for ${type}`);
    return;
  }
  
  // Step 1: Get all existing categories in this batch to determine updates vs. inserts
  const categoryIds = validCategories.map(c => String(c.category_id).padStart(4, '0'));
  
  const existingCategories = await Category.find({
    category_id: { $in: categoryIds },
    provider: provider._id,
    category_type: type
  }).lean();
  
  const existingCategoryMap = existingCategories.reduce((map, cat) => {
    map[cat.category_id] = cat;
    return map;
  }, {});
  
  // Step 2: Prepare bulk operations
  const bulkOperations = validCategories.map(rawCategory => {
    try {
      const doc = {
        category_id: String(rawCategory.category_id).padStart(4, '0'),
        category_name: (rawCategory.category_name || '').trim(),
        parent_id: null,
        provider: String(provider._id),
        category_type: String(type)
      };
      
      const existing = existingCategoryMap[doc.category_id];
      
      // If this category already exists
      if (existing) {
        // Check if anything actually changed
        if (existing.category_name !== doc.category_name) {
          stats.updated++;
          return {
            updateOne: {
              filter: { 
                category_id: doc.category_id,
                provider: doc.provider,
                category_type: doc.category_type
              },
              update: { $set: doc },
              upsert: true
            }
          };
        } else {
          // No changes needed
          stats.unchanged++;
          return null; // Skip this operation
        }
      } else {
        // New category
        stats.created++;
        return {
          insertOne: {
            document: doc
          }
        };
      }
    } catch (error) {
      console.error(`Error preparing bulk operation:`, error);
      stats.invalid++;
      return null;
    }
  }).filter(op => op !== null); // Remove null operations (unchanged categories)
  
  // Only perform bulkWrite if there are operations to perform
  if (bulkOperations.length > 0) {
    try {
      const result = await Category.bulkWrite(bulkOperations, { ordered: false });
      console.log(`� Worker: Bulk operation results for ${type}:`, {
        insertedCount: result.insertedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount
      });
    } catch (error) {
      // Handle partial failures - some operations may have succeeded
      if (error.writeErrors) {
        console.error(`❌ Worker: ${error.writeErrors.length} write errors during bulk operation`);
        
        // Sample a few errors for logging
        const sampleErrors = error.writeErrors.slice(0, 3).map(e => ({
          index: e.index,
          code: e.code,
          message: e.errmsg
        }));
        
        console.error(`❌ Sample errors:`, sampleErrors);
        
        // Still count the successful operations
        if (error.result) {
          console.log(`⚠️ Partial success:`, {
            inserted: error.result.nInserted,
            upserted: error.result.nUpserted,
            modified: error.result.nModified
          });
        }
      } else {
        // Rethrow non-bulk errors
        throw error;
      }
    }
  } else {
    console.log(`ℹ️ Worker: No changes needed for ${type} batch`);
  }
}

    // IMPROVEMENT: Enhanced category type synchronization with batch processing
async function syncCategoryType(type, action, provider, dns, username, password, stats) {
  try {
    const url = `${dns.replace(/\/$/, '')}/player_api.php?username=${username}&password=${password}&action=${action}`;
    
    console.log(`📡 Worker: Syncing ${type} categories from: ${url.substring(0, 80)}...`);
    
    // Fetch categories with retry
    const categories = await makeApiCall(url);
    
    if (!Array.isArray(categories)) {
      console.error(`❌ Worker: Invalid ${type} categories data - not an array:`, typeof categories);
      throw new Error(`Invalid ${type} categories data - expected array, got ${typeof categories}`);
    }
    
    console.log(`📊 Worker: Retrieved ${categories.length} ${type} categories`);
    stats.total = categories.length;
    
    // IMPROVEMENT: Process in batches for better memory management
    const BATCH_SIZE = 100; // Process 100 categories at a time
    const batches = Math.ceil(categories.length / BATCH_SIZE);
    
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, categories.length);
      const batchItems = categories.slice(batchStart, batchEnd);
      
      console.log(`🔄 Worker: Processing ${type} batch ${batchIndex + 1}/${batches} (${batchItems.length} items)`);
      
      try {
        await processCategoryBatch(batchItems, provider, type, stats);
      } catch (error) {
        console.error(`❌ Worker: Error processing ${type} batch ${batchIndex + 1}/${batches}:`, error.message);
        stats.errors = stats.errors || [];
        stats.errors.push(`Batch ${batchIndex + 1} error: ${error.message}`);
        // Continue with next batch despite errors
      }
      
      // Suggest garbage collection after each batch
      freeMemory();
    }
    
    console.log(`✅ Worker: ${type} sync completed:`, {
      total: categories.length,
      created: stats.created,
      updated: stats.updated,
      unchanged: stats.unchanged,
      invalid: stats.invalid,
      errors: stats.errors ? stats.errors.length : 0
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Worker: Error in ${type} sync:`, error.message);
    stats.errors = stats.errors || [];
    stats.errors.push(error.message);
    return false;
  }
}
    
    // Initialize stats object with errors array
    const stats = {
      'Live TV': { created: 0, updated: 0, invalid: 0, total: 0, unchanged: 0, errors: [] },
      'VOD':     { created: 0, updated: 0, invalid: 0, total: 0, unchanged: 0, errors: [] },
      'Series':  { created: 0, updated: 0, invalid: 0, total: 0, unchanged: 0, errors: [] }
    };
    
    const startTime = Date.now();
    
    try {
      // IMPROVEMENT: Process all category types in parallel with Promise.allSettled
      const categoryTypes = [
        { type: 'Live TV', action: 'get_live_categories' },
        { type: 'VOD', action: 'get_vod_categories' },
        { type: 'Series', action: 'get_series_categories' }
      ];
      
      console.log('🚀 Worker: Starting parallel sync of all category types...');
      
      // Process all category types in parallel
      const results = await Promise.allSettled(categoryTypes.map(async ({ type, action }) => {
        console.log(`� Worker: Starting ${type} categories sync...`);
        return await syncCategoryType(type, action, provider, dns, username, password, stats[type]);
      }));
      
      // Process results to identify any failed types
      const failedTypes = results
        .map((result, index) => ({ result, type: categoryTypes[index].type }))
        .filter(({ result }) => result.status === 'rejected' || result.value === false)
        .map(({ type }) => type);
      
      if (failedTypes.length > 0) {
        console.warn(`⚠️ Some category types failed: ${failedTypes.join(', ')}`);
      }
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      const totalStats = {
        totalCategories: stats['Live TV'].total + stats['VOD'].total + stats['Series'].total,
        totalCreated: stats['Live TV'].created + stats['VOD'].created + stats['Series'].created,
        totalUpdated: stats['Live TV'].updated + stats['VOD'].updated + stats['Series'].updated,
        totalUnchanged: stats['Live TV'].unchanged + stats['VOD'].unchanged + stats['Series'].unchanged,
        totalInvalid: stats['Live TV'].invalid + stats['VOD'].invalid + stats['Series'].invalid,
        totalErrors: (stats['Live TV'].errors?.length || 0) + (stats['VOD'].errors?.length || 0) + (stats['Series'].errors?.length || 0)
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
    concurrency: 3, // IMPROVEMENT: Process multiple jobs concurrently
    // Fix for "keepJobs" error - use proper object format instead of numbers
    removeOnComplete: { count: 50 }, // Keep more completed jobs for better debugging
    removeOnFail: { count: 20 },
    // Enhanced settings to prevent lock errors
    lockDuration: 900000, // 15 minutes - longer than your job duration
    lockRenewTime: 30000,  // 30 seconds - more frequent renewal
    stalledInterval: 60000, // 60 seconds
    maxStalledCount: 2,
    // Additional settings
    settings: {
      retryProcessDelay: 5000,
      drainDelay: 5000
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
  try {
    // Handle both simple number progress and structured progress objects
    const progressData = typeof progress === 'object' ? progress : { progress };
    console.log(`📊 Job ${job.id} progress: ${progressData.progress}% - ${progressData.stage || 'processing'} - ${progressData.message || ''}`);
  } catch (e) {
    console.error('Error logging progress:', e);
  }
});

// Enhanced graceful shutdown with log flushing delay
const gracefulShutdown = async (signal) => {
  console.log(`🛑 Worker: Received ${signal}, closing worker gracefully...`);
  
  try {
    // Close worker first to stop accepting new jobs
    console.log('Closing BullMQ worker...');
    await worker.close();
    console.log('✅ Worker closed successfully');
    
    // Close Redis connection
    console.log('Closing Redis connection...');
    await connection.quit();
    console.log('✅ Redis connection closed');
    
    // Close MongoDB connection last
    console.log('Closing MongoDB connection...');
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    
    console.log('👋 Worker: Shutdown complete');
    
    // Give time for logs to flush before exit
    setTimeout(() => {
      process.exit(0);
    }, 500);
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    // Force exit after 3 seconds if graceful shutdown fails
    setTimeout(() => {
      process.exit(1);
    }, 3000);
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

console.log('🚀 Optimized category sync worker started and waiting for jobs...');
console.log('📋 Worker configuration:', {
  concurrency: 3,
  lockDuration: '15 minutes',
  batchSize: 100,
  parallelSync: true,
  removeOnComplete: 50,
  removeOnFail: 20
});

module.exports = worker;
