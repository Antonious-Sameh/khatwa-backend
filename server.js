// server.js
// Entry point — works in both modes:
//   1. Traditional server: node server.js
//   2. Vercel serverless: exports app as handler

require('dotenv').config();

const { validateEnv, PORT } = require('./src/config/env');
const connectDB              = require('./src/config/db');
const app                    = require('./src/app');

// Validate environment variables
validateEnv();

// ── Serverless mode (Vercel) ──────────────────────────────────────────────────
// Vercel imports this file and calls the exported function per request.
// We connect to DB before handling the request.
if (process.env.VERCEL || process.env.VERCEL_ENV) {
  // Wrap app to ensure DB is connected before each invocation
  module.exports = async (req, res) => {
    await connectDB();
    return app(req, res);
  };
}
// ── Traditional server mode (Railway, Render, local) ─────────────────────────
else {
  const shutdown = (server) => {
    const graceful = (signal) => {
      console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);
      server.close(() => {
        console.log('✅  HTTP server closed.');
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => graceful('SIGTERM'));
    process.on('SIGINT',  () => graceful('SIGINT'));
  };

  process.on('unhandledRejection', (reason) => {
    console.error('❌  Unhandled Rejection:', reason);
    process.exit(1);
  });

  const start = async () => {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`\n🚀  Khatwa API running on port ${PORT}`);
      console.log(`📍  http://localhost:${PORT}/api/health\n`);
    });
    shutdown(server);
  };

  start();
}