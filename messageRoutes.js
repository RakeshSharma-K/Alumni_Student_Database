const express = require('express');
const router = express.Router();
const db = require('./db');

// FIX: Export a function that accepts the `io` instance
module.exports = function(io) {
    /**
     * @route   POST /messages/send
     * @desc    Saves a message to the database and emits it via WebSocket
     */
    router.post('/send', async (req, res) => {
        const { sender_id, receiver_id, message_text } = req.body;

        if (!sender_id || !receiver_id || !message_text) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        try {
            const result = await db.query(
                `INSERT INTO message_table (sender_id, receiver_id, message_text)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [sender_id, receiver_id, message_text]
            );
            
            const newMessage = result.rows[0];

            // WebSocket EMIT: Send the new message to both the sender and receiver's rooms
            const senderRoom = `user_${sender_id}`;
            const receiverRoom = `user_${receiver_id}`;
            
            io.to(senderRoom).emit('new_message', newMessage);
            io.to(receiverRoom).emit('new_message', newMessage);

            console.log(`Message sent from ${sender_id} to ${receiver_id}. Emitting to rooms: ${senderRoom}, ${receiverRoom}`);

            res.status(201).json({ success: true, message: newMessage });
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    /**
     * @route   GET /messages/get/:sender_id/:receiver_id
     * @desc    Retrieves the chat history between two users
     */
    router.get('/get/:sender_id/:receiver_id', async (req, res) => {
        const { sender_id, receiver_id } = req.params;

        try {
            const result = await db.query(
                `SELECT * FROM message_table
                 WHERE (sender_id = $1 AND receiver_id = $2)
                    OR (sender_id = $2 AND receiver_id = $1)
                 ORDER BY sent_at ASC`, 
                [sender_id, receiver_id]
            );

            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error retrieving messages:', error);
            res.status(500).json({ error: 'Failed to retrieve messages' });
        }
    });

    return router;
};
