const mongoose = require('mongoose');

const VodStreamSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
  num: Number,
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  year: String,
  stream_type: { type: String, default: 'movie' },
  stream_id: { type: Number, required: true, index: true },
  stream_icon: String,
  rating: { type: Number, default: 0 },
  rating_5based: { type: Number, default: 0 },
  added: String,
  category_id: { type: String, index: true },
  category_ids: [{ type: Number }],
  container_extension: String,
  custom_sid: String,
  direct_source: String,
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'HIDDEN'], default: 'ACTIVE', index: true },
  feature: { type: Boolean, default: false, index: true },
  flag: { type: Boolean, default: false },
  kinopoisk_url: String,
  tmdb_id: Number,
  o_name: String, // Original name
  cover_big: String,
  movie_image: String,
  release_date: String,
  episode_run_time: Number,
  youtube_trailer: String,
  director: String,
  actors: String,
  cast: String,
  description: String,
  plot: String,
  age: String,
  mpaa_rating: String,
  rating_count_kinopoisk: Number,
  country: String,
  genre: String,
  backdrop_path: [String],
  duration_secs: Number,
  duration: String,
  bitrate: Number,
  releasedate: String,
  subtitles: [Object]
}, { timestamps: true });
VodStreamSchema.index({ provider: 1, stream_id: 1 }, { unique: true });
VodStreamSchema.index({ tmdb_id: 1 }, { sparse: true });
VodStreamSchema.index({ flag: 1 });
module.exports = mongoose.model('VodStream', VodStreamSchema);