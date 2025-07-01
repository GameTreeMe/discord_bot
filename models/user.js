// src/models/User.js
// ------------------
// Mongoose schema for GameTree “users” collection
// Matches the shape of the document you provided.

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// XP sub‐document
const xpSchema = new Schema({
  points: { type: Number, default: 0 },
  level:  { type: Number, default: 0 }
}, { _id: false });

// profile sub‐document
const profileSchema = new Schema({
  languages:          [String],
  emailVerified:      Boolean,
  xp:                 xpSchema,
  customAchievements: [Schema.Types.Mixed],
  birthday:           Date,
  gender:             String,
  timezone:           String,
  aboutMe:            String
}, { _id: false });

// location sub‐document (GeoJSON Point + extras)
const locationSchema = new Schema({
  type:        { type: String },      // should be 'Point'
  coordinates: [Number],              // [lng, lat]
  distance:    Schema.Types.Mixed,
  city:        String,
  country:     String,
  state:       String,
  name:        String,
  code:        String
}, { _id: false });

// services → ip, OAuth IDs, device info
const googleSchema = new Schema({ id: String }, { _id: false });
const deviceInfoSchema = new Schema({
  carrier:     String,
  systemName:  String,
  systemVersion:String,
  uniqueId:    String,
  userAgent:   String,
  webAgent:    String
}, { _id: false });
const servicesSchema = new Schema({
  ip:         String,
  google:     googleSchema,
  deviceInfo: deviceInfoSchema
}, { _id: false });

// avatar & gallery
const avatarGallerySchema = new Schema({
  images: [String]
}, { _id: false });
const avatarSchema = new Schema({
  secure:  String,
  gallery: avatarGallerySchema
}, { _id: false });

// cover image
const coverImgSchema = new Schema({
  secure: String
}, { _id: false });

// user settings
const settingsSchema = new Schema({
  language:                  String,
  ages:                      [Number],
  searchDistance:            Number,
  matchesEnabled:            Boolean,
  personalityTypesMatchFilter:[String],
  lastOnline:                String,
  emailPreferences:          Boolean,
  hidePosts:                 [Schema.Types.Mixed],
  hidePostsByUser:           [Schema.Types.Mixed],
  hidePostsByGame:           [Schema.Types.Mixed],
  buildNumber:               String,
  gameMatchFilter:           Schema.Types.ObjectId,
  gameTitleMatchFilter:      String,
  searchLocation:            Schema.Types.Mixed
}, { _id: false });

// main user schema
const userSchema = new Schema({
  // Fields you use in commands (keep as is):
  email: String,
  platforms: [String],
  genres: [String],
  profile: profileSchema,
  location: locationSchema,
  gameIds: [Schema.Types.ObjectId],
  userIds: [Schema.Types.ObjectId],
  settings: settingsSchema,
  avatar: avatarSchema,
  personalityProfile: {
    personality: String
  },
  discordId: String,
  discordUsername: String,
  discordDisplayName: String,
  lfgInviteOptIn: { type: Boolean, default: true },
  membershipRole: Schema.Types.Mixed,
  // All other fields are not used in commands, so make them Mixed for resilience
  status: Schema.Types.Mixed,
  on_timed_mute: Schema.Types.Mixed,
  user_deactivated_own_account: Schema.Types.Mixed,
  bookmarkedGames: [Schema.Types.Mixed],
  bookmarks: [Schema.Types.Mixed],
  removedRecoms: [Schema.Types.Mixed],
  removedIds: [Schema.Types.Mixed],
  blacklist: [Schema.Types.Mixed],
  removedBy: [Schema.Types.Mixed],
  skippedMatches: [Schema.Types.Mixed],
  pendingMatches: [Schema.Types.Mixed],
  services: Schema.Types.Mixed,
  banned: Schema.Types.Mixed,
  dailySignInStreak: Schema.Types.Mixed,
  lastSignIn: Schema.Types.Mixed,
  systemRoles: [Schema.Types.Mixed],
  personalityProgress: Schema.Types.Mixed,
  dnaProgress: Schema.Types.Mixed,
  valueProgress: Schema.Types.Mixed,
  newMessages: Schema.Types.Mixed,
  newNotifications: Schema.Types.Mixed,
  attendanceRate: Schema.Types.Mixed,
  newMatching: Schema.Types.Mixed,
  legacy_userIds: [Schema.Types.Mixed],
  lastActiveAt: Schema.Types.Mixed,
  skills: [Schema.Types.Mixed],
  gameSkills: [Schema.Types.Mixed],
  gameRatingDetails: [Schema.Types.Mixed],
  gameRatings: [Schema.Types.Mixed],
  syncedGameDetails: [Schema.Types.Mixed],
  syncedGames: [Schema.Types.Mixed],
  skippedRecoms: [Schema.Types.Mixed],
  coverImg: Schema.Types.Mixed,
  devices: [Schema.Types.Mixed],
  createdAt: Schema.Types.Mixed,
  lastModified: Schema.Types.Mixed,
  socialNetworks: [Schema.Types.Mixed],
  rewards: [Schema.Types.Mixed],
  userGames: [Schema.Types.Mixed],
  oldActiveAt: Schema.Types.Mixed,
  username:                      { type: String, required: true, unique: true },
}, {
  collection: 'users',
  timestamps: false,
  strict: false // allow extra fields in DB
});

userSchema.index({ discordUsername: 1 });
userSchema.index({ discordDisplayName: 1 });
userSchema.index({ discordId: 1 });

module.exports.User = model('User', userSchema);