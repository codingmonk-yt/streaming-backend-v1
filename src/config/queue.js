const { Queue, Worker } = require('bullmq');

// Redis connection options
const connection = {
  host: 'shuttle.proxy.rlwy.net',
  port: 22047,
  username: 'default',
  password: 'DjzYqJDsPDLymaQSYjdSBxuefiIMbtvX',
  tls: true // Enable if your Redis connection requires TLS/SSL
};

// Create a queue for category synchronization
const categoryQueue = new Queue('category-sync', { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100, // Keep only the latest 100 completed jobs
    removeOnFail: 200      // Keep only the latest 200 failed jobs
  }
});

module.exports = {
  categoryQueue,
  connection
};
