// src/config/db.js
// MongoDB connection — optimized for both traditional server AND serverless (Vercel).
// In serverless: reuses existing connection across invocations via module-level cache.

const mongoose = require('mongoose');
const { MONGO_URI, NODE_ENV } = require('./env');

// ── Connection cache (survives across serverless warm invocations) ─────────────
let cachedConnection = null;

const connectDB = async () => {
  // Return existing connection if already established
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  try {
    const conn = await mongoose.connect(MONGO_URI, {
      // Optimized for serverless: smaller connection pool
      maxPoolSize:     10,
      minPoolSize:     2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 10000,
      // Keep alive to prevent Atlas from closing idle connections
      heartbeatFrequencyMS: 10000,
    });

    cachedConnection = conn;
    console.log(`✅  MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌  MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

// Handle connection events (only relevant for long-running server, ignored in serverless)
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️   MongoDB disconnected.');
  cachedConnection = null;
});

mongoose.connection.on('reconnected', () => {
  console.log('✅  MongoDB reconnected.');
});

module.exports = connectDB;