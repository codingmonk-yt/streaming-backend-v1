const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Provider = require('../models/Provider');
const { connection } = require('../config/queue');

// Configuration for batch processing
const BATCH_SIZE = 100; // Number of categories to process in one batch

// Helper function: Transform external API category to schema
function toSchemaCategory(raw, providerId, type) {
  return {
    category_id: String(raw.category_id).padStart(4, '0'),
    category_name: (raw.category_name || '').trim(),
    parent_id: null,
    provider: providerId, // Use ObjectId reference
    category_type: String(type)
  };
}

/**
 * Process a batch of categories with bulkWrite
 * @param {Array} batch Array of category data to process
 * @param {mongoose.Types.ObjectId} providerId The provider ID
 * @param {String} categoryType The category type
 * @param {Array} blacklistedCategories Array of blacklisted category IDs
 * @returns {Object} Processing results
 */
async function processCategoryBatch(batch, providerId, categoryType, blacklistedCategories = []) {
  if (!batch || !batch.length) {
    return { created: 0, updated: 0, invalid: 0, blacklisted: 0 };
  }

  // Results counters
  const results = { created: 0, updated: 0, invalid: 0, blacklisted: 0 };
  
  // Prepare operations for bulkWrite
  const bulkOps = [];
  const invalidCategories = [];
  
  for (const cat of batch) {
    if (!cat.category_id || !/^\d+$/.test(String(cat.category_id))) {
      invalidCategories.push(cat);
      results.invalid++;
      continue;
    }
    
    // Check if category is blacklisted
    const categoryId = String(cat.category_id).padStart(4, '0');
    if (blacklistedCategories.includes(categoryId)) {
      console.log(`Skipping blacklisted category: ${categoryId} - ${cat.category_name}`);
      results.blacklisted++;
      continue;
    }

    const doc = toSchemaCategory(cat, providerId, categoryType);
    
    // Add to bulk operations
    bulkOps.push({
      updateOne: {
        filter: { 
          category_id: doc.category_id, 
          provider: doc.provider, 
          category_type: doc.category_type 
        },
        update: { $set: doc },
        upsert: true
      }
    });
  }

  // If we have valid operations to perform
  if (bulkOps.length > 0) {
    try {
      // Execute bulkWrite
      const bulkResult = await Category.bulkWrite(bulkOps, { ordered: false });
      
      // Update counters
      results.created += bulkResult.upsertedCount || 0;
      results.updated += bulkResult.modifiedCount || 0;
      
      console.log(`Batch processed: ${bulkOps.length} operations, ${results.created} created, ${results.updated} updated, ${results.blacklisted} blacklisted`);
    } catch (error) {
      // If it's a BulkWriteError, some operations might have succeeded
      if (error.name === 'BulkWriteError') {
        console.error(`Partial failure in batch processing: ${error.message}`);
        
        // Update counters with what succeeded
        if (error.result) {
          results.created += error.result.upsertedCount || 0;
          results.updated += error.result.modifiedCount || 0;
          
          // Count writeErrors as invalid
          if (error.writeErrors) {
            results.invalid += error.writeErrors.length;
          }
        }
      } else {
        // For other errors, mark all as invalid
        console.error(`Error processing batch: ${error.message}`);
        results.invalid += bulkOps.length;
      }
    }
  }
  
  return results;
}

