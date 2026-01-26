/**
 * Public Chat Routes
 *
 * API endpoints for public property discussions.
 * Anyone can join with phone verification (SMS).
 *
 * @swagger
 * tags:
 *   - name: Public Chat
 *     description: Public property discussion endpoints (SMS verification required)
 *   - name: Public Chat Admin
 *     description: Admin moderation endpoints for public chats (JWT auth required)
 */

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import TeamConversation from '../models/TeamConversation';
import TeamMessage, { SenderType, MessageSource } from '../models/TeamMessage';
import GuestSession from '../models/GuestSession';
import Property from '../models/Property';
import { notificationService } from '../services/NotificationService';
import { supabaseRealtimeService } from '../services/SupabaseRealtimeService';

const router = Router();

// Rate limiter for SMS requests (prevent abuse)
const smsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 SMS requests per minute per IP
  message: { success: false, error: 'Too many verification requests. Please wait a minute.' },
});

// Rate limiter for messages
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: { success: false, error: 'Too many messages. Please slow down.' },
});

/**
 * Middleware to authenticate guest session via token
 */
async function authenticateGuest(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-guest-token'] as string;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Guest token required. Please verify your phone number first.',
    });
  }

  const session = await GuestSession.findByToken(token);

  if (!session || !session.isSessionValid()) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session. Please verify your phone number again.',
    });
  }

  // Attach guest session to request
  (req as any).guestSession = session;
  next();
}

/**
 * @swagger
 * /api/public-chat/{propertyId}:
 *   get:
 *     summary: Get public chat info
 *     description: Get public chat info for a property (no auth required)
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Public chat info
 *       404:
 *         description: Property not found
 */
