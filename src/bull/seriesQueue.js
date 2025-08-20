const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

const seriesQueue = new Queue("series-sync", { connection });
module.exports = { seriesQueue };
