const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.URL;
  if (!uri) {
    console.error('URL is not set');
    process.exit(1);
  }
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB runtime error:', err.message);
  });
}

module.exports = connectDB;
