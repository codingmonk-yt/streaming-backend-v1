const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const connection = new IORedis(process.env.REDIS_URL);

const liveQueue = new Queue("live-sync", { connection });
module.exports = { liveQueue };
