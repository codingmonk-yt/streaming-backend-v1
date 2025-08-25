const HeroSection = require('../models/HeroCarousel');
const Provider = require('../models/Provider');
const VodStream = require('../models/VodStream');
const LiveStream = require('../models/LiveStream');
const Section = require('../models/Section');
const Category = require('../models/Category');
const mongoose = require('mongoose');
const axios = require('axios');

async function getProcessedHeroCarousel(req, res) {
  try {
    // 1. Get all active hero carousel items
    const heroSections = await HeroSection.find({ active: true })
      .sort({ sortOrder: 1 })
      .populate('movie_id');

    if (!heroSections.length) {
      return res.status(200).json({ 
        success: true, 
        data: [] 
      });
    }

    // Response array for items with flag=true
    const responseArray = [];
    
    // Group items with flag=false by provider
    const providerGroups = new Map();

    // Process each hero carousel item
    for (const item of heroSections) {
      // Skip items without movie_id
      if (!item.movie_id) continue;

      // If flag is true, add directly to response array
      if (item.movie_id.flag === true) {
        responseArray.push(item);
      } else {
        // Group by provider
        const providerId = item.movie_id.provider.toString();
        if (!providerGroups.has(providerId)) {
          providerGroups.set(providerId, []);
        }
        providerGroups.get(providerId).push(item);
      }
    }
    console.log(`Items with flag=false: ${providerGroups.size}`);
    console.log(`Items with flag=true: ${responseArray.length}`);
    // If we have items with flag=false, process them by provider
    if (providerGroups.size > 0) {
      // Create an array of promises for each provider group
      const providerPromises = Array.from(providerGroups.entries()).map(
        async ([providerId, items]) => {
          try {
            // Get provider details
            const provider = await Provider.findById(providerId);
            if (!provider || provider.status !== 'Active') {
              console.warn(`Provider ${providerId} not found or not active`);
              return [];
            }

            console.log(`Processing provider: ${provider.name}  (${providerId})`);
            console.log(`API Endpoint: ${provider.apiEndpoint}`);
            
            // Declare username and password in the outer scope
            let username, password;
            
            // Get authentication credentials from provider endpoint
            // Changed from GET to POST request since API returns 405 (Method Not Allowed)
            try {
              const authResponse = await axios.post(provider.apiEndpoint,{});
              console.log('Auth response status:', authResponse.status);
              
              // Assign values to the variables in outer scope
              username = authResponse.data.username;
              password = authResponse.data.password;

              if (!username || !password) {
                console.warn(`Invalid auth response from provider ${provider.name}: missing credentials`);
                console.log('Auth response data:', JSON.stringify(authResponse.data));
                return [];
              }
              
              console.log(`Successfully obtained credentials for provider: ${provider.name}`);
            } catch (authError) {
              console.error(`Authentication error for provider ${provider.name}:`, authError.message);
              if (authError.response) {
                console.error(`Status: ${authError.response.status}, Data:`, authError.response.data);
              }
              return [];
            }

            // Process each item in this provider group
            const itemPromises = items.map(async (item) => {
              try {
                const streamId = item.movie_id.stream_id;
                console.log(`Fetching VOD details for stream ${streamId} from provider ${provider.name}`);
                // 
                // Fetch VOD details using provider DNS and credentials
                // Construct the correct URL based on provider API structure
                const vodUrl = `${provider.dns}/player_api.php?username=${username}&password=${password}&action=get_vod_info&vod_id=${streamId}`;
                console.log(`VOD URL: ${vodUrl} (streamId: ${streamId})`);
                
                try {
                  const vodResponse = await axios.get(vodUrl, {
                    params: { 
                      username, 
                      password,
                      action: 'get_vod_info',
                      vod_id: streamId
                    }
                  });
                  
                  console.log(`VOD response status for stream ${streamId}: ${JSON.stringify(vodResponse.data.info)}`);
                  
                  if (!vodResponse.data) {
                    console.warn(`No data returned for stream ${streamId}`);
                    return null;
                  }
                  
                  console.log(`Successfully fetched VOD details for stream ${streamId}`);
                  
                  // Update movie document with fetched data and set flag to true
                  await VodStream.findByIdAndUpdate(
                    item.movie_id._id,
                    { 
                      ...vodResponse.data.info, 
                      flag: true 
                    },
                    { new: true }
                  );

                  // Update the item's movie_id with flag=true and return
                  item.movie_id.flag = true;
                  return item;
                } catch (vodError) {
                  console.error(`Error fetching VOD details for stream ${streamId}:`, vodError.message);
                  if (vodError.response) {
                    console.error(`Status: ${vodError.response.status}, Data:`, vodError.response.data);
                  }
                  return null;
                }
              } catch (error) {
                console.error(`Error processing item ${item._id} for provider ${providerId}:`, error.message);
                return null;
              }
            });

            // Wait for all items in this provider group to be processed
            const processedItems = await Promise.all(itemPromises);
            return processedItems.filter(Boolean); // Remove null items
          } catch (error) {
            console.error(`Error processing provider ${providerId}:`, error.message);
            return [];
          }
        }
      );

      // Wait for all provider groups to be processed
      const processedProviderResults = await Promise.all(providerPromises);
      
      // Add all processed items to the response array
      for (const providerItems of processedProviderResults) {
        responseArray.push(...providerItems);
      }
    }

    // 6. Return the final response array
    return res.status(200).json({
      success: true,
      count: responseArray.length,
      data: responseArray
    });
  } catch (error) {
    console.error('Error in getProcessedHeroCarousel:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
}
async function getMovieById(req, res) {
  try {
    const { id } = req.params;

    // Check if ID is valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid movie ID format'
      });
    }

    // Find the movie by ID
    const movie = await VodStream.findById(id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        error: 'Movie not found'
      });
    }

    let updatedMovie = movie;
    
    // If flag is false, we need to fetch additional information
    if (movie.flag !== true) {
      try {
        // Get the provider for this movie
        const providerId = movie.provider;
        const provider = await Provider.findById(providerId);
        
        if (!provider || provider.status !== 'Active') {
          return res.status(404).json({
            success: false,
            error: 'Provider not found or not active'
          });
        }

        console.log(`Processing movie: ${movie.name || movie.title} from provider: ${provider.name}`);
        
        // Get authentication credentials from provider endpoint
        let username, password;
        
        try {
          const authResponse = await axios.post(provider.apiEndpoint, {});
          username = authResponse.data.username;
          password = authResponse.data.password;

          if (!username || !password) {
            console.warn(`Invalid auth response from provider ${provider.name}: missing credentials`);
            return res.status(500).json({
              success: false,
              error: 'Failed to get provider authentication credentials'
            });
          }
        } catch (authError) {
          console.error(`Authentication error for provider ${provider.name}:`, authError.message);
          return res.status(500).json({
            success: false,
            error: 'Provider authentication failed'
          });
        }

      // Get the stream ID from the movie
      const streamId = movie.stream_id;
      
      // Fetch VOD details using provider DNS and credentials
      const vodUrl = `${provider.dns}/player_api.php?username=${username}&password=${password}&action=get_vod_info&vod_id=${streamId}`;
      
      console.log(`Fetching VOD details for stream ${streamId}`);
      
      try {
        const vodResponse = await axios.get(vodUrl);
        
        if (!vodResponse.data) {
          return res.status(500).json({
            success: false,
            error: 'No data returned from provider API'
          });
        }
        
        // Update movie with fetched data and set flag to true
        updatedMovie = await VodStream.findByIdAndUpdate(
          id,
          { 
            ...vodResponse.data.info, 
            flag: true 
          },
          { new: true }
        );
      } catch (vodError) {
        console.error(`Error fetching VOD details for stream ${streamId}:`, vodError.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch movie details from provider'
        });
      }
    } catch (error) {
      console.error(`Error processing movie ${id}:`, error.message);
      return res.status(500).json({
        success: false,
        error: 'Server Error',
        message: error.message
      });
    }
  }

  // Get similar movies based on category_ids
  let similarMovies = [];
  
  // Determine which category IDs to use
  const categoryIds = [];
  
  // Check for category_id
  if (updatedMovie.category_id) {
    categoryIds.push(updatedMovie.category_id);
  }
  
  // Check for category_ids array
  if (updatedMovie.category_ids && Array.isArray(updatedMovie.category_ids) && updatedMovie.category_ids.length > 0) {
    // Convert numbers to strings if needed
    const stringCategoryIds = updatedMovie.category_ids.map(id => id.toString());
    categoryIds.push(...stringCategoryIds);
  }
  
  // If we have category IDs, get similar movies
  if (categoryIds.length > 0) {
    try {
      // For each category ID, get up to 5 similar movies
      const similarMoviesPromises = categoryIds.map(async (categoryId) => {
        const moviesInCategory = await VodStream.aggregate([
          { 
            $match: { 
              category_id: categoryId.toString(),
              _id: { $ne: mongoose.Types.ObjectId(id) }, // Exclude the current movie
              status: { $ne: 'HIDDEN' }
            } 
          },
          { $sample: { size: 5 } }  // Get 5 random movies
        ]);
        
        return {
          category_id: categoryId,
          movies: moviesInCategory
        };
      });
      
      // Wait for all queries to complete
      similarMovies = await Promise.all(similarMoviesPromises);
    } catch (error) {
      console.error('Error fetching similar movies:', error);
      // We'll continue even if there's an error getting similar movies
    }
  }

  return res.status(200).json({
    success: true,
    data: updatedMovie,
    similarMovies
  });
  } catch (error) {
    console.error('Error in getMovieById:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
}
async function getStreamUrl(req, res) {
  try {
    const { providerId, streamId } = req.params;

    // Validate providerId format
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider ID format'
      });
    }

    // Get provider details
    const provider = await Provider.findById(providerId);
    if (!provider || provider.status !== 'Active') {
      return res.status(404).json({
        success: false,
        error: 'Provider not found or not active'
      });
    }

    // Get authentication credentials from provider endpoint
    let username, password;
    
    try {
      const authResponse = await axios.post(provider.apiEndpoint, {});
      username = authResponse.data.username;
      password = authResponse.data.password;

      if (!username || !password) {
        console.warn(`Invalid auth response from provider ${provider.name}: missing credentials`);
        return res.status(500).json({
          success: false,
          error: 'Failed to get provider authentication credentials'
        });
      }
    } catch (authError) {
      console.error(`Authentication error for provider ${provider.name}:`, authError.message);
      return res.status(500).json({
        success: false,
        error: 'Provider authentication failed'
      });
    }

    // Construct the stream URL using the format /movie/USERNAME/PASSWORD/{VOD_ID}.mp4
    const streamUrl = `${provider.dns}/movie/${username}/${password}/${streamId}.mp4`;

    return res.status(200).json({
      success: true,
      data: {
        streamUrl
      }
    });
  } catch (error) {
    console.error('Error in getStreamUrl:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
}
async function getSectionsWithMovies(req, res) {

  try {
    console.log('Fetching sections with Movies content type');
    // 1. Get all active sections with content type "Movies" (exact match, case-sensitive)
    const sections = await Section.find({ 
      active: true,
      contentType: 'Movies'  // Using exact match for content type
    }).sort({ sortOrder: 1 });
    
    console.log(`Found ${sections.length} movie sections`);
    
    if (!sections.length) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    // 2. Process each section to add movies
    const sectionsWithMovies = await Promise.all(sections.map(async (section) => {
      // Skip if no categories selected
      if (!section.selectedCategoryIds || section.selectedCategoryIds.length === 0) {
        return {
          ...section.toObject(),
          movies: []
        };
      }

      // Normalize category IDs by removing leading zeros
      const normalizedCategoryIds = section.selectedCategoryIds.map(categoryId => {
        // Convert to number and back to string to remove leading zeros
        return parseInt(categoryId, 10).toString();
      });

      // Prepare array for all movies from all categories in this section
      const moviesForSection = [];

      // For each normalized category ID, get 5 random movies
      for (const categoryId of normalizedCategoryIds) {
        try {
          // Find 5 random movies for this category
          // Only include movies that are not hidden and have flag=true (complete info)
          console.log(`Getting movies for category ID: ${categoryId}`);
          const moviesForCategory = await VodStream.aggregate([
            { 
              $match: { 
                category_id: categoryId, 
                status: { $ne: 'HIDDEN' },
              } 
            },
            // Randomize the results
            { $sample: { size: 5 } }
          ]);
          console.log(`Found ${moviesForCategory.length} movies for category ID: ${categoryId}`);
          // Add to our collection
          if (moviesForCategory.length > 0) {
            moviesForSection.push({
              category_id: categoryId,
              movies: moviesForCategory
            });
          }
        } catch (error) {
          console.error(`Error getting movies for category ${categoryId}:`, error.message);
          // Continue with next category even if this one fails
        }
      }

      // Return section with its movies
      return {
        ...section.toObject(),
        categoryMovies: moviesForSection
      };
    }));

    console.log(`Returning ${sectionsWithMovies.length} processed movie sections`);
    return res.status(200).json({
      success: true,
      count: sectionsWithMovies.length,
      data: sectionsWithMovies
    });
  } catch (error) {
    console.error('Error in getSectionsWithMovies:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
}
async function getCategoriesByType(req, res) {
  try {
    const { content_type } = req.params;
    
    // Validate content_type
    const validContentTypes = ['VOD', 'series', 'live'];
    if (!validContentTypes.includes(content_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid content type. Must be one of: VOD, series, live'
      });
    }

    // Find all categories with the specified content_type that are not blacklisted
    const categories = await Category.find({ 
      category_type: content_type,
      blacklisted: false
    }).sort({ category_name: 1 });

    // Group categories by parent_id
    const parentCategories = categories.filter(cat => cat.parent_id === null);
    const childCategories = categories.filter(cat => cat.parent_id !== null);

    // Create a hierarchy structure
    const categoryHierarchy = parentCategories.map(parent => {
      const children = childCategories.filter(child => 
        child.parent_id === parent.category_id
      );
      
      return {
        ...parent.toObject(),
        children: children.map(child => child.toObject())
      };
    });

    return res.status(200).json({
      success: true,
      count: categoryHierarchy.length,
      data: categoryHierarchy
    });
  } catch (error) {
    console.error('Error in getCategoriesByType:', error);
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: error.message
    });
  }
}
async function getSectionswithLiveTv(req, res) {
  try {
    // Fetch sections where contentType matches 'live tv' (case-insensitive) and active
    const sections = await Section.find({ active: true, contentType: /live\s*tv/i }).sort({ sortOrder: 1 });

    if (!sections.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const sectionsWithLive = await Promise.all(sections.map(async (section) => {
      // If no selected categories, return empty categoryMovies
      if (!section.selectedCategoryIds || section.selectedCategoryIds.length === 0) {
        return { ...section.toObject(), categoryMovies: [] };
      }

      // Normalize category IDs to strings
      const normalizedCategoryIds = section.selectedCategoryIds.map(id => parseInt(id, 10).toString());

      const categoryMovies = [];

      for (const categoryId of normalizedCategoryIds) {
        try {
          const movies = await LiveStream.aggregate([
            { $match: { category_id: categoryId, status: { $ne: 'HIDDEN' } } },
            { $sample: { size: 5 } }
          ]);

          if (movies && movies.length > 0) {
            categoryMovies.push({ category_id: categoryId, movies });
          }
        } catch (err) {
          console.error(`Error fetching live streams for category ${categoryId}:`, err.message);
        }
      }

      return { ...section.toObject(), categoryMovies };
    }));

    return res.status(200).json({ success: true, count: sectionsWithLive.length, data: sectionsWithLive });
  } catch (error) {
    console.error('Error in getSectionswithLiveTv:', error);
    return res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
}
async function getAllLiveTvS(req, res) {
  try {
    const { search, category_id, provider, status, feature, page = 1, limit = 10, hide } = req.query;
    const query = {};

    // provider may be an ObjectId
    if (provider && /^[0-9a-fA-F]{24}$/.test(provider)) query.provider = provider;
    if (category_id) query.category_id = category_id;
    if (status) query.status = String(status).toUpperCase();
    if (feature !== undefined) query.feature = feature === 'true' || feature === true;

    // hide handling: if hide=true -> only HIDDEN, if hide=false -> exclude HIDDEN
    if (hide === 'true') {
      query.status = 'HIDDEN';
    } else if (hide === 'false') {
      query.status = { $ne: 'HIDDEN' };
    }

    if (search) {
      const regex = new RegExp(String(search), 'i');
      query.$or = [
        { name: regex },
        { title: regex }
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const totalItems = await LiveStream.countDocuments(query);
    const streams = await LiveStream.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ updatedAt: -1 });

    const totalPages = Math.ceil(totalItems / limitNum);
    return res.status(200).json({
      streams,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNum,
        pageSize: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1
      },
      filters: { search, category_id, provider, status, hide, feature }
    });
  } catch (err) {
    console.error('Error in getAllLiveTvS:', err);
    return res.status(500).json({ success: false, error: 'Server Error', message: err.message });
  }
}
async function getLiveStreamUrl(req, res) {
  try {
    const { providerId, streamId } = req.params;

    if (!providerId || !/^[0-9a-fA-F]{24}$/.test(providerId)) {
      return res.status(400).json({ success: false, error: 'Invalid provider ID format' });
    }

    const provider = await Provider.findById(providerId);
    if (!provider || provider.status !== 'Active') {
      return res.status(404).json({ success: false, error: 'Provider not found or not active' });
    }

    // Obtain credentials from provider endpoint
    let username, password;
    try {
      const authResponse = await axios.post(provider.apiEndpoint, {});
      username = authResponse.data?.username;
      password = authResponse.data?.password;
    } catch (authErr) {
      console.error(`Auth error for provider ${providerId}:`, authErr.message);
      return res.status(500).json({ success: false, error: 'Failed to get provider credentials' });
    }

    if (!username || !password) {
      console.warn(`Missing credentials from provider ${provider._id}`);
      return res.status(500).json({ success: false, error: 'Provider did not return credentials' });
    }

    // Try .m3u8 then .ts
    const base = provider.dns.replace(/\/$/, '');
    const candidates = [
      `${base}/live/${username}/${password}/${streamId}.m3u8`,
      `${base}/live/${username}/${password}/${streamId}.ts`
    ];

    for (const url of candidates) {
      try {
        // For m3u8 expect text; for ts expect binary. Use a short timeout and only read headers/body start.
        const isM3u8 = url.endsWith('.m3u8');
        const resp = await axios.get(url, {
          timeout: 5000,
          responseType: isM3u8 ? 'text' : 'arraybuffer',
          maxRedirects: 3,
          validateStatus: status => status < 400
        });

        if (resp.status === 200) {
          const contentType = (resp.headers['content-type'] || '').toLowerCase();

          if (isM3u8) {
            const body = typeof resp.data === 'string' ? resp.data : '';
            if (body.startsWith('#EXTM3U') || contentType.includes('mpegurl') || contentType.includes('vnd.apple.mpegurl')) {
              return res.status(200).json({ success: true, streamUrl: url, type: 'm3u8' });
            }
          } else {
            // TS segment or direct transport stream
            if (contentType.includes('video/') || (resp.data && resp.data.byteLength > 0)) {
              return res.status(200).json({ success: true, streamUrl: url, type: 'ts' });
            }
          }
        }
      } catch (err) {
        // Try next candidate
        console.warn(`Candidate URL failed: ${url} -> ${err.message}`);
      }
    }

    return res.status(404).json({ success: false, error: 'Stream not available / Not streaming now' });
  } catch (error) {
    console.error('Error in getLiveStreamUrl:', error);
    return res.status(500).json({ success: false, error: 'Server Error', message: error.message });
  }
}
module.exports = {
  getProcessedHeroCarousel,
  getMovieById,
  getStreamUrl,
  getSectionsWithMovies,
  getCategoriesByType,
  getSectionswithLiveTv,
  getAllLiveTvS,
  getLiveStreamUrl
}