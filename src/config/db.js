// src/config/db.js
// Handles MongoDB connection with reconnection logic.

const mongoose = require("mongoose");
const { MONGO_URI, NODE_ENV } = require("./env");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI, {
      // These options are defaults in Mongoose 8 but kept for clarity
    });

    console.log(`✅  MongoDB connected: ${conn.connection.host}`);

    // Log slow queries in development
    if (NODE_ENV === "development") {
      mongoose.set("debug", false); // Set to true to log all queries
    }
  } catch (error) {
    console.error(`❌  MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️   MongoDB disconnected. Attempting to reconnect...");
});

mongoose.connection.on("reconnected", () => {
  console.log("✅  MongoDB reconnected.");
});

module.exports = connectDB;
