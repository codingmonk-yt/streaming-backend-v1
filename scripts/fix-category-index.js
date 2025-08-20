const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.URL, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

mongoose.connection.on('connected', async () => {
  console.log('✅ Connected to MongoDB:', mongoose.connection.db.databaseName);

  try {
    // Get the collection
    const categoryCollection = mongoose.connection.db.collection('categories');
    
    // Get current indexes
    const indexes = await categoryCollection.indexes();
    console.log('Current indexes:', indexes);

    // Check if the single category_id index exists
    const categoryIdIndex = indexes.find(idx => 
      idx.name === 'category_id_1' && 
      Object.keys(idx.key).length === 1 && 
      idx.key.category_id === 1
    );

    if (categoryIdIndex) {
      console.log('🔍 Found standalone category_id index - dropping it...');
      
      // Drop the problematic index
      await categoryCollection.dropIndex('category_id_1');
      console.log('✅ Successfully dropped the standalone category_id index');
      
      // Verify it's gone
      const updatedIndexes = await categoryCollection.indexes();
      console.log('Updated indexes:', updatedIndexes);
      
      // Check that compound index exists
      const compoundIndex = updatedIndexes.find(idx => 
        idx.key.category_id === 1 && 
        idx.key.provider === 1 && 
        idx.key.category_type === 1
      );
      
      if (compoundIndex) {
        console.log('✅ Compound index is in place and working correctly');
      } else {
        console.log('⚠️ Warning: Compound index not found. Creating it now...');
        await categoryCollection.createIndex(
          { category_id: 1, provider: 1, category_type: 1 },
          { unique: true }
        );
        console.log('✅ Created compound index');
      }
    } else {
      console.log('✅ No standalone category_id index found - your schema is already correct');
      
      // Check that compound index exists
      const compoundIndex = indexes.find(idx => 
        idx.key.category_id === 1 && 
        idx.key.provider === 1 && 
        idx.key.category_type === 1
      );
      
      if (compoundIndex) {
        console.log('✅ Compound index is in place and working correctly');
      } else {
        console.log('⚠️ Warning: Compound index not found. Creating it now...');
        await categoryCollection.createIndex(
          { category_id: 1, provider: 1, category_type: 1 },
          { unique: true }
        );
        console.log('✅ Created compound index');
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  }
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});
