const express = require('express');
const router = express.Router();
const db = require('./db');

/**
 * GET /users
 * Lists all registered users (except the current logged-in user).
 * The current user's ID is passed as a query parameter.
 */
router.get('/', async (req, res) => {
    // FIX: Get the current user's ID from a query parameter instead of a hardcoded value.
    const currentUserId = req.query.currentUserId;

    if (!currentUserId) {
        return res.status(400).json({ error: 'Current user ID is required.' });
    }

    try {
        const result = await db.query(
            `SELECT user_id, username as name, role
             FROM user_table
             WHERE user_id != $1
             ORDER BY username ASC`,
            [currentUserId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to retrieve user list' });
    }
});

module.exports = router;
