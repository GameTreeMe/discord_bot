// src/models/session.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// Participant subdocument
const participantSchema = new Schema({
  discordId:      { type: String, required: true }, // Discord user ID
  discordUsername:{ type: String },                 // e.g. "praty#1234"
  GTUserId:       { type: String }                  // GameTree user id (optional)
}, { _id: false });

// Main session schema
const sessionSchema = new Schema({
  // Remove required/unique from sessionId, let it default to _id string
  sessionId:      { type: String }, // Will be set to _id as string after save
  creatorDiscordId:   { type: String, required: true },
  creatorUsername:    { type: String },
  creatorGTUserId:    { type: String },
  gameId:             { type: String, required: true },
  gameName:           { type: String, required: true },
  platform:           { type: String, required: true },
  description:        { type: String, maxlength: 250 },
  maxPlayers:         { type: Number, default: 2, min: 2 },
  participants:       { type: [participantSchema], default: [] },
  createdAt:          { type: Date,    default: Date.now },
  updatedAt:          { type: Date,    default: Date.now },
  voiceChannelId:     { type: String },
  textChannelId:      { type: String },
  lfgMessageIds:      { type: [String], default: [] }, // Array of Discord message IDs
  lfgChannelIds:      { type: [String], default: [] }, // Array of Discord channel IDs (where posts were made)
  status:             { type: String, enum: ['open','full','closing','closed'], default: 'open' },
  lastActivityAt:     { type: Date, default: Date.now },
  callEndedAt:        { type: Date },
  acceptances:        { type: [String], default: [] }, // Discord IDs of users who clicked "Join"
  rejectedUsers:      { type: [String], default: [] }, // Discord IDs of users who were denied (optional)
}, {
  collection: 'sessions'
});

// Update updatedAt on save
sessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// In your sessionSchema, after fields:
sessionSchema.index({ sessionId: 1 }, { unique: true });
sessionSchema.index({ creatorDiscordId: 1 });
sessionSchema.index({ status: 1 });
sessionSchema.index({ gameId: 1 });
sessionSchema.index({ voiceChannelId: 1 });
// Optional TTL (auto-delete after 24h): change 86400 to your desired seconds
// sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports.Session = model('Session', sessionSchema);