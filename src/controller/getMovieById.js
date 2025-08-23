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

module.exports = getMovieById;
