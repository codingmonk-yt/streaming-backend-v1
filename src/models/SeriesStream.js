const mongoose = require('mongoose');

const SeriesStreamSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
  num: Number,
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  year: String,
  stream_type: { type: String, default: 'series' },
  series_id: { type: Number, required: true, index: true },
  cover: String,
  plot: String,
  cast: String,
  director: String,
  genre: String,
  release_date: String,
  releaseDate: String,
  last_modified: String,
  rating: String,
  rating_5based: Number,
  backdrop_path: [String],
  youtube_trailer: String,
  episode_run_time: String,
  category_id: { type: String, index: true },
  category_ids: [Number],
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true }
}, { timestamps: true });

SeriesStreamSchema.index({ provider: 1, series_id: 1 }, { unique: true });

module.exports = mongoose.model('SeriesStream', SeriesStreamSchema);
