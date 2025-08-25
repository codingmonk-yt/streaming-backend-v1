const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
  sectionId: {
    type: String,
    required: [true, 'Section ID is required'],
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9-_]+$/, 'Section ID can only contain lowercase letters, numbers, hyphens, and underscores']
  },
  
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  contentType: {
    type: String,
    required: [true, 'Content type is required'],
    enum: {
      values: ['Live TV', 'Movies', 'Series'],
      message: '{VALUE} is not a valid content type'
    },
    default: 'Live TV'
  },
  
  sortOrder: {
    type: Number,
    required: [true, 'Sort order is required'],
    min: [0, 'Sort order must be a positive number'],
    default: 0
  },
  
  backdropImage: {
    type: String,
    trim: true
  },
  
  active: {
    type: Boolean,
    default: true
  }
  ,
  // Array of selected category IDs associated with this section
  selectedCategoryIds: {
    // store category ids as strings
    type: [String],
    default: []
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound index for uniqueness on sectionId+contentType combination
// This allows sections with same sectionId but different contentType
sectionSchema.index({ sectionId: 1, contentType: 1 }, { unique: true });

// Index for better performance when sorting
sectionSchema.index({ sortOrder: 1 });

// Auto-generate sectionId from title if not provided
sectionSchema.pre('save', function(next) {
  if (!this.sectionId && this.title) {
    this.sectionId = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  }
  next();
});

// Export the model
const Section = mongoose.model('Section', sectionSchema);

module.exports = Section;