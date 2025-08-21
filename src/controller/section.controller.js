const mongoose = require('mongoose');
const Section = require('../models/Section');

// Helper: validate category id as a numeric id (number or numeric string)
const isNumericId = (id) => {
  if (typeof id === 'number') return Number.isInteger(id);
  if (typeof id === 'string') return /^\d+$/.test(id);
  return false;
};

/**
 * Create a new section
 * @route POST /api/sections
 * @access Private/Admin
 */
exports.createSection = async (req, res) => {
  try {
    const { sectionId, title, description, contentType, sortOrder, backdropImage, active, selectedCategoryIds } = req.body;

    // Validate selectedCategoryIds if provided (accept numeric ids)
    let validatedCategoryIds = [];
    if (selectedCategoryIds !== undefined) {
      if (!Array.isArray(selectedCategoryIds)) {
        return res.status(400).json({ success: false, error: 'selectedCategoryIds must be an array of category IDs' });
      }

      for (const id of selectedCategoryIds) {
        if (!isNumericId(id)) {
          return res.status(400).json({ success: false, error: `Invalid category id: ${id}` });
        }
        // coerce numeric string to Number
        validatedCategoryIds.push(Number(id));
      }
    }

    // Create new section
    const section = new Section({
      sectionId,
      title,
      description,
      contentType,
      sortOrder,
      backdropImage,
      active,
      selectedCategoryIds: validatedCategoryIds
    });

    const savedSection = await section.save();
    
    res.status(201).json({
      success: true,
      data: savedSection,
      message: 'Section created successfully'
    });
  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        error: messages
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Section with this ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

/**
 * Get all sections
 * @route GET /api/sections
 * @access Public
 */
exports.getSections = async (req, res) => {
  try {
    // Optional filtering by content type
    const filter = {};
    if (req.query.contentType) {
      filter.contentType = req.query.contentType;
    }
    
    // Optional filtering by active status
    if (req.query.active !== undefined) {
      filter.active = req.query.active === 'true';
    }

    const sections = await Section.find(filter).sort({ sortOrder: 1 });
    
    res.status(200).json({
      success: true,
      count: sections.length,
      data: sections
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};
/**
 * Update section
 * @route PUT /api/sections/:id
 * @access Private/Admin
 */
exports.updateSection = async (req, res) => {
  try {
    const { sectionId, title, description, contentType, sortOrder, backdropImage, active, selectedCategoryIds } = req.body;
    
    // Build update object with only provided fields
    const updateFields = {};
    if (sectionId !== undefined) updateFields.sectionId = sectionId;
    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (contentType !== undefined) updateFields.contentType = contentType;
    if (sortOrder !== undefined) updateFields.sortOrder = sortOrder;
    if (backdropImage !== undefined) updateFields.backdropImage = backdropImage;
    if (active !== undefined) updateFields.active = active;
    // Handle selectedCategoryIds update (replace entire array)
    if (selectedCategoryIds !== undefined) {
      if (!Array.isArray(selectedCategoryIds)) {
        return res.status(400).json({ success: false, error: 'selectedCategoryIds must be an array of category IDs' });
      }

      const validatedCategoryIds = [];
      for (const id of selectedCategoryIds) {
        if (!isNumericId(id)) {
          return res.status(400).json({ success: false, error: `Invalid category id: ${id}` });
        }
        validatedCategoryIds.push(Number(id));
      }

      updateFields.selectedCategoryIds = validatedCategoryIds;
    }
    
    // Find and update section
    const section = await Section.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );
    
    if (!section) {
      return res.status(404).json({
        success: false,
        error: 'Section not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: section,
      message: 'Section updated successfully'
    });
  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        error: messages
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Section with this ID already exists'
      });
    }
    
    // Handle invalid ObjectId
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        error: 'Section not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

/**
 * Delete section
 * @route DELETE /api/sections/:id
 * @access Private/Admin
 */
exports.deleteSection = async (req, res) => {
  try {
    const section = await Section.findByIdAndDelete(req.params.id);
    
    if (!section) {
      return res.status(404).json({
        success: false,
        error: 'Section not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Section deleted successfully'
    });
  } catch (error) {
    // Handle invalid ObjectId
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        error: 'Section not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

/**
 * Remove one or more category IDs from selectedCategoryIds
 * @route PATCH /api/sections/:id/categories/remove
 * @access Private/Admin
 */
exports.removeSelectedCategoryIds = async (req, res) => {
  try {
    const { categoryIds } = req.body;

    if (!categoryIds || !Array.isArray(categoryIds)) {
      return res.status(400).json({ success: false, error: 'categoryIds must be an array of category IDs to remove' });
    }

    const validatedIds = [];
    for (const id of categoryIds) {
      if (!isNumericId(id)) {
        return res.status(400).json({ success: false, error: `Invalid category id: ${id}` });
      }
      validatedIds.push(Number(id));
    }

    // Pull all provided ids from selectedCategoryIds
    const section = await Section.findByIdAndUpdate(
      req.params.id,
      { $pullAll: { selectedCategoryIds: validatedIds } },
      { new: true }
    );

    if (!section) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    return res.status(200).json({ success: true, data: section, message: 'Category IDs removed from section' });
  } catch (error) {
    // Handle invalid ObjectId (section id)
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    console.error('Error removing category ids:', error);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

