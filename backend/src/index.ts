// Early startup logging
import { logger } from './services/LoggerService';
logger.info('Dispotree Backend starting...', { phase: 'startup' });
logger.info(`Environment: ${process.env.NODE_ENV}`, { phase: 'startup' });
logger.info(`Port: ${process.env.PORT || 3001}`, { phase: 'startup' });

import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './config/auth';
import { corsOptions } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/healthRoutes';
import aiRoutes from './routes/aiRoutes';
import agentRoutes from './routes/agentRoutes';
import knowledgeRoutes from './routes/knowledgeRoutes';
import documentRoutes from './routes/documentRoutes';
// Auth routes handled by Better Auth at /api/auth/*
import settingsRoutes from './routes/settingsRoutes';
import openaiRoutes from './routes/openaiRoutes';
import webhookRoutes from './routes/webhookRoutes';
import paymentRoutes from './routes/paymentRoutes';
import contactRoutes from './routes/contactRoutes';
import adminTrackingRoutes from './routes/adminTrackingRoutes';
import emailClientRoutes from './routes/emailClientRoutes';
import teamChatRoutes from './routes/teamChatRoutes';
import pushRoutes from './routes/pushRoutes';
import auditLogRoutes from './routes/auditLogRoutes';
import permissionRoutes from './routes/permissionRoutes';
import taskRoutes from './routes/taskRoutes';
import reminderRoutes from './routes/reminderRoutes';
import projectRoutes from './routes/projectRoutes';
import githubRoutes from './routes/githubRoutes';
import webhookManagementRoutes from './routes/webhookManagementRoutes';
import activityFeedRoutes from './routes/activityFeedRoutes';
import voiceRoutes from './routes/voiceRoutes';
import conversationRoutes from './routes/conversationRoutes';
import entitySearchRoutes from './routes/entitySearchRoutes';
import teamMemberRoutes from './routes/teamMemberRoutes';
import calendarRoutes from './routes/calendarRoutes';
import templateAdminRoutes from './routes/templateAdminRoutes';
import setupRoutes from './routes/setupRoutes';
import userRoutes from './routes/userRoutes';
import homeAssistantRoutes from './routes/homeAssistantRoutes';
import codingTaskRoutes from './routes/codingTaskRoutes';
import spritesRoutes from './routes/spritesRoutes';
import spriteTasksRoutes from './routes/spriteTasksRoutes';
import deployHooksRoutes from './routes/deployHooksRoutes';
import githubWebhookRoutes from './routes/githubWebhookRoutes';
import redditRoutes from './routes/redditRoutes';
import clientPortalRoutes from './routes/clientPortalRoutes';
import publicApiRoutes from './routes/publicApiRoutes';
import apiKeyRoutes from './routes/apiKeyRoutes';
// Voice calling module (Twilio + OpenAI Realtime)
import { twilioRoutes as voiceTwilioRoutes, callRoutes as voiceCallRoutes, handleTwilioConnection, closeAllSessions as closeVoiceSessions } from './voice';
import { syncDatabase, sequelize } from './models';
import { stripeService } from './services/StripeService';
import { notificationService } from './services/NotificationService';
import { supabaseRealtimeService } from './services/SupabaseRealtimeService';
import { agentService } from './services/agentService';
import { emailPasswordEncryption } from './utils/emailPasswordEncryption';
import { initializeKnowledgeSystem } from './services/knowledge';
import { settingsService } from './services/settingsService';
import { redisService } from './services/RedisService';
import { memoryService } from './services/MemoryService';
import { taskService } from './services/TaskService';
import { projectService } from './services/ProjectService';
import { gitHubService } from './services/GitHubService';
import { projectContactService } from './services/ProjectContactService';
import { projectNoteService } from './services/ProjectNoteService';
import { projectRecapService } from './services/ProjectRecapService';
import { codingTaskService } from './services/CodingTaskService';
import { conversationTitleService } from './services/ConversationTitleService';
import { scheduledTaskScheduler } from './services/ScheduledTaskScheduler';
import { reminderScheduler } from './services/ReminderScheduler';
import { notificationScheduler } from './services/NotificationScheduler';
import { emailSyncScheduler } from './services/EmailSyncScheduler';
import { pushNotificationService } from './services/PushNotificationService';
import { spritesService } from './services/SpritesService';
import { spritesWebSocketProxy } from './services/SpritesWebSocketProxy';
import { tvRemoteWebSocketService } from './services/TVRemoteWebSocketService';
import { githubSyncWebSocketService } from './services/GitHubSyncWebSocketService';
import { teamCommunicationService } from './services/TeamCommunicationService';
import { calendarIntegrationService } from './services/agent/CalendarIntegrationService';
import { realtimeVoiceService } from './services/RealtimeVoiceService';
import { entitySearchService } from './services/EntitySearchService';
import { homeAssistantService } from './services/HomeAssistantService';
import { elevenLabsService } from './services/ElevenLabsService';
import setupSwagger from './config/swagger';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import jwt from 'jsonwebtoken';

