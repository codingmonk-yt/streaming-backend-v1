const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    category_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\d{4}$/, // Ensures 4-digit numeric format
    },
    category_name: {
      type: String,
      required: true,
      trim: true,
    },
    parent_id: {
      type: String,
      default: null,
      trim: true,
      validate: {
        validator: function(v) {
          return v === null || /^\d{1}$/.test(v);
        },
        message: 'parent_id must be exactly 1 digits or null'
      }
    },
    provider: {
      type: String,
      required: true,
      trim: true,
    },
    category_type: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// Indexes for better performance
CategorySchema.index({ provider: 1, category_type: 1 });
CategorySchema.index({ parent_id: 1 });
CategorySchema.index({ category_id: 1 }, { unique: true });

module.exports = mongoose.model('Category', CategorySchema);
