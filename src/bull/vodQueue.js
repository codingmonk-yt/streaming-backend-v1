const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

const vodQueue = new Queue("vod-sync", { connection });
module.exports = { vodQueue };