dotenv.config();

// =============================================================================
// GLOBAL ERROR HANDLERS - Critical for production stability
// =============================================================================
// These handlers prevent the process from crashing silently on unhandled errors

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.fatal('Unhandled Promise Rejection', { promise: String(promise) }, reason);
  // Log to external monitoring service in production (e.g., Sentry, DataDog)
  // In production, you may want to gracefully shutdown after logging
});

process.on('uncaughtException', (error: Error) => {
  logger.fatal('Uncaught Exception - Process will exit', {}, error);
  // Log to external monitoring service in production
  // Uncaught exceptions leave the process in an undefined state - must exit
  process.exit(1);
});

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Trust proxy for production (Fly.io, Railway, etc.)
// This is required for rate limiting and getting correct client IPs
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', true);
}

// Skip all Express middleware for WebSocket upgrade paths
// These are handled directly by the HTTP server's 'upgrade' event
app.use((req, res, next) => {
  if (req.url.startsWith('/ws/')) {
    // Don't process WebSocket requests through Express middleware
    // The upgrade event handler will take care of these
    return;
  }
  next();
});

// CORS must be applied before Better Auth handler
app.use(corsOptions);

// Better Auth handler - MUST be mounted before express.json()
app.all('/api/auth/*', toNodeHandler(auth));

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "http://localhost:3001"],
    },
  },
}));
// Capture raw body for webhook signature verification
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => {
    // Store raw body for webhook signature verification
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));

// Health check routes - MUST be before authenticated routes
app.use('/api/health', healthRoutes);
app.use('/api/setup', setupRoutes); // First-run setup (no auth required)

