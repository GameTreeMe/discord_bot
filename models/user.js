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
  email:                         String,
  status:                        String,
  on_timed_mute:                 Boolean,
  user_deactivated_own_account:  Boolean,
  platforms:                     [String],
  genres:                        [String],
  profile:                       profileSchema,
  location:                      locationSchema,
  gameIds:                       [Schema.Types.ObjectId],
  bookmarkedGames:               [Schema.Types.Mixed],
  bookmarks:                     [Schema.Types.Mixed],
  removedRecoms:                 [Schema.Types.Mixed],
  userIds:                       [Schema.Types.ObjectId],
  removedIds:                    [Schema.Types.Mixed],
  blacklist:                     [Schema.Types.Mixed],
  removedBy:                     [Schema.Types.Mixed],
  skippedMatches:                [Schema.Types.ObjectId],
  pendingMatches:                [Schema.Types.Mixed],
  services:                      servicesSchema,
  banned:                        Boolean,
  dailySignInStreak:             Number,
  lastSignIn:                    Date,
  systemRoles:                   [String],
  personalityProgress:           Number,
  dnaProgress:                   Number,
  valueProgress:                 Number,
  newMessages:                   Number,
  newNotifications:              Number,
  attendanceRate:                Number,
  newMatching:                   Boolean,
  legacy_userIds:                [Schema.Types.ObjectId],
  lastActiveAt:                  Date,
  settings:                      settingsSchema,
  skills:                        [Schema.Types.Mixed],
  gameSkills:                    [Schema.Types.Mixed],
  gameRatingDetails:             [Schema.Types.Mixed],
  gameRatings:                   [Schema.Types.Mixed],
  syncedGameDetails:             [Schema.Types.Mixed],
  syncedGames:                   [Schema.Types.Mixed],
  skippedRecoms:                 [Schema.Types.Mixed],
  avatar:                        avatarSchema,
  coverImg:                      coverImgSchema,
  devices: [{
    token: String,
    os:    String
  }],
  membershipRole:                [String],
  createdAt:                     Date,
  lastModified:                  Date,
  socialNetworks:                [Schema.Types.Mixed],
  rewards:                       [Schema.Types.Mixed],
  userGames:                     [Schema.Types.Mixed],
  oldActiveAt:                   Date,
  username:                      { type: String, required: true, unique: true },
  personalityProfile: {
    personality: String
  },
  watchedByteIds:                [Schema.Types.Mixed]
}, {
  collection: 'users',
  timestamps: false
});

module.exports.User = model('User', userSchema);