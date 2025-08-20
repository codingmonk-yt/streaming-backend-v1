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
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true }
}, { timestamps: true });

VodStreamSchema.index({ provider: 1, stream_id: 1 }, { unique: true });

module.exports = mongoose.model('VodStream', VodStreamSchema);
