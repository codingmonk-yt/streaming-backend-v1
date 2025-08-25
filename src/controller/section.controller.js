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
    console.log('Starting createSection with request body:', JSON.stringify(req.body, null, 2));
    const { sectionId, title, description, contentType, sortOrder, backdropImage, active, selectedCategoryIds } = req.body;
    
    console.log('Destructured values:');
    console.log('- sectionId:', sectionId);
    console.log('- title:', title);
    console.log('- description:', description?.substring(0, 30) + (description?.length > 30 ? '...' : ''));
    console.log('- contentType:', contentType);
    console.log('- sortOrder:', sortOrder);
    console.log('- backdropImage:', backdropImage?.substring(0, 30) + (backdropImage?.length > 30 ? '...' : ''));
    console.log('- active:', active);
    console.log('- selectedCategoryIds:', selectedCategoryIds);
    
    // Validate selectedCategoryIds if provided (accept numeric ids)
    let validatedCategoryIds = [];
    if (selectedCategoryIds !== undefined) {
      console.log('Validating selectedCategoryIds');
      if (!Array.isArray(selectedCategoryIds)) {
        console.log('ERROR: selectedCategoryIds is not an array, it is:', typeof selectedCategoryIds);
        return res.status(400).json({ success: false, error: 'selectedCategoryIds must be an array of category IDs' });
      }

      for (const id of selectedCategoryIds) {
        console.log('Validating category ID:', id, 'type:', typeof id);
        if (!isNumericId(id)) {
          console.log('ERROR: Invalid category id:', id);
          return res.status(400).json({ success: false, error: `Invalid category id: ${id}` });
        }
        // coerce numeric string to Number
        validatedCategoryIds.push(Number(id));
      }
      console.log('Validated category IDs:', validatedCategoryIds);
    }

    // Create new section
    console.log('Creating new section with validated data');
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
    
    console.log('Section model created, about to save:', {
      sectionId: section.sectionId,
      title: section.title,
      contentType: section.contentType,
      sortOrder: section.sortOrder
    });
    
    try {
      const savedSection = await section.save();
      console.log('Section saved successfully with ID:', savedSection._id);
      
      res.status(201).json({
        success: true,
        data: savedSection,
        message: 'Section created successfully'
      });
    } catch (saveError) {
      console.error('Error saving section:', saveError.message);
      console.error('Error name:', saveError.name);
      console.error('Error code:', saveError.code);
      if (saveError.keyValue) {
        console.error('Duplicate key values:', JSON.stringify(saveError.keyValue));
      }
      throw saveError; // Re-throw to be caught by the outer catch
    }
  } catch (error) {
    console.error('Top-level error in createSection:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      console.error('Validation error detected');
      const messages = Object.values(error.errors).map(val => val.message);
      console.error('Validation error messages:', messages);
      return res.status(400).json({
        success: false,
        error: messages
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      console.error('Duplicate key error detected:', error.message);
      console.error('Duplicate key details:', error.keyValue ? JSON.stringify(error.keyValue) : 'No keyValue available');
      
      // Extract what information we can from the error
      const keyValue = error.keyValue || {};
      const errorMsg = `A section with ID '${keyValue.sectionId || ''}' and content type '${keyValue.contentType || ''}' already exists`;
      console.error('Sending error response:', errorMsg);
      
      return res.status(400).json({
        success: false,
        error: errorMsg
      });
    }
    
    // Log any other unexpected errors
    console.error('Unhandled error in createSection:', error);
    
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

