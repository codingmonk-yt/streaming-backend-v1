const mongoose = require('mongoose');

const heroSectionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    backdropImage: {
      type: String,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true, // keep inline index
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true, // add index only here (no schema.index() call needed)
    },
    movie_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VodStream',
      required: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);


const HeroSection = mongoose.model('HeroSection', heroSectionSchema);

module.exports = HeroSection;
