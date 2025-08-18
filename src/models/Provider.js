const mongoose = require('mongoose');

const STATUS = ['Active', 'Inactive', 'Suspended'];

const providerSchema = new mongoose.Schema(
  {
    // owner as string: supports either 'super-admin' or user._id string
    owner: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    apiEndpoint: { type: String, required: true, trim: true },
    maxConcurrentUsers: { type: Number, required: true, min: 1 },
    dns: { type: String, required: true, trim: true },
    status: { type: String, enum: STATUS, default: 'Active', index: true },
    expiryHours: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

// Ensure names are unique per owner
providerSchema.index({ owner: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Provider', providerSchema);
module.exports.PROVIDER_STATUS = STATUS;
