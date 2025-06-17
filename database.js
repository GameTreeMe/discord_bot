// src/database.js
// -----------------
// Central MongoDB connector using Mongoose.

require('dotenv').config();        // 1. Load .env into process.env
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not defined in .env');
  process.exit(1);
}

/**
 * connectDB()
 *  - Attempts to connect to MongoDB using MONGO_URI
 *  - Logs success or throws and exits on failure
 */
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
      // these options are defaults in Mongoose 6+, but you can add them if you like:
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

module.exports = { connectDB };