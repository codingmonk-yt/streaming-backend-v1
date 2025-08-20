const mongoose = require('mongoose');

const LiveStreamSchema = new mongoose.Schema({
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
  num: Number,
  name: String,
  stream_type: String,
  stream_id: { type: Number, required: true, index: true },
  stream_icon: String,
  epg_channel_id: String,
  added: String,
  custom_sid: String,
  tv_archive: Number,
  direct_source: String,
  tv_archive_duration: Number,
  category_id: String,
  category_ids: [Number],
  thumbnail: String,
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true }
}, { timestamps: true });

LiveStreamSchema.index({ provider: 1, stream_id: 1 }, { unique: true });

module.exports = mongoose.model('LiveStream', LiveStreamSchema);
