const ExcludeLiveCategories = ["81"];
const ExcludeVodCategories = ["35"];
const ExcludeSeriesCategories = ["169"];

// Helper function to normalize category IDs by removing leading zeros
const normalizeCategory = (categoryId) => {
  if (!categoryId) return '';
  return String(categoryId).replace(/^0+/, ''); // Remove leading zeros
};

module.exports = { 
  ExcludeLiveCategories, 
  ExcludeVodCategories, 
  ExcludeSeriesCategories,
  normalizeCategory 
};