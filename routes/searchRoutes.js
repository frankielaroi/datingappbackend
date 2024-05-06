const express = require('express');
const router = express.Router();
const User = require('../models/usermodel'); // Import your User model

// Route to search users by name or username
router.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query; // Get search query from request query parameters

    // Use a regular expression to perform a case-insensitive search
    const users = await User.find({
      $or: [
        { firstName: { $regex: query, $options: 'i' } }, // Search by first name
        { lastName: { $regex: query, $options: 'i' } },  // Search by last name
        { username: { $regex: query, $options: 'i' } }    // Search by username
      ]
    });

    res.status(200).json(users); // Return found users as JSON response
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