// Create a worker to process category sync jobs
const categoryWorker = new Worker('category-sync', async job => {
  console.log(`Processing job ${job.id} of type ${job.name}`);
  
  try {
    const { providerId } = job.data;
    
    // Validate providerId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      throw new Error(`Invalid provider ID: ${providerId}`);
    }
    
    // Fetch provider details
    const provider = await Provider.findById(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    
    const { dns, username, password } = provider;
    
    // In the future, you would fetch blacklisted categories from database
    // For now, initialize empty blacklisted categories array
    // This would typically come from a provider setting or separate collection
    const blacklistedCategories = [];
    
    // Optionally: Fetch existing blacklisted categories from database
    // Example implementation (commented out until implemented):
    // const blacklistedCategoriesFromDB = await Category.find({ 
    //   provider: providerId, 
    //   blacklisted: true 
    // }).select('category_id');
    // blacklistedCategories.push(...blacklistedCategoriesFromDB.map(cat => cat.category_id));
    
    const stats = {
      'Live TV': { created: 0, updated: 0, invalid: 0, blacklisted: 0, total: 0 },
      'VOD': { created: 0, updated: 0, invalid: 0, blacklisted: 0, total: 0 },
      'Series': { created: 0, updated: 0, invalid: 0, blacklisted: 0, total: 0 }
    };
    
    // Helper to fetch & sync one type
    async function syncOne(type, action, stats) {
      await job.updateProgress({ status: `Syncing ${type} categories...`, progress: 33 * Object.keys(stats).indexOf(type) });
      
      const url = `${dns.replace(/\/$/, '')}/player_api.php?username=${username}&password=${password}&action=${action}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed fetch for ${type} categories`);
      const cats = await resp.json();
      if (!Array.isArray(cats)) throw new Error(`Invalid ${type} categories data`);
      
      stats[type].total = cats.length;
      
      // Process in batches for better performance
      const batches = [];
      for (let i = 0; i < cats.length; i += BATCH_SIZE) {
        batches.push(cats.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`Processing ${type}: ${cats.length} categories in ${batches.length} batches`);
      
      let processedCount = 0;
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        await job.updateProgress({ 
          status: `Processing ${type} batch ${i+1}/${batches.length}`,
          progress: 33 * Object.keys(stats).indexOf(type) + Math.floor((processedCount / cats.length) * 33)
        });
        
        // Process the batch
        const batchResults = await processCategoryBatch(batch, providerId, type, blacklistedCategories);
        
        // Update stats
        stats[type].created += batchResults.created;
        stats[type].updated += batchResults.updated;
        stats[type].invalid += batchResults.invalid;
        stats[type].blacklisted += batchResults.blacklisted;
        
        processedCount += batch.length;
        
        await job.updateProgress({ 
          status: `Processed ${processedCount}/${cats.length} ${type} categories`,
          progress: 33 * Object.keys(stats).indexOf(type) + Math.floor((processedCount / cats.length) * 33)
        });
      }
    }

    // Process all types in parallel for better performance
    const syncPromises = [
      syncOne('Live TV', 'get_live_categories', stats),
      syncOne('VOD', 'get_vod_categories', stats),
      syncOne('Series', 'get_series_categories', stats)
    ];
    
    // Wait for all category types to be processed
    const syncResults = await Promise.allSettled(syncPromises);
    
    // Check for any rejections
    const failedSyncs = syncResults.filter(r => r.status === 'rejected');
    if (failedSyncs.length > 0) {
      console.error(`${failedSyncs.length} category types failed to sync`);
      // We continue anyway as some types might have succeeded
    }
    
    await job.updateProgress({ status: 'Completed', progress: 100 });
    
    const successCount = syncResults.filter(r => r.status === 'fulfilled').length;
    const totalCreated = Object.values(stats).reduce((sum, s) => sum + s.created, 0);
    const totalUpdated = Object.values(stats).reduce((sum, s) => sum + s.updated, 0);
    const totalInvalid = Object.values(stats).reduce((sum, s) => sum + s.invalid, 0);
    const totalBlacklisted = Object.values(stats).reduce((sum, s) => sum + s.blacklisted, 0);
    
    const result = { 
      success: successCount > 0,
      categories: stats,
      summary: {
        typesProcessed: successCount,
        typesFailed: failedSyncs.length,
        totalCreated,
        totalUpdated,
        totalInvalid,
        totalBlacklisted,
        totalProcessed: totalCreated + totalUpdated + totalInvalid + totalBlacklisted
      },
      completedAt: new Date().toISOString()
    };
    
    console.log(`✅ Job ${job.id} completed with result:`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Category sync worker error:', error);
    throw error; // This will mark the job as failed
  }
}, { 
  connection, 
  concurrency: 2, // Process at most 2 jobs at a time
  lockDuration: 30000, // 30 seconds lock to prevent duplicate processing
  lockRenewTime: 15000 // Renew lock every 15 seconds
});

// Handle worker events
categoryWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed with result:`, JSON.stringify({
    success: result.success,
    summary: result.summary
  }, null, 2));
});

categoryWorker.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed with error:`, error.message);
});

// Handle worker errors
categoryWorker.on('error', error => {
  console.error('Worker error:', error);
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await categoryWorker.close();
  console.log('Worker shut down successfully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await categoryWorker.close();
  console.log('Worker shut down successfully');
  process.exit(0);
});

module.exports = categoryWorker;
