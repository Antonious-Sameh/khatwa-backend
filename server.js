// server.js
// Entry point — loads env, connects DB, starts HTTP server.

require('dotenv').config();

const { validateEnv, PORT } = require('./src/config/env');
const connectDB              = require('./src/config/db');
const app                    = require('./src/app');

// Validate environment variables before anything else
validateEnv();

// Graceful shutdown handler
const shutdown = (server) => {
  process.on('SIGTERM', () => {
    console.log('\n⚠️  SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      console.log('✅  HTTP server closed.');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('\n⚠️  SIGINT received. Shutting down gracefully...');
    server.close(() => {
      console.log('✅  HTTP server closed.');
      process.exit(0);
    });
  });
};

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌  Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start
const start = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`\n🚀  Khatwa Plus API running on port ${PORT}`);
    console.log(`📍  http://localhost:${PORT}/api/health\n`);
  });

  shutdown(server);
};

start();