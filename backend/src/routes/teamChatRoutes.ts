/**
 * Team Chat Routes
 *
 * API endpoints for the unified team communication system.
 * Supports platform messages, SMS, and email integration.
 *
 * Conversation endpoints:
 * - GET /api/team-chat/conversations - List conversations
 * - POST /api/team-chat/conversations - Create conversation
 * - GET /api/team-chat/conversations/:id - Get conversation
 * - GET /api/team-chat/conversations/property/:propertyId - Get by property
 * - POST /api/team-chat/conversations/:id/archive - Archive conversation
 * - POST /api/team-chat/conversations/:id/unarchive - Unarchive conversation
 * - GET /api/team-chat/search - Search conversations
 *
 * Message endpoints:
 * - GET /api/team-chat/conversations/:id/messages - Get messages
 * - POST /api/team-chat/conversations/:id/messages - Send message
 * - POST /api/team-chat/conversations/:id/read - Mark as read
 * - PUT /api/team-chat/conversations/:id/messages/:messageId - Edit message
 * - DELETE /api/team-chat/conversations/:id/messages/:messageId - Delete message
 * - POST /api/team-chat/conversations/:id/typing - Typing indicator
 *
 * Utility endpoints:
 * - GET /api/team-chat/unread-count - Get unread count
 * - GET /api/team-chat/stats - Get statistics
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { teamChatController } from '../controllers/teamChatController';

const router = Router();

// Rate limiter for message sending
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 messages per minute
  message: { success: false, error: 'Too many messages. Please slow down.' },
});

// Rate limiter for typing indicators
const typingLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 2, // 2 typing events per second
  message: { success: false, error: 'Too many typing events.' },
});

/**
 * @swagger
 * tags:
 *   name: Team Chat
 *   description: Unified team communication system
 */

// ============================================================================
// CONVERSATION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/team-chat/conversations:
 *   get:
 *     summary: Get conversations
 *     description: Get all conversations for the current user. Admins see all, buyers see only their conversations.
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeArchived
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include archived conversations
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of conversations
 */
router.get('/conversations', authenticate, teamChatController.getConversations);

/**
 * @swagger
 * /api/team-chat/conversations:
 *   post:
 *     summary: Create a conversation
 *     description: Create a new conversation, optionally linked to a property
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               propertyId:
 *                 type: integer
 *                 description: Link to a property (optional)
 *               title:
 *                 type: string
 *                 description: Conversation title (optional, defaults to property address)
 *     responses:
 *       201:
 *         description: Conversation created
 */
router.post('/conversations', authenticate, teamChatController.createConversation);

/**
 * @swagger
 * /api/team-chat/search:
 *   get:
 *     summary: Search conversations
 *     description: Search conversations by property address or title
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', authenticate, teamChatController.searchConversations);

/**
 * @swagger
 * /api/team-chat/unread-count:
 *   get:
 *     summary: Get total unread count
 *     description: Get the total number of unread messages across all conversations
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 */
router.get('/unread-count', authenticate, teamChatController.getUnreadCount);

/**
 * @swagger
 * /api/team-chat/stats:
 *   get:
 *     summary: Get team chat statistics
 *     description: Get statistics about conversations and messages
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *         description: Filter by conversation ID (optional)
 *     responses:
 *       200:
 *         description: Statistics
 */
router.get('/stats', authenticate, teamChatController.getStats);

/**
 * @swagger
 * /api/team-chat/conversations/property/{propertyId}:
 *   get:
 *     summary: Get conversation by property
 *     description: Get or create a conversation for a specific property
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Conversation for the property
 */
router.get('/conversations/property/:propertyId', authenticate, teamChatController.getConversationByProperty);

/**
 * @swagger
 * /api/team-chat/conversations/{id}:
 *   get:
 *     summary: Get a conversation
 *     description: Get details of a specific conversation
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Conversation details
 *       404:
 *         description: Conversation not found
 */
router.get('/conversations/:id', authenticate, teamChatController.getConversation);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/archive:
 *   post:
 *     summary: Archive a conversation
 *     description: Archive a conversation (hides from default list)
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Conversation archived
 */
router.post('/conversations/:id/archive', authenticate, teamChatController.archiveConversation);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/unarchive:
 *   post:
 *     summary: Unarchive a conversation
 *     description: Unarchive a conversation (shows in default list)
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Conversation unarchived
 */
router.post('/conversations/:id/unarchive', authenticate, teamChatController.unarchiveConversation);