// Routes
// Note: /api/auth/* routes are handled by Better Auth mounted above
app.use('/api/ai', aiRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/voice', voiceRoutes);
// Voice calling routes (Twilio + OpenAI Realtime)
app.use('/voice/twilio', voiceTwilioRoutes); // Twilio webhooks (no /api prefix for Twilio callbacks)
app.use('/voice/calls', voiceCallRoutes); // Call management API
app.use('/api/conversations', conversationRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/webhooks/github', githubWebhookRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/admin/tracking', adminTrackingRoutes);
app.use('/api/admin/templates', templateAdminRoutes);
app.use('/api/email-client', emailClientRoutes);
app.use('/api/team-chat', teamChatRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/webhooks/manage', webhookManagementRoutes);
app.use('/api/activity-feed', activityFeedRoutes);
app.use('/api/entity-search', entitySearchRoutes);
app.use('/api/team', teamMemberRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/home-assistant', homeAssistantRoutes);
app.use('/api/coding-tasks', codingTaskRoutes);
app.use('/api/sprites', spritesRoutes);
app.use('/api/sprite-tasks', spriteTasksRoutes);
app.use('/api/deploy-hooks', deployHooksRoutes);
app.use('/api/reddit', redditRoutes);
app.use('/api/client', clientPortalRoutes);
app.use('/api/api-keys', apiKeyRoutes); // API key management (JWT auth)
app.use('/api/v1', publicApiRoutes); // Public API (API key auth)
app.use('/api', documentRoutes);

// OpenAI-compatible endpoints (for OpenWebUI, LangChain, etc.)
app.use('/v1', openaiRoutes);

// Serve uploaded documents
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Serve public static files (chat UI, etc.)
app.use(express.static(path.join(process.cwd(), 'public')));

// Root endpoint
/**
 * @swagger
 * /:
 *   get:
 *     summary: API root information
 *     description: Returns API information and available endpoints
 *     tags: [General]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: CodeLive Backend API
 *                 version:
 *                   type: string
 *                   example: 2.0.0
 */
app.get('/', (req, res) => {
  res.json({
    message: 'CodeLive Backend API',
    version: '2.0.0',
    documentation: '/api-docs',
    endpoints: {
      health: '/api/health',
      ai: '/api/ai',
      agent: '/api/agent',
      knowledge: '/api/knowledge',
      documents: '/api/documents',
      tasks: '/api/tasks',
      reminders: '/api/reminders',
      projects: '/api/projects',
      sprites: '/api/sprites',
      spriteTasks: '/api/sprite-tasks',
      teamChat: '/api/team-chat',
      calendar: '/api/calendar',
      docs: '/api-docs'
    },
    openaiCompatible: {
      models: '/v1/models',
      chatCompletions: '/v1/chat/completions',
      health: '/v1/health',
      description: 'OpenAI-compatible API for OpenWebUI, LangChain, and other clients'
    },
    features: {
      aiAgents: 'AI-powered coding assistants with Claude integration',
      sprites: 'Containerized development environments (Sprites)',
      spriteTasks: 'Task queue for automated code changes',
      knowledgeBase: 'RAG-powered document knowledge base with semantic search',
      deployHooks: 'Automatic deployment triggers on task completion'
    }
  });
});

// Initialize server
const startServer = async () => {
  try {
    // Setup Swagger documentation (async for ESM compatibility)
    // Must be done before 404 handler is registered
    try {
      await setupSwagger(app);
      logger.info('Swagger documentation initialized');
    } catch (swaggerError) {
      logger.warn('Swagger setup failed', {}, swaggerError);
    }

    // 404 handler - must be registered after async routes
    app.use(notFoundHandler);

    // Error handling middleware (SECURITY: sanitizes error messages in production)
    app.use(errorHandler);

    // Try to connect to database (associations are loaded when models are imported)
    try {
      await sequelize.authenticate();
      logger.info('Database connection established');

      // Skip sync in production for faster startup (tables already exist)
      // Use SKIP_DB_SYNC=true to skip, SKIP_DB_SYNC=false to force sync
      // In production, defaults to skip unless SKIP_DB_SYNC=false
      const forceSync = process.env.SKIP_DB_SYNC === 'false';
      const skipSync = process.env.SKIP_DB_SYNC === 'true' || (!forceSync && process.env.NODE_ENV === 'production');

      if (skipSync) {
        logger.info('Skipping database sync (production mode)');
      } else {
        logger.info('Syncing database models (this may take a moment)...');
        await sequelize.sync({ alter: true });
        logger.info('Database models synchronized');
      }

    } catch (dbError) {
      logger.warn('Database connection failed, server running without database', {}, dbError);
    }

    // Initialize Redis cache
    try {
      await redisService.connect();
      const stats = await redisService.getStats();
      if (stats.connected) {
        logger.info('Redis connected', { keys: stats.keys, memory: stats.memory });
      } else {
        logger.warn('Redis not available, using in-memory fallback cache');
      }
    } catch (redisError) {
      logger.warn('Redis initialization failed, using in-memory fallback', {}, redisError);
    }

    // Initialize Settings Service
    try {
      await settingsService.initialize();
    } catch (settingsError) {
      logger.warn('Settings Service initialization failed', {}, settingsError);
    }

    // Initialize Email Password Encryption
    try {
      emailPasswordEncryption.initialize();
      if (emailPasswordEncryption.isAvailable()) {
        logger.info('Email Password Encryption initialized');
      } else {
        logger.warn('Email Password Encryption disabled (missing EMAIL_ENCRYPTION_KEY)');
      }
    } catch (emailEncryptionError) {
      logger.warn('Email Password Encryption initialization failed', {}, emailEncryptionError);
    }

    // Initialize Permission Service
    try {
      const { permissionService } = await import('./services/PermissionService');
      await permissionService.initialize();
      logger.info('Permission Service initialized successfully');
    } catch (permissionError) {
      logger.warn('Permission Service initialization failed', {}, permissionError);
    }

    // Initialize Task Service (workflow rules, task logic)
    try {
      await taskService.initialize();
      logger.info('Task Service initialized successfully');
    } catch (taskError) {
      logger.warn('Task Service initialization failed', {}, taskError);
    }

    // Initialize Project Services
    try {
      await projectService.initialize();
      await projectContactService.initialize();
      await projectNoteService.initialize();
      await projectRecapService.initialize();
      await gitHubService.initialize();
      await codingTaskService.initialize();
      logger.info('Project Services initialized successfully');
    } catch (projectError) {
      logger.warn('Project Services initialization failed', {}, projectError);
    }

    // Initialize AI Agent (Admin - full access)
    try {
      await agentService.initialize();
    } catch (agentError) {
      logger.warn('AI Agent initialization failed', {}, agentError);
    }

    // Initialize Knowledge Base (RAG)
    try {
      const knowledgeEnabled = process.env.KNOWLEDGE_ENABLED !== 'false';
      if (knowledgeEnabled) {
        const loadDefaults = process.env.KNOWLEDGE_LOAD_DEFAULTS !== 'false';
        const watcherEnabled = process.env.KNOWLEDGE_WATCHER_ENABLED !== 'false';
        const knowledgeFolder = watcherEnabled
          ? process.env.KNOWLEDGE_FOLDER || './knowledge'
          : undefined;

        await initializeKnowledgeSystem(knowledgeFolder, loadDefaults);
        logger.info('Knowledge Base initialized successfully');
      } else {
        logger.warn('Knowledge Base disabled (KNOWLEDGE_ENABLED=false)');
      }
    } catch (knowledgeError) {
      logger.warn('Knowledge Base initialization failed (RAG features may be limited)', {}, knowledgeError);
    }

    // Initialize Long-term Memory Service
    try {
      await memoryService.initialize();
      if (memoryService.isReady()) {
        logger.info('Memory Service initialized successfully');
      } else {
        logger.warn('Memory Service disabled (missing API keys)');
      }
    } catch (memoryError) {
      logger.warn('Memory Service initialization failed (long-term memory disabled)', {}, memoryError);
    }

    // Initialize Entity Search Service (semantic search for contacts/properties)
    try {
      await entitySearchService.initialize();
      if (entitySearchService.isReady()) {
        logger.info('Entity Search Service initialized (semantic search enabled)');
        // Trigger an incremental sync of recently updated entities
        entitySearchService.incrementalSync(60 * 24).catch((err) => {
          logger.warn('Entity Search incremental sync failed', {}, err);
        });
      } else {
        logger.warn('Entity Search Service disabled (missing PINECONE_API_KEY or OPENAI_API_KEY)');
      }
    } catch (entitySearchError) {
      logger.warn('Entity Search Service initialization failed', {}, entitySearchError);
    }

    // Initialize Conversation Title Service
    try {
      await conversationTitleService.initialize();
      if (conversationTitleService.isReady()) {
        logger.info('Conversation Title Service initialized successfully');
      }
    } catch (titleError) {
      logger.warn('Conversation Title Service initialization failed', {}, titleError);
    }

    // Initialize Stripe Service
    try {
      await stripeService.initialize();
      if (stripeService.isReady()) {
        logger.info('Stripe Service initialized successfully');
      } else {
        logger.warn('Stripe Service disabled (missing STRIPE_SECRET_KEY)');
      }
    } catch (stripeError) {
      logger.warn('Stripe Service initialization failed', {}, stripeError);
    }

    // Initialize ElevenLabs TTS Service
    try {
      await elevenLabsService.initialize();
      if (elevenLabsService.isConfigured()) {
        logger.info('ElevenLabs TTS Service initialized');
      } else {
        logger.warn('ElevenLabs TTS Service disabled (missing ELEVENLABS_API_KEY)');
      }
    } catch (elevenLabsError) {
      logger.warn('ElevenLabs TTS Service initialization failed', {}, elevenLabsError);
    }

    // Initialize Team Communication Service
    try {
      teamCommunicationService.initialize();
      logger.info('Team Communication Service initialized');
    } catch (teamChatError) {
      logger.warn('Team Communication Service initialization failed', {}, teamChatError);
    }

    // Initialize Calendar Integration Service
    try {
      await calendarIntegrationService.initialize();
      if (calendarIntegrationService.isConfigured()) {
        logger.info('Calendar Integration Service initialized');
      } else {
        logger.warn('Calendar Integration Service disabled (missing Google credentials)');
      }
    } catch (calendarError) {
      logger.warn('Calendar Integration Service initialization failed', {}, calendarError);
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('Server started', {
        port: PORT,
        env: process.env.NODE_ENV,
        api: `http://localhost:${PORT}`,
        docs: `http://localhost:${PORT}/api-docs`,
      });
    });

    // Initialize Realtime Voice WebSocket Service FIRST (before other WS services)
    // This must be registered before other WebSocket servers to handle the upgrade properly
    try {
      const voiceWss = new WebSocketServer({ noServer: true });

      voiceWss.on('connection', async (ws: WebSocket, req: any, userId: string) => {
        await realtimeVoiceService.handleConnection(ws, req, userId);
      });

      // Handle upgrade requests for /ws/voice FIRST before other WebSocket servers
      // This handler is registered first to ensure voice connections are handled properly
      server.prependListener('upgrade', async (request: any, socket: any, head: any) => {
        const { pathname, query } = parseUrl(request.url || '', true);

        // Only handle /ws/voice, let other handlers deal with other paths
        if (pathname !== '/ws/voice') {
          return; // Let other WebSocket servers handle this
        }

        // Mark as handled to prevent other handlers from processing
        request._voiceHandled = true;

        logger.info('Voice WebSocket upgrade request received', { pathname });

        // Authenticate via query parameter token
        const token = query.token as string;
        if (!token) {
          logger.warn('Voice WebSocket: No token provided');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        try {
          // Try Supabase token verification first (for browser clients)
          // Use supabaseAdmin (service role) to verify tokens from other sessions
          const { supabaseAdmin } = await import('./config/supabase');
          const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

          if (error) {
            logger.warn('Voice WebSocket: Supabase token verification failed', { error: error.message });
          }

          if (user && !error) {
            // Supabase token valid
            logger.info('Voice WebSocket: Supabase auth successful', { userId: user.id });
            voiceWss.handleUpgrade(request, socket, head, (ws) => {
              logger.info('Voice WebSocket: Upgrade complete');
              voiceWss.emit('connection', ws, request, user.id);
            });
            return;
          }

          // Fall back to JWT verification (for server-to-server or test tokens)
          try {
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
              logger.warn('Voice WebSocket: JWT_SECRET not configured; JWT fallback disabled');
              socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
              socket.destroy();
              return;
            }

            const decoded = jwt.verify(token, jwtSecret) as any;
            const userId = decoded.userId || decoded.id || decoded.sub;
            logger.info('Voice WebSocket: JWT auth successful', { userId });

            voiceWss.handleUpgrade(request, socket, head, (ws) => {
              logger.info('Voice WebSocket: Upgrade complete');
              voiceWss.emit('connection', ws, request, userId);
            });
          } catch (jwtErr) {
            logger.warn('Voice WebSocket: Both Supabase and JWT auth failed');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
          }
        } catch (err) {
          logger.warn('Realtime Voice WebSocket auth failed', {}, err);
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
        }
      });

      logger.info('Realtime Voice WebSocket Service initialized', { path: '/ws/voice' });
    } catch (voiceWsError) {
      logger.warn('Realtime Voice WebSocket Service initialization failed', {}, voiceWsError);
    }

    // Initialize Twilio Voice WebSocket Bridge (for voice calling module)
    try {
      const twilioVoiceWss = new WebSocketServer({ noServer: true });

      twilioVoiceWss.on('connection', async (ws: WebSocket, req: any, callId: string | null) => {
        logger.info('Twilio Voice WebSocket connection', { callId: callId || 'pending' });
        handleTwilioConnection(ws, callId);
      });

      // Handle upgrade requests for /voice/ws/twilio
      server.on('upgrade', async (request: any, socket: any, head: any) => {
        const { pathname, query } = parseUrl(request.url || '', true);

        // Only handle /voice/ws/twilio
        if (pathname !== '/voice/ws/twilio') {
          return; // Let other handlers deal with this
        }

        logger.info('Twilio Voice WebSocket upgrade request', { pathname, query });

        // Note: Twilio strips query parameters from WebSocket URLs.
        // The callId and token are passed via Stream Parameters and will be
        // available in the Twilio "start" event's customParameters.
        // We accept all connections here and validate in the bridge.

        // Twilio connections are authenticated by Twilio's signature on the HTTP webhook requests
        twilioVoiceWss.handleUpgrade(request, socket, head, (ws) => {
          logger.info('Twilio Voice WebSocket: Upgrade complete');
          twilioVoiceWss.emit('connection', ws, request, null); // callId will come from Twilio's start event
        });
      });

      logger.info('Twilio Voice WebSocket Bridge initialized', { path: '/voice/ws/twilio' });
    } catch (twilioWsError) {
      logger.warn('Twilio Voice WebSocket Bridge initialization failed', {}, twilioWsError);
    }

    // Initialize WebSocket Notification Service
    try {
      notificationService.initialize(server);
      logger.info('WebSocket Notification Service initialized', { path: '/ws/notifications' });
    } catch (wsError) {
      logger.warn('WebSocket Notification Service initialization failed', {}, wsError);
    }

    // Initialize Supabase Realtime Service
    try {
      await supabaseRealtimeService.initialize();
      logger.info('Supabase Realtime Service initialized');
    } catch (supabaseError) {
      logger.warn('Supabase Realtime Service initialization failed', {}, supabaseError);
    }

    // Initialize Push Notification Service
    try {
      await pushNotificationService.initialize();
    } catch (pushError) {
      logger.warn('Push Notification Service initialization failed', {}, pushError);
    }

    // Initialize Sprites Service and WebSocket Proxy
    try {
      spritesService.initialize();
      spritesWebSocketProxy.initialize(server);
      logger.info('Sprites Service and WebSocket Proxy initialized', { path: '/ws/sprites' });
    } catch (spritesError) {
      logger.warn('Sprites Service initialization failed', {}, spritesError);
    }

    // Initialize TV Remote WebSocket Service (iPad ↔ TV communication)
    try {
      tvRemoteWebSocketService.initialize(server);
      logger.info('TV Remote WebSocket Service initialized', { path: '/ws/tv-remote' });
    } catch (tvRemoteError) {
      logger.warn('TV Remote WebSocket Service initialization failed', {}, tvRemoteError);
    }

    // Initialize GitHub Sync WebSocket Service (real-time sync notifications)
    try {
      githubSyncWebSocketService.initialize(server);
      logger.info('GitHub Sync WebSocket Service initialized', { path: '/ws/github-sync' });
    } catch (githubSyncError) {
      logger.warn('GitHub Sync WebSocket Service initialization failed', {}, githubSyncError);
    }

    // Initialize Home Assistant Service (smart home control)
    try {
      await homeAssistantService.initialize();
      logger.info('Home Assistant Service initialized');
    } catch (haError) {
      logger.warn('Home Assistant Service initialization failed', {}, haError);
    }

    // Start User Reminder Scheduler
    try {
      await reminderScheduler.initialize();
      reminderScheduler.start('* * * * *'); // Every minute
      logger.info('Reminder Scheduler started', { schedule: 'every minute' });
    } catch (schedulerError) {
      logger.warn('Reminder Scheduler initialization failed', {}, schedulerError);
    }

    // Start Scheduled Task Scheduler (agent reminders/reports/actions)
    try {
      scheduledTaskScheduler.start('* * * * *'); // Every minute
      logger.info('Scheduled Task Scheduler started', { schedule: 'every minute' });
    } catch (schedulerError) {
      logger.warn('Scheduled Task Scheduler initialization failed', {}, schedulerError);
    }

    // Start Notification Scheduler (daily/weekly digests)
    try {
      await notificationScheduler.initialize();
      logger.info('Notification Scheduler started', { schedule: 'daily 8AM, weekly Monday 8AM' });
    } catch (notifError) {
      logger.warn('Notification Scheduler initialization failed', {}, notifError);
    }

    // Start Email Sync Scheduler (automatic IMAP sync)
    try {
      emailSyncScheduler.initialize();
      const syncInterval = process.env.EMAIL_SYNC_INTERVAL_MINUTES || '10';
      emailSyncScheduler.start(`*/${syncInterval} * * * *`);
      logger.info('Email Sync Scheduler started', { schedule: `every ${syncInterval} minutes` });
    } catch (emailSyncError) {
      logger.warn('Email Sync Scheduler initialization failed', {}, emailSyncError);
    }

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });

      try {
        // Shutdown notification service (WebSocket)
        notificationService.shutdown();

        // Shutdown TV Remote WebSocket service
        tvRemoteWebSocketService.shutdown();

        // Close voice calling sessions
        await closeVoiceSessions();

        // Stop scheduled task scheduler
        scheduledTaskScheduler.stop();

        // Stop notification scheduler
        notificationScheduler.stop();

        // Stop email sync scheduler
        emailSyncScheduler.stop();

        // Close database connections
        await sequelize.close();
        logger.info('Database connections closed');

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', {}, error);
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.fatal('Unable to start server', {}, error);
    process.exit(1);
  }
};

startServer();
