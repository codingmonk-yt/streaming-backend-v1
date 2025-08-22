const mongoose = require('mongoose');
const HeroSection = require('../models/HeroSection');

/**
 * Create a new hero section
 * @route POST /api/herosections
 * @access Private/Admin
 */
exports.createHeroscarousel = async (req, res) => {
  try {
    const { title, description, movie_id, active, sortOrder, backdropImage } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'Title and description are required' });
    }

    const payload = { title, description };

    if (backdropImage !== undefined && backdropImage !== null && backdropImage !== '') {
      payload.backdropImage = backdropImage;
    }

    if (movie_id !== undefined && movie_id !== null && movie_id !== '') {
      if (!mongoose.Types.ObjectId.isValid(movie_id)) {
        return res.status(400).json({ success: false, error: `Invalid movie id: ${movie_id}` });
      }
      payload.movie_id = movie_id;
    }

  if (active !== undefined) payload.active = active;
    if (sortOrder !== undefined) payload.sortOrder = sortOrder;

    const hero = new HeroSection(payload);
    const saved = await hero.save();

    return res.status(201).json({ success: true, data: saved, message: 'HeroSection created successfully' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, error: messages });
    }

    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Duplicate key error' });
    }

    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

/**
 * Get all hero sections
 * @route GET /api/herosections
 * @access Public
 */
exports.getHeroscarousels = async (req, res) => {
  try {
    const filter = {};
    if (req.query.active !== undefined) {
      filter.active = req.query.active === 'true';
    }

    const heroSections = await HeroSection.find(filter).sort({ sortOrder: 1 }).populate('movie_id');

    return res.status(200).json({ success: true, count: heroSections.length, data: heroSections });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

/**
 * Get a single hero section by id
 * @route GET /api/herosections/:id
 * @access Public
 */
exports.getHeroscarousel = async (req, res) => {
  try {
    const hero = await HeroSection.findById(req.params.id).populate('movie_id');
    if (!hero) {
      return res.status(404).json({ success: false, error: 'HeroSection not found' });
    }
    return res.status(200).json({ success: true, data: hero });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, error: 'HeroSection not found' });
    }
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

/**
 * Update a hero section
 * @route PUT /api/herosections/:id
 * @access Private/Admin
 */
exports.updateHeroscarousel = async (req, res) => {
  try {
  const { title, description, movie_id, active, sortOrder, backdropImage } = req.body;

    const updateFields = {};
  if (title !== undefined) updateFields.title = title;
  if (description !== undefined) updateFields.description = description;
  if (backdropImage !== undefined) updateFields.backdropImage = backdropImage;
    if (active !== undefined) updateFields.active = active;
    if (sortOrder !== undefined) updateFields.sortOrder = sortOrder;

    if (movie_id !== undefined) {
      if (movie_id !== null && movie_id !== '') {
        if (!mongoose.Types.ObjectId.isValid(movie_id)) {
          return res.status(400).json({ success: false, error: `Invalid movie id: ${movie_id}` });
        }
        updateFields.movie_id = movie_id;
      } else {
        // allow clearing the movie reference
        updateFields.movie_id = null;
      }
    }

    const hero = await HeroSection.findByIdAndUpdate(req.params.id, updateFields, { new: true, runValidators: true }).populate('movie_id');
    if (!hero) {
      return res.status(404).json({ success: false, error: 'HeroSection not found' });
    }

    return res.status(200).json({ success: true, data: hero, message: 'HeroSection updated successfully' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, error: messages });
    }
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, error: 'HeroSection not found' });
    }
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

/**
 * Delete a hero section
 * @route DELETE /api/herosections/:id
 * @access Private/Admin
 */
exports.deleteHeroscarousel = async (req, res) => {
  try {
    const hero = await HeroSection.findByIdAndDelete(req.params.id);
    if (!hero) {
      return res.status(404).json({ success: false, error: 'HeroSection not found' });
    }

    return res.status(200).json({ success: true, message: 'HeroSection deleted successfully' });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, error: 'HeroSection not found' });
    }

    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};