router.get('/:propertyId', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);

    // Get property info
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Get or create public conversation
    const propertyAddress = property.propertyAddress ||
      `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city}, ${property.state}`.trim();

    const [conversation] = await TeamConversation.findOrCreatePublicForProperty(
      propertyId,
      propertyAddress
    );

    // Count participants (unique phone numbers)
    const participantCount = conversation.participantIds.length;

    // Count total messages
    const messageCount = await TeamMessage.count({
      where: { conversationId: conversation.id },
    });

    res.json({
      success: true,
      data: {
        conversationId: conversation.id,
        propertyId,
        propertyAddress,
        title: conversation.title,
        participantCount,
        messageCount,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview,
        property: {
          id: property.id,
          address: propertyAddress,
          city: property.city,
          state: property.state,
          askingPrice: property.askingPrice || property.purchaseContractPrice,
          photoLinks: property.photoLinks?.slice(0, 1) || [],
        },
      },
    });
  } catch (error) {
    console.error('Error getting public chat:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/public-chat/{propertyId}/check-phone:
 *   post:
 *     summary: Check if phone exists
 *     description: Check if phone number exists in system and send magic link if so
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Phone check result
 *       404:
 *         description: Property not found
 */
router.post('/:propertyId/check-phone', smsLimiter, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required',
      });
    }

    // Validate property exists
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Normalize phone
    const normalizedPhone = phone.replace(/[^+\d]/g, '');

    // Check if phone exists
    const existingSession = await GuestSession.findByPhone(normalizedPhone);

    if (existingSession) {
      // Phone exists - generate and send magic link immediately
      const magicToken = await existingSession.generateMagicLinkToken();
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const magicLink = `${baseUrl}/property-chat/${propertyId}?token=${magicToken}`;

      // Send SMS
      try {
        if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
          const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
          await twilio.messages.create({
            body: `Tap to join the property discussion on Dispotree: ${magicLink}`,
            from: process.env.TWILIO_FROM_NUMBER,
            to: existingSession.phone,
          });
          console.log(`Sent SMS magic link to ${existingSession.phone}`);
        } else {
          console.log(`[DEV] SMS Magic link for ${existingSession.phone}: ${magicLink}`);
        }
      } catch (smsError) {
        console.error('Failed to send SMS:', smsError);
        if (process.env.NODE_ENV === 'production') {
          return res.status(500).json({
            success: false,
            error: 'Failed to send SMS. Please try again.',
          });
        }
      }

      return res.json({
        success: true,
        data: {
          exists: true,
          phone: existingSession.phone,
          name: existingSession.name,
          linkSent: true,
          expiresIn: 900,
          ...(process.env.NODE_ENV !== 'production' && { magicLink }),
        },
      });
    }

    // Phone doesn't exist - need more info
    res.json({
      success: true,
      data: {
        exists: false,
        phone: normalizedPhone,
        needsRegistration: true,
      },
    });
  } catch (error) {
    console.error('Error checking phone:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/public-chat/{propertyId}/register:
 *   post:
 *     summary: Register new user
 *     description: Register new user and send magic link for property chat access
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, name]
 *             properties:
 *               phone:
 *                 type: string
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Registration successful, magic link sent
 *       404:
 *         description: Property not found
 */
router.post('/:propertyId/register', smsLimiter, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { phone, name, email } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required',
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required for new users',
      });
    }

    // Validate property exists
    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Create new guest session
    const [session, created] = await GuestSession.findOrCreateByPhone(phone);

    // Set name and email
    session.name = name;
    if (email) {
      session.email = email;
    }
    await session.save();

    // Generate magic link token
    const magicToken = await session.generateMagicLinkToken();
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const magicLink = `${baseUrl}/property-chat/${propertyId}?token=${magicToken}`;

    // Send SMS
    try {
      if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
        const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
        await twilio.messages.create({
          body: `Welcome to Dispotree! Tap to join the property discussion: ${magicLink}`,
          from: process.env.TWILIO_FROM_NUMBER,
          to: session.phone,
        });
        console.log(`Sent SMS magic link to new user ${session.phone}`);
      } else {
        console.log(`[DEV] SMS Magic link for new user ${session.phone}: ${magicLink}`);
      }
    } catch (smsError) {
      console.error('Failed to send SMS:', smsError);
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({
          success: false,
          error: 'Failed to send SMS. Please try again.',
        });
      }
    }

    res.json({
      success: true,
      message: 'Welcome! Magic link sent.',
      data: {
        phone: session.phone,
        name: session.name,
        email: session.email,
        expiresIn: 900,
        ...(process.env.NODE_ENV !== 'production' && { magicLink }),
      },
    });
  } catch (error) {
    console.error('Error registering:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/public-chat/{propertyId}/verify-token:
 *   post:
 *     summary: Verify magic link token
 *     description: Verify magic link token and get session token for chat access
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification successful, session token returned
 *       400:
 *         description: Invalid or expired token
 */
router.post('/:propertyId/verify-token', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    // Find session by magic token
    const session = await GuestSession.findByMagicToken(token);

    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired link. Please request a new one.',
      });
    }

    // Verify the magic link
    const verified = await session.verifyMagicLink(token);

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired link. Please request a new one.',
      });
    }

    // Grant access to this property
    await session.grantPropertyAccess(propertyId);

    // Add to conversation participants
    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (conversation) {
      await conversation.addParticipant(session.id);
    }

    res.json({
      success: true,
      message: 'Verified successfully',
      data: {
        token: session.sessionToken,
        expiresAt: session.sessionExpires,
        name: session.name,
        phone: session.phone,
        email: session.email,
      },
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/public-chat/{propertyId}/verify:
 *   post:
 *     summary: Verify SMS code (legacy)
 *     description: Verify SMS code and get session token (backward compatibility)
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, code]
 *             properties:
 *               phone:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification successful
 *       400:
 *         description: Invalid or expired code
 */
router.post('/:propertyId/verify', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        error: 'Phone and verification code are required',
      });
    }

    // Find session
    const session = await GuestSession.findByPhone(phone);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'No verification request found for this phone number',
      });
    }

    // Verify code
    const verified = await session.verifyCode(code);

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification code',
      });
    }

    // Grant access to this property
    await session.grantPropertyAccess(propertyId);

    // Add to conversation participants
    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (conversation) {
      await conversation.addParticipant(session.id);
    }

    res.json({
      success: true,
      message: 'Phone verified successfully',
      data: {
        token: session.sessionToken,
        expiresAt: session.sessionExpires,
        name: session.name,
        phone: session.phone,
        email: session.email,
      },
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/public-chat/{propertyId}/messages:
 *   get:
 *     summary: Get chat messages
 *     description: Get messages for a property chat (guest token required)
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: x-guest-token
 *         required: true
 *         schema:
 *           type: string
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
 *         description: List of messages
 *       401:
 *         description: Guest token required
 *       403:
 *         description: No access to this property chat
 */
router.get('/:propertyId/messages', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const guestSession = (req as any).guestSession as GuestSession;
    const { limit = '50', offset = '0' } = req.query;

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    // Get conversation
    const conversation = await TeamConversation.getPublicForProperty(propertyId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Public chat not found for this property',
      });
    }

    // Get messages
    const messages = await TeamMessage.findAll({
      where: { conversationId: conversation.id },
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    // Count total
    const total = await TeamMessage.count({
      where: { conversationId: conversation.id },
    });

    res.json({
      success: true,
      data: messages,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/public-chat/{propertyId}/messages:
 *   post:
 *     summary: Send a message
 *     description: Send a message to the property chat (guest token required)
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: x-guest-token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       201:
 *         description: Message sent
 *       401:
 *         description: Guest token required
 *       403:
 *         description: No access to this property chat
 */
router.post('/:propertyId/messages', authenticateGuest, messageLimiter, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const guestSession = (req as any).guestSession as GuestSession;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required',
      });
    }

    // Limit message length
    if (content.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message too long (max 2000 characters)',
      });
    }

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    // Get conversation
    const conversation = await TeamConversation.getPublicForProperty(propertyId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Public chat not found for this property',
      });
    }

    // Determine sender name
    const senderName = guestSession.name || formatPhoneForDisplay(guestSession.phone);

    // Create message
    const message = await TeamMessage.create({
      conversationId: conversation.id,
      senderId: null, // Guest - no user ID
      senderType: 'guest' as SenderType,
      senderName,
      senderPhone: guestSession.phone,
      senderEmail: guestSession.email,
      source: 'platform' as MessageSource,
      content: content.trim(),
      deliveryStatus: 'sent',
      readBy: [],
      mentions: [],
      attachments: [],
      metadata: {
        guestSessionId: guestSession.id,
      },
    });

    // Update conversation last message
    await conversation.updateLastMessage(content.trim(), senderName, 'platform');

    // Broadcast to all participants via Supabase Realtime
    try {
      await supabaseRealtimeService.broadcastPublicMessage(propertyId, {
        id: message.id,
        conversationId: conversation.id,
        propertyId,
        senderName,
        senderPhone: guestSession.phone,
        senderType: 'guest',
        content: content.trim(),
        createdAt: message.createdAt,
      });
    } catch (err) {
      console.error('Failed to broadcast message:', err);
    }

    res.status(201).json({
      success: true,
      data: message,
      message: 'Message sent',
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/public-chat/{propertyId}/participants:
 *   get:
 *     summary: Get participants
 *     description: Get participant count and recent participants for a property chat
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Participant info
 */
router.get('/:propertyId/participants', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);

    const conversation = await TeamConversation.getPublicForProperty(propertyId);

    if (!conversation) {
      return res.json({
        success: true,
        data: {
          count: 0,
          recent: [],
        },
      });
    }

    // Get recent guest sessions that have access to this property
    const recentSessions = await GuestSession.findAll({
      where: {
        id: conversation.participantIds.slice(-10), // Last 10
        isVerified: true,
      },
      attributes: ['id', 'name', 'phone', 'lastActiveAt'],
      order: [['lastActiveAt', 'DESC']],
    });

    // Format for display (hide full phone)
    const participants = recentSessions.map(s => ({
      id: s.id,
      name: s.name || formatPhoneForDisplay(s.phone),
      lastActiveAt: s.lastActiveAt,
    }));

    res.json({
      success: true,
      data: {
        count: conversation.participantIds.length,
        recent: participants,
      },
    });
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/public-chat/{propertyId}/refresh:
 *   post:
 *     summary: Refresh session token
 *     tags: [Public Chat]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: x-guest-token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session refreshed
 */
router.post('/:propertyId/refresh', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const guestSession = (req as any).guestSession as GuestSession;

    await guestSession.refreshSession();

    res.json({
      success: true,
      data: {
        token: guestSession.sessionToken,
        expiresAt: guestSession.sessionExpires,
      },
    });
  } catch (error) {
    console.error('Error refreshing session:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/public-chat/:propertyId/typing
 * Send typing indicator
 */
router.post('/:propertyId/typing', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const guestSession = (req as any).guestSession as GuestSession;
    const { isTyping } = req.body;

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    // Broadcast typing indicator
    await supabaseRealtimeService.broadcastPublicTyping(propertyId, {
      guestId: guestSession.id,
      guestName: guestSession.name || formatPhoneForDisplay(guestSession.phone),
      propertyId,
      isTyping: !!isTyping,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error broadcasting typing:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/public-chat/:propertyId/messages/:messageId/read
 * Mark message as read
 */
router.post('/:propertyId/messages/:messageId/read', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { messageId } = req.params;
    const guestSession = (req as any).guestSession as GuestSession;

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    // Find message
    const message = await TeamMessage.findByPk(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Add to readBy if not already there
    const readBy = message.readBy || [];
    if (!readBy.includes(guestSession.id)) {
      readBy.push(guestSession.id);
      await message.update({ readBy });

      // Broadcast read receipt
      const conversation = await TeamConversation.getPublicForProperty(propertyId);
      if (conversation) {
        await supabaseRealtimeService.broadcastMessageRead(conversation.id, {
          userId: guestSession.id,
          conversationId: conversation.id,
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking message read:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/public-chat/:propertyId/messages/:messageId/reaction
 * Add or remove reaction from message
 */
router.post('/:propertyId/messages/:messageId/reaction', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { messageId } = req.params;
    const { reaction, action } = req.body; // action: 'add' | 'remove'
    const guestSession = (req as any).guestSession as GuestSession;

    if (!reaction) {
      return res.status(400).json({
        success: false,
        error: 'Reaction emoji is required',
      });
    }

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    // Find message
    const message = await TeamMessage.findByPk(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Get reactions from metadata
    const metadata = message.metadata || {};
    const reactions = metadata.reactions || {};

    // Each reaction is an array of {userId, userName}
    if (action === 'remove') {
      if (reactions[reaction]) {
        reactions[reaction] = reactions[reaction].filter(
          (r: any) => r.guestId !== guestSession.id
        );
        if (reactions[reaction].length === 0) {
          delete reactions[reaction];
        }
      }
    } else {
      // Add reaction
      if (!reactions[reaction]) {
        reactions[reaction] = [];
      }
      // Don't duplicate
      if (!reactions[reaction].find((r: any) => r.guestId === guestSession.id)) {
        reactions[reaction].push({
          guestId: guestSession.id,
          guestName: guestSession.name || formatPhoneForDisplay(guestSession.phone),
        });
      }
    }

    // Save updated metadata
    await message.update({ metadata: { ...metadata, reactions } });

    // Broadcast reaction
    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (conversation) {
      await supabaseRealtimeService.broadcastReaction(conversation.id, {
        messageId,
        conversationId: conversation.id,
        reaction,
        userId: guestSession.id,
        userName: guestSession.name || formatPhoneForDisplay(guestSession.phone),
        action: action === 'remove' ? 'remove' : 'add',
      });
    }

    res.json({
      success: true,
      data: { reactions },
    });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /api/public-chat/:propertyId/messages/:messageId
 * Edit a message (only own messages, within 15 minutes)
 */
router.put('/:propertyId/messages/:messageId', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { messageId } = req.params;
    const { content } = req.body;
    const guestSession = (req as any).guestSession as GuestSession;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required',
      });
    }

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    // Find message
    const message = await TeamMessage.findByPk(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Check if it's the owner's message
    if (message.senderPhone !== guestSession.phone) {
      return res.status(403).json({
        success: false,
        error: 'You can only edit your own messages',
      });
    }

    // Check if within 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (new Date(message.createdAt) < fifteenMinutesAgo) {
      return res.status(403).json({
        success: false,
        error: 'Messages can only be edited within 15 minutes',
      });
    }

    // Update message
    const editedAt = new Date();
    await message.update({
      content: content.trim(),
      metadata: {
        ...message.metadata,
        editedAt,
        originalContent: message.metadata?.originalContent || message.content,
      },
    });

    // Broadcast edit
    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (conversation) {
      await supabaseRealtimeService.broadcastMessageEdit(
        conversation.id,
        messageId,
        content.trim(),
        editedAt
      );
    }

    res.json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/public-chat/:propertyId/messages/:messageId
 * Delete a message (only own messages, within 15 minutes)
 */
router.delete('/:propertyId/messages/:messageId', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { messageId } = req.params;
    const guestSession = (req as any).guestSession as GuestSession;

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    // Find message
    const message = await TeamMessage.findByPk(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    // Check if it's the owner's message
    if (message.senderPhone !== guestSession.phone) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own messages',
      });
    }

    // Check if within 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (new Date(message.createdAt) < fifteenMinutesAgo) {
      return res.status(403).json({
        success: false,
        error: 'Messages can only be deleted within 15 minutes',
      });
    }

    const conversationId = message.conversationId;

    // Soft delete - mark as deleted
    await message.update({
      content: '[Message deleted]',
      metadata: {
        ...message.metadata,
        deletedAt: new Date(),
        deletedBy: guestSession.id,
      },
    });

    // Broadcast deletion
    await supabaseRealtimeService.broadcastMessageDelete(conversationId, messageId);

    res.json({
      success: true,
      message: 'Message deleted',
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/public-chat/:propertyId/report
 * Report a message or user
 */
router.post('/:propertyId/report', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { messageId, userId, reason, details } = req.body;
    const guestSession = (req as any).guestSession as GuestSession;

    if (!messageId && !userId) {
      return res.status(400).json({
        success: false,
        error: 'Must provide messageId or userId to report',
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Report reason is required',
      });
    }

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
      });
    }

    // Store report in conversation metadata
    const metadata = conversation.metadata || {};
    const reports = metadata.reports || [];
    reports.push({
      id: `report_${Date.now()}`,
      messageId,
      reportedUserId: userId,
      reportedBy: guestSession.id,
      reporterName: guestSession.name || formatPhoneForDisplay(guestSession.phone),
      reason,
      details,
      createdAt: new Date(),
      status: 'pending',
    });
    await conversation.update({ metadata: { ...metadata, reports } });

    // Notify admins via notification service
    try {
      if (notificationService) {
        notificationService.emit('public_chat_report', {
          propertyId,
          conversationId: conversation.id,
          report: reports[reports.length - 1],
        });
      }
    } catch (err) {
      console.error('Failed to notify about report:', err);
    }

    res.json({
      success: true,
      message: 'Report submitted successfully',
    });
  } catch (error) {
    console.error('Error submitting report:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/public-chat/:propertyId/block
 * Block a user from this chat
 */
router.post('/:propertyId/block', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { userId } = req.body;
    const guestSession = (req as any).guestSession as GuestSession;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    // Can't block yourself
    if (userId === guestSession.id) {
      return res.status(400).json({
        success: false,
        error: 'You cannot block yourself',
      });
    }

    // Check property access
    if (!guestSession.hasPropertyAccess(propertyId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this property chat',
      });
    }

    // Add to blocked users in guest session
    const blockedUsers = guestSession.metadata?.blockedUsers || [];
    if (!blockedUsers.includes(userId)) {
      blockedUsers.push(userId);
      await guestSession.update({
        metadata: {
          ...guestSession.metadata,
          blockedUsers,
        },
      });
    }

    res.json({
      success: true,
      message: 'User blocked successfully',
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/public-chat/:propertyId/block/:userId
 * Unblock a user
 */
router.delete('/:propertyId/block/:userId', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const guestSession = (req as any).guestSession as GuestSession;

    // Remove from blocked users
    const blockedUsers = guestSession.metadata?.blockedUsers || [];
    const newBlockedUsers = blockedUsers.filter((id: string) => id !== userId);
    await guestSession.update({
      metadata: {
        ...guestSession.metadata,
        blockedUsers: newBlockedUsers,
      },
    });

    res.json({
      success: true,
      message: 'User unblocked',
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/public-chat/:propertyId/blocked
 * Get blocked users list
 */
router.get('/:propertyId/blocked', authenticateGuest, async (req: Request, res: Response) => {
  try {
    const guestSession = (req as any).guestSession as GuestSession;
    const blockedUsers = guestSession.metadata?.blockedUsers || [];

    res.json({
      success: true,
      data: blockedUsers,
    });
  } catch (error) {
    console.error('Error getting blocked users:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ===== ADMIN MODERATION ROUTES =====
// These routes require JWT authentication (team members)

/**
 * Middleware to authenticate team member for admin routes
 */
async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Admin authentication required',
    });
  }

  try {
    const token = authHeader.split(' ')[1];
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    (req as any).adminUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired admin token',
    });
  }
}

/**
 * GET /api/public-chat/:propertyId/admin/reports
 * Get all reports for a property chat (admin only)
 */
router.get('/:propertyId/admin/reports', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { status } = req.query;

    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
      });
    }

    let reports = conversation.metadata?.reports || [];

    // Filter by status if provided
    if (status) {
      reports = reports.filter((r: any) => r.status === status);
    }

    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    console.error('Error getting reports:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /api/public-chat/:propertyId/admin/reports/:reportId
 * Update report status (admin only)
 */
router.put('/:propertyId/admin/reports/:reportId', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { reportId } = req.params;
    const { status, resolution } = req.body;

    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
      });
    }

    const metadata = conversation.metadata || {};
    const reports = metadata.reports || [];
    const reportIndex = reports.findIndex((r: any) => r.id === reportId);

    if (reportIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    reports[reportIndex] = {
      ...reports[reportIndex],
      status,
      resolution,
      resolvedAt: new Date(),
      resolvedBy: (req as any).adminUser.id,
    };

    await conversation.update({ metadata: { ...metadata, reports } });

    res.json({
      success: true,
      data: reports[reportIndex],
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/public-chat/:propertyId/admin/messages/:messageId
 * Admin delete any message
 */
router.delete('/:propertyId/admin/messages/:messageId', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { messageId } = req.params;
    const { reason } = req.body;
    const adminUser = (req as any).adminUser;

    const message = await TeamMessage.findByPk(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    const conversationId = message.conversationId;

    // Soft delete with admin metadata
    await message.update({
      content: '[Message removed by moderator]',
      metadata: {
        ...message.metadata,
        deletedAt: new Date(),
        deletedBy: adminUser.id,
        deletedByAdmin: true,
        deleteReason: reason || 'Violated community guidelines',
      },
    });

    // Broadcast deletion
    await supabaseRealtimeService.broadcastMessageDelete(conversationId, messageId);

    res.json({
      success: true,
      message: 'Message deleted by admin',
    });
  } catch (error) {
    console.error('Error admin deleting message:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/public-chat/:propertyId/admin/ban
 * Ban a user from a property chat (admin only)
 */
router.post('/:propertyId/admin/ban', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { guestSessionId, reason, duration } = req.body;
    const adminUser = (req as any).adminUser;

    if (!guestSessionId) {
      return res.status(400).json({
        success: false,
        error: 'Guest session ID is required',
      });
    }

    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
      });
    }

    // Add to banned users in conversation metadata
    const metadata = conversation.metadata || {};
    const bannedUsers = metadata.bannedUsers || [];

    const expiresAt = duration
      ? new Date(Date.now() + duration * 60 * 60 * 1000) // duration in hours
      : null; // permanent

    bannedUsers.push({
      guestSessionId,
      bannedAt: new Date(),
      bannedBy: adminUser.id,
      reason,
      expiresAt,
    });

    await conversation.update({ metadata: { ...metadata, bannedUsers } });

    // Remove from participants
    const newParticipants = conversation.participantIds.filter(
      (id) => id !== guestSessionId
    );
    await conversation.update({ participantIds: newParticipants });

    res.json({
      success: true,
      message: 'User banned from chat',
    });
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/public-chat/:propertyId/admin/ban/:guestSessionId
 * Unban a user (admin only)
 */
router.delete('/:propertyId/admin/ban/:guestSessionId', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);
    const { guestSessionId } = req.params;

    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
      });
    }

    const metadata = conversation.metadata || {};
    const bannedUsers = (metadata.bannedUsers || []).filter(
      (b: any) => b.guestSessionId !== guestSessionId
    );

    await conversation.update({ metadata: { ...metadata, bannedUsers } });

    res.json({
      success: true,
      message: 'User unbanned',
    });
  } catch (error) {
    console.error('Error unbanning user:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/public-chat/:propertyId/admin/banned
 * Get list of banned users (admin only)
 */
router.get('/:propertyId/admin/banned', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId);

    const conversation = await TeamConversation.getPublicForProperty(propertyId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
      });
    }

    const bannedUsers = conversation.metadata?.bannedUsers || [];

    res.json({
      success: true,
      data: bannedUsers,
    });
  } catch (error) {
    console.error('Error getting banned users:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * Format phone number for display (hide middle digits)
 */
function formatPhoneForDisplay(phone: string): string {
  if (phone.length < 6) return phone;
  const last4 = phone.slice(-4);
  const first3 = phone.slice(0, 3);
  return `${first3}***${last4}`;
}

export default router;
