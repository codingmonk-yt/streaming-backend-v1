// bull/syncQueue.js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL);

const syncQueue = new Queue("category-sync", {
  connection,
});

module.exports = { syncQueue };
