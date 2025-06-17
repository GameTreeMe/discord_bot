const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const websiteSchema = new Schema({
  url: String,
  category: String,
  trusted: Boolean
}, { _id: false });

const screenshotSchema = new Schema({
  id: Number,
  game: Number,
  height: Number,
  image_id: String,
  url: String,
  width: Number
}, { _id: false });

const vggRatingSchema = new Schema({
  max_score: Number,
  users: Number,
  avg_score: Number
}, { _id: false });

const externalGameSchema = new Schema({
  year: Number,
  category: String,
  url: String,
  uid: String
}, { _id: false });

const gameSchema = new Schema({
  alternative_names: [String],
  game_collection: [String], // Renamed from 'collection' to 'game_collection'
  cover: Number,
  developers: [String],
  features: [String],
  first_release_date: Number,
  game_modes: [String],
  genres: [String],
  igdbId: Number,
  platforms: [String],
  player_perspectives: [String],
  popularity: Number,
  publishers: [String],
  rating: Number,
  rating_count: Number,
  slug: String,
  source: String,
  description: String,
  themes: [String],
  title: String,
  total_rating: Number,
  total_rating_count: Number,
  websites: [websiteSchema],
  yearpublished: Number,
  incrementId: Number,
  isExpansion: Boolean,
  category: Number,
  updatedAt: Date,
  weburl: String,
  avg_rating: Number,
  vgg_name: String,
  screenshots: [screenshotSchema],
  vgg_id: Number,
  release_dates: [Number],
  parent_game: Number,
  external_games: [externalGameSchema],
  vgg_rating: vggRatingSchema,
  igdbUrl: String,
  boardgamesubdomain: [String],
  skills: [String],
  lowercase_title: String,
  bundles: [Number],
  checksum: String,
  follows: Number,
  game_engines: [String],
  multiplayer_modes: [Number],
  collections: [Number],
  isDeleted: Boolean
}, {
  collection: 'games',
  timestamps: false
});

module.exports.Game = model('Game', gameSchema);
