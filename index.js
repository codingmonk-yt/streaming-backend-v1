require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./src/config/db');

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/secure', require('./src/routes/secure.routes'));
app.use('/api/providers', require('./src/routes/providers.routes'));
// Add this line with your other route imports
app.use('/api/categories', require('./src/routes/category.routes'));

// Health
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Boot
const PORT = process.env.PORT;

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on :${PORT}`);
  });
})();