/**
 * @swagger
 * /api/team-chat/conversations/{id}:
 *   delete:
 *     summary: Delete a conversation
 *     description: Permanently delete a conversation and all its messages (admin only)
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Conversation deleted
 *       403:
 *         description: Not authorized
 */
router.delete('/conversations/:id', authenticate, teamChatController.deleteConversation);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/participants:
 *   post:
 *     summary: Add participants to a conversation
 *     description: Add team members to a conversation
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Participants added
 */
router.post('/conversations/:id/participants', authenticate, teamChatController.addParticipants);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/participants:
 *   get:
 *     summary: Get conversation participants
 *     description: Get all participants of a conversation
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of participants
 */
router.get('/conversations/:id/participants', authenticate, teamChatController.getParticipants);

// ============================================================================
// MESSAGE ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/team-chat/conversations/{id}/messages:
 *   get:
 *     summary: Get messages
 *     description: Get messages for a conversation with pagination
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Get messages before this timestamp
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Get messages after this timestamp
 *     responses:
 *       200:
 *         description: List of messages
 */
router.get('/conversations/:id/messages', authenticate, teamChatController.getMessages);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/messages:
 *   post:
 *     summary: Send a message
 *     description: Send a message to a conversation
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Message content (supports @mentions)
 *               replyToMessageId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of message being replied to
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     filename:
 *                       type: string
 *                     contentType:
 *                       type: string
 *                     size:
 *                       type: integer
 *                     url:
 *                       type: string
 *     responses:
 *       201:
 *         description: Message sent
 *       400:
 *         description: Invalid request
 */
router.post('/conversations/:id/messages', authenticate, messageLimiter, teamChatController.sendMessage);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/read:
 *   post:
 *     summary: Mark messages as read
 *     description: Mark all messages in a conversation as read for the current user
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Messages marked as read
 */
router.post('/conversations/:id/read', authenticate, teamChatController.markAsRead);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/messages/{messageId}/delivered:
 *   post:
 *     summary: Confirm message delivery
 *     description: Confirm that a message was delivered to the current user. Called when a message is received via realtime.
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Conversation ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: messageId
 *         required: true
 *         description: Message ID to confirm delivery for
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Delivery confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 delivered:
 *                   type: boolean
 *                   description: Whether this was a new delivery confirmation
 *       404:
 *         description: Message not found
 */
router.post('/conversations/:id/messages/:messageId/delivered', authenticate, teamChatController.confirmDelivery);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/typing:
 *   post:
 *     summary: Send typing indicator
 *     description: Notify other users that you are typing
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               typing:
 *                 type: boolean
 *                 default: true
 *                 description: true = started typing, false = stopped typing
 *     responses:
 *       200:
 *         description: Typing indicator sent
 */
router.post('/conversations/:id/typing', authenticate, typingLimiter, teamChatController.sendTypingIndicator);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/messages/{messageId}:
 *   put:
 *     summary: Edit a message
 *     description: Edit a message (only sender can edit, only platform messages)
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message edited
 *       400:
 *         description: Cannot edit this message
 *       404:
 *         description: Message not found
 */
router.put('/conversations/:id/messages/:messageId', authenticate, teamChatController.editMessage);

/**
 * @swagger
 * /api/team-chat/conversations/{id}/messages/{messageId}:
 *   delete:
 *     summary: Delete a message
 *     description: Delete a message (sender or admin can delete)
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Message deleted
 *       400:
 *         description: Not authorized to delete
 *       404:
 *         description: Message not found
 */
router.delete('/conversations/:id/messages/:messageId', authenticate, teamChatController.deleteMessage);

// ============================================================================
// TEAM MEMBER ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/team-chat/members:
 *   get:
 *     summary: Get team members
 *     description: Get all team members for @mentions
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: List of team members
 */
router.get('/members', authenticate, teamChatController.getTeamMembers);

/**
 * @swagger
 * /api/team-chat/members/{userId}/role:
 *   put:
 *     summary: Update user role
 *     description: Update a user's role (admin only)
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [buyer, investor, wholesaler, agent, broker, broker_assistant, transaction_coordinator, team_member, admin]
 *     responses:
 *       200:
 *         description: Role updated
 *       403:
 *         description: Not authorized
 */
router.put('/members/:userId/role', authenticate, teamChatController.updateUserRole);

/**
 * @swagger
 * /api/team-chat/online:
 *   get:
 *     summary: Get online users
 *     description: Get list of currently online users
 *     tags: [Team Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of online users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       avatar:
 *                         type: string
 *                       onlineStatus:
 *                         type: string
 */
router.get('/online', authenticate, teamChatController.getOnlineUsers);

export default router;
