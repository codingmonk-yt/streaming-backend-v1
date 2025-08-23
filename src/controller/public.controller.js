const HeroSection = require('../models/HeroCarousel');
const Provider = require('../models/Provider');
const VodStream = require('../models/VodStream');
const Section = require('../models/Section');
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

    // If flag is true, movie has complete information - return it directly
    if (movie.flag === true) {
      return res.status(200).json({
        success: true,
        data: movie
      });
    }

    // If flag is false, we need to fetch additional information
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
        const updatedMovie = await VodStream.findByIdAndUpdate(
          id,
          { 
            ...vodResponse.data.info, 
            flag: true 
          },
          { new: true }
        );

        return res.status(200).json({
          success: true,
          data: updatedMovie
        });
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
    // 1. Get all active sections
    const sections = await Section.find({ active: true }).sort({ sortOrder: 1 });
    
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

module.exports = {
  getProcessedHeroCarousel,
  getMovieById,
  getStreamUrl,
  getSectionsWithMovies
};