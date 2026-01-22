// Early startup logging
import { logger } from './services/LoggerService';
logger.info('Dispotree Backend starting...', { phase: 'startup' });
logger.info(`Environment: ${process.env.NODE_ENV}`, { phase: 'startup' });
logger.info(`Port: ${process.env.PORT || 3001}`, { phase: 'startup' });

import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { corsOptions } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/healthRoutes';
import propertyRoutes from './routes/propertyRoutes';
import propertyChecklistRoutes from './routes/propertyChecklistRoutes';
import xomeRoutes from './routes/xomeRoutes';
import hedgeFundRoutes from './routes/hedgeFundRoutes';
import aiRoutes from './routes/aiRoutes';
import pluginRoutes from './routes/pluginRoutes';
import marketplaceRoutes from './routes/marketplaceRoutes';
import agentRoutes from './routes/agentRoutes';
import mlRoutes from './routes/mlRoutes';
import knowledgeRoutes from './routes/knowledgeRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import documentRoutes from './routes/documentRoutes';
import authRoutes from './routes/authRoutes';
import marketDataRoutes from './routes/marketDataRoutes';
import settingsRoutes from './routes/settingsRoutes';
import openaiRoutes from './routes/openaiRoutes';
import pipelineRoutes from './routes/pipelineRoutes';
import portfolioRoutes from './routes/portfolioRoutes';
import webhookRoutes from './routes/webhookRoutes';
import complianceRoutes from './routes/complianceRoutes';
import stateComplianceRoutes from './routes/stateComplianceRoutes';
import proxyPicsRoutes from './routes/proxyPicsRoutes';
import fastBuyBoxRoutes from './routes/fastBuyBoxRoutes';
import proxyPicsWebhook from './routes/proxyPicsWebhook';
import paymentRoutes from './routes/paymentRoutes';
import deadLetterRoutes from './routes/deadLetterRoutes';
import followUpRoutes from './routes/followUpRoutes';
import contractRoutes from './routes/contractRoutes';
import brokerRoutes from './routes/brokerRoutes';
import brokerMSARoutes from './routes/brokerMSARoutes';
import contactRoutes from './routes/contactRoutes';
import signatureRoutes from './routes/signatureRoutes';
import buyerRoutes from './routes/buyerRoutes';
import publicRoutes from './routes/publicRoutes';
import inquiryRoutes from './routes/inquiryRoutes';
import buyerAgentRoutes from './routes/buyerAgentRoutes';
import sellerAgentRoutes from './routes/sellerAgentRoutes';
import adminTrackingRoutes from './routes/adminTrackingRoutes';
import emailClientRoutes from './routes/emailClientRoutes';
import teamChatRoutes from './routes/teamChatRoutes';
import publicChatRoutes from './routes/publicChatRoutes';
import complianceSpecRoutes from './routes/complianceSpecRoutes';
import pushRoutes from './routes/pushRoutes';
import auditLogRoutes from './routes/auditLogRoutes';
import permissionRoutes from './routes/permissionRoutes';
import taskRoutes from './routes/taskRoutes';
import reminderRoutes from './routes/reminderRoutes';
import projectRoutes from './routes/projectRoutes';
import githubRoutes from './routes/githubRoutes';
import webhookManagementRoutes from './routes/webhookManagementRoutes';
import activityFeedRoutes from './routes/activityFeedRoutes';
import importWizardRoutes from './routes/importWizardRoutes';
import voiceRoutes from './routes/voiceRoutes';
import conversationRoutes from './routes/conversationRoutes';
import entitySearchRoutes from './routes/entitySearchRoutes';
import dealNoteRoutes from './routes/dealNoteRoutes';
import teamMemberRoutes from './routes/teamMemberRoutes';
import calendarRoutes from './routes/calendarRoutes';
import templateAdminRoutes from './routes/templateAdminRoutes';
import setupRoutes from './routes/setupRoutes';
import codingTaskRoutes from './routes/codingTaskRoutes';
import spritesRoutes from './routes/spritesRoutes';
// Voice calling module (Twilio + OpenAI Realtime)
import { twilioRoutes as voiceTwilioRoutes, callRoutes as voiceCallRoutes, handleTwilioConnection, closeAllSessions as closeVoiceSessions } from './voice';
import { syncDatabase, sequelize } from './models';
import { proxyPicsService } from './services/ProxyPicsService';
import { stripeService } from './services/StripeService';
import { docuSealService } from './services/DocuSealService';
import { notificationService } from './services/NotificationService';
import { supabaseRealtimeService } from './services/SupabaseRealtimeService';
import { dealProcessingService, automationEngine } from './plugins';
import { agentService } from './services/agentService';
import { buyerAgentService } from './services/BuyerAgentService';
import { sellerAgentService } from './services/SellerAgentService';
import { inquiryService } from './services/InquiryService';
import { emailPasswordEncryption } from './utils/emailPasswordEncryption';
import { mlService } from './plugins/ml';
import { imageEmbeddingService } from './services/ImageEmbeddingService';
import { initializeKnowledgeSystem } from './services/knowledge';
import { settingsService } from './services/settingsService';
import { redisService } from './services/RedisService';
import { memoryService } from './services/MemoryService';
import { taskService } from './services/TaskService';
import { projectService } from './services/ProjectService';
import { gitHubService } from './services/GitHubService';
import { projectContactService } from './services/ProjectContactService';
import { projectNoteService } from './services/ProjectNoteService';
import { codingTaskService } from './services/CodingTaskService';
import { conversationTitleService } from './services/ConversationTitleService';
import { photoPersistenceService } from './services/PhotoPersistenceService';
import { followUpScheduler } from './services/FollowUpScheduler';
import { inquiryScheduler } from './services/InquiryScheduler';
import { seedFollowUpChains } from './seeds/seedFollowUpChains';
import { contractReminderScheduler } from './services/ContractReminderScheduler';
import { scheduledTaskScheduler } from './services/ScheduledTaskScheduler';
import { reminderScheduler } from './services/ReminderScheduler';
import { complianceWatchdogScheduler } from './services/ComplianceWatchdogScheduler';
import { offerExpirationScheduler } from './services/OfferExpirationScheduler';
import { docuSealReconciliationScheduler } from './services/DocuSealReconciliationScheduler';
import { addDocumentStatusIndex } from './scripts/addDocumentStatusIndex';
import { dealApprovalService } from './services/DealApprovalService';
import { notificationScheduler } from './services/NotificationScheduler';
import { emailSyncScheduler } from './services/EmailSyncScheduler';
import { dealProcessingWorker } from './services/DealProcessingWorker';
import { dealProcessingQueue } from './services/DealProcessingQueue';
import { pushNotificationService } from './services/PushNotificationService';
import { mlFraudPredictionService } from './services/MLFraudPredictionService';
import { fraudNetworkGraphService } from './services/FraudNetworkGraphService';
import { complianceWebSocketService } from './services/ComplianceWebSocketService';
import { spritesService } from './services/SpritesService';
import { spritesWebSocketProxy } from './services/SpritesWebSocketProxy';
import { teamCommunicationService } from './services/TeamCommunicationService';
import { complianceTriggerService } from './services/ComplianceTriggerService';
import { calendarIntegrationService } from './services/agent/CalendarIntegrationService';
import { soc2AuditLogger } from './services/SOC2AuditLogger';
import { realtimeVoiceService } from './services/RealtimeVoiceService';
import { entitySearchService } from './services/EntitySearchService';
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
app.use(corsOptions);
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
app.use('/api/auth', authRoutes);
app.use('/api/listings', propertyRoutes);
app.use('/api/listings', dealNoteRoutes); // Deal notes nested under listings
app.use('/api/properties', propertyChecklistRoutes); // Property checklist routes
app.use('/api/xome', xomeRoutes);
app.use('/api/hedgefunds', hedgeFundRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/voice', voiceRoutes);
// Voice calling routes (Twilio + OpenAI Realtime)
app.use('/voice/twilio', voiceTwilioRoutes); // Twilio webhooks (no /api prefix for Twilio callbacks)
app.use('/voice/calls', voiceCallRoutes); // Call management API
app.use('/api/conversations', conversationRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/market-data', marketDataRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/compliance-specs', complianceSpecRoutes);
app.use('/api/state-compliance', stateComplianceRoutes);
app.use('/api/proxypics', proxyPicsRoutes);
app.use('/api/webhooks/proxypics', proxyPicsWebhook);
app.use('/api/payments', paymentRoutes);
app.use('/api/fastbuybox', fastBuyBoxRoutes);
app.use('/api/dead-letters', deadLetterRoutes);
app.use('/api/follow-up', followUpRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/msa', brokerMSARoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/signatures', signatureRoutes); // Public signature upload endpoints
app.use('/api/buyers', buyerRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/buyer', buyerAgentRoutes);
app.use('/api/seller', sellerAgentRoutes);
app.use('/api/admin/tracking', adminTrackingRoutes);
app.use('/api/admin/templates', templateAdminRoutes);
app.use('/api/email-client', emailClientRoutes);
app.use('/api/team-chat', teamChatRoutes);
app.use('/api/public-chat', publicChatRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/webhooks/manage', webhookManagementRoutes);
app.use('/api/activity-feed', activityFeedRoutes);
app.use('/api/import-wizard', importWizardRoutes);
app.use('/api/entity-search', entitySearchRoutes);
app.use('/api/team', teamMemberRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/coding-tasks', codingTaskRoutes);
app.use('/api/sprites', spritesRoutes);
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
 *                   example: Dispotree Backend API
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     health:
 *                       type: string
 *                       example: /api/health
 *                     listings:
 *                       type: string
 *                       example: /api/listings
 *                     xome:
 *                       type: string
 *                       example: /api/xome
 *                     hedgefunds:
 *                       type: string
 *                       example: /api/hedgefunds
 *                     docs:
 *                       type: string
 *                       example: /api-docs
 */
app.get('/', (req, res) => {
  res.json({
    message: 'Dispotree Backend API',
    version: '2.0.0',
    documentation: '/api-docs',
    endpoints: {
      health: '/api/health',
      listings: '/api/listings',
      xome: '/api/xome',
      hedgefunds: '/api/hedgefunds',
      ai: '/api/ai',
      plugins: '/api/plugins',
      marketplace: '/api/marketplace',
      ml: '/api/ml',
      knowledge: '/api/knowledge',
      analytics: '/api/analytics',
      documents: '/api/documents',
      pipeline: '/api/pipeline',
      portfolio: '/api/portfolio',
      contracts: '/api/contracts',
      buyers: '/api/buyers',
      tasks: '/api/tasks',
      reminders: '/api/reminders',
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
    aiAgents: {
      compliance: 'Contract compliance analysis and verification',
      buybox: 'Intelligent property-to-fund matching',
      guardrail: 'Real-time compliance and content moderation',
      underwriting: 'AI-powered data enrichment (Coming Soon)',
      offers: 'Offer ranking and buyer behavior (Coming Soon)',
      communication: 'AI buyer communication (Coming Soon)'
    },
    extensiblePlugins: {
      dealSources: 'Pluggable deal source integrations (CSV, API, Email, Webhook)',
      buyBoxScoring: 'Extensible buy box scoring with custom criteria',
      automations: 'Event-driven automation engine',
      workflows: 'Multi-step workflow orchestration',
      aiAnalysis: 'AI-powered deal analysis and enrichment',
      mlScoring: 'TensorFlow.js ML-enhanced deal quality scoring',
      knowledgeBase: 'RAG-powered document knowledge base with semantic search'
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

      // Add performance indexes for contract flow
      await addDocumentStatusIndex();
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
      await gitHubService.initialize();
      await codingTaskService.initialize();
      logger.info('Project Services initialized successfully');
    } catch (projectError) {
      logger.warn('Project Services initialization failed', {}, projectError);
    }

    // Initialize SOC2 Audit Logger
    try {
      await soc2AuditLogger.initialize();
      logger.info('SOC2 Audit Logger initialized successfully');
    } catch (auditError) {
      logger.warn('SOC2 Audit Logger initialization failed', {}, auditError);
    }

    // Initialize plugin system
    try {
      await dealProcessingService.initialize();
      logger.info('Deal Processing Service initialized successfully');

      // Load buy boxes from database into memory cache
      await dealProcessingService.loadBuyBoxesFromDatabase();
    } catch (pluginError) {
      logger.warn('Plugin system initialization failed', {}, pluginError);
    }

    // Initialize AI Agent (Admin - full access)
    try {
      await agentService.initialize();
    } catch (agentError) {
      logger.warn('AI Agent initialization failed', {}, agentError);
    }

    // Initialize Buyer Agent (Limited access for buyers)
    try {
      await inquiryService.initialize();
      await buyerAgentService.initialize();
    } catch (buyerAgentError) {
      logger.warn('Buyer Agent initialization failed', {}, buyerAgentError);
    }

    // Initialize Seller Agent (Limited access for sellers/admins)
    try {
      await sellerAgentService.initialize();
    } catch (sellerAgentError) {
      logger.warn('Seller Agent initialization failed', {}, sellerAgentError);
    }

    // Initialize ML Service
    try {
      await mlService.initialize();
      logger.info('ML Service initialized successfully');
    } catch (mlError) {
      logger.warn('ML Service initialization failed (ML features may be limited)', {}, mlError);
    }

    // Initialize Image Embedding Service
    try {
      await imageEmbeddingService.initialize();
      if (imageEmbeddingService.isReady()) {
        logger.info('Image Embedding Service initialized (visual ML features enabled)');
      } else {
        logger.warn('Image Embedding Service disabled (missing OPENAI_API_KEY)');
      }
    } catch (imgError) {
      logger.warn('Image Embedding Service initialization failed', {}, imgError);
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

    // Initialize DocuSeal Service
    try {
      await docuSealService.initialize();
      if (docuSealService.isReady()) {
        logger.info('DocuSeal Service initialized successfully');
      } else {
        logger.warn('DocuSeal Service disabled (missing DOCUSEAL_API_KEY)');
      }
    } catch (docuSealError) {
      logger.warn('DocuSeal Service initialization failed', {}, docuSealError);
    }

    // Initialize ProxyPics Service
    try {
      await proxyPicsService.initialize();
    } catch (proxyPicsError) {
      logger.warn('ProxyPics Service initialization failed', {}, proxyPicsError);
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

    // Initialize Broker Services
    try {
      const { brokerService } = await import('./services/BrokerService');
      const { brokerMSAService } = await import('./services/BrokerMSAService');
      const { brokerCommunicationService } = await import('./services/BrokerCommunicationService');
      await brokerService.initialize();
      await brokerMSAService.initialize();
      await brokerCommunicationService.initialize();
      logger.info('Broker Services initialized successfully');
    } catch (brokerError) {
      logger.warn('Broker Services initialization failed', {}, brokerError);
    }

    // Initialize Deal Approval Service
    try {
      await dealApprovalService.initialize();
      logger.info('Deal Approval Service initialized successfully');
    } catch (approvalError) {
      logger.warn('Deal Approval Service initialization failed', {}, approvalError);
    }

    // Initialize Deal Processing Queue (transactional outbox pattern)
    try {
      await dealProcessingQueue.initialize();
      logger.info('Deal Processing Queue initialized');
    } catch (queueError) {
      logger.warn('Deal Processing Queue initialization failed', {}, queueError);
    }

    // Initialize Deal Processing Worker (transactional outbox processor)
    try {
      await dealProcessingWorker.start();
      logger.info('Deal Processing Worker started (outbox pattern enabled)');
    } catch (workerError) {
      logger.warn('Deal Processing Worker initialization failed', {}, workerError);
    }

    // Initialize ML Fraud Prediction Service
    try {
      await mlFraudPredictionService.initialize();
      logger.info('ML Fraud Prediction Service initialized');
    } catch (mlFraudError) {
      logger.warn('ML Fraud Prediction Service initialization failed', {}, mlFraudError);
    }

    // Initialize Fraud Network Graph Service
    try {
      await fraudNetworkGraphService.initialize();
      logger.info('Fraud Network Graph Service initialized');
    } catch (graphError) {
      logger.warn('Fraud Network Graph Service initialization failed', {}, graphError);
    }

    // Initialize Compliance Trigger Service (real-time event-driven compliance checks)
    try {
      await complianceTriggerService.initialize();
      logger.info('Compliance Trigger Service initialized (real-time event triggers)');
    } catch (triggerError) {
      logger.warn('Compliance Trigger Service initialization failed', {}, triggerError);
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

    // Initialize Photo Persistence Service (Zillow photo caching)
    try {
      photoPersistenceService.start();
      logger.info('Photo Persistence Service started', { schedule: 'daily at 3:00 AM' });
    } catch (photoError) {
      logger.warn('Photo Persistence Service initialization failed', {}, photoError);
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

    // Initialize Compliance WebSocket Service
    try {
      complianceWebSocketService.initialize(server);
      logger.info('Compliance WebSocket Service initialized', { path: '/ws/compliance' });
    } catch (compWsError) {
      logger.warn('Compliance WebSocket Service initialization failed', {}, compWsError);
    }

    // Initialize Sprites Service and WebSocket Proxy
    try {
      spritesService.initialize();
      spritesWebSocketProxy.initialize(server);
      logger.info('Sprites Service and WebSocket Proxy initialized', { path: '/ws/sprites' });
    } catch (spritesError) {
      logger.warn('Sprites Service initialization failed', {}, spritesError);
    }

    // Seed default follow-up chains
    try {
      await seedFollowUpChains();
    } catch (seedError) {
      logger.warn('Follow-up chains seeding failed', {}, seedError);
    }

    // Start Follow-up Scheduler
    try {
      followUpScheduler.start('*/15 * * * *'); // Every 15 minutes
    } catch (schedulerError) {
      logger.warn('Follow-up Scheduler initialization failed', {}, schedulerError);
    }

    // Start Inquiry Scheduler (expiration, reminders, escalation)
    try {
      inquiryScheduler.start();
      logger.info('Inquiry Scheduler started');
    } catch (schedulerError) {
      logger.warn('Inquiry Scheduler initialization failed', {}, schedulerError);
    }

    // Start Contract Reminder Scheduler
    try {
      contractReminderScheduler.start('0 */2 * * *'); // Every 2 hours
      logger.info('Contract Reminder Scheduler started', { schedule: 'every 2 hours' });
    } catch (schedulerError) {
      logger.warn('Contract Reminder Scheduler initialization failed', {}, schedulerError);
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

    // Start Compliance Watchdog Scheduler
    try {
      complianceWatchdogScheduler.start('0 */6 * * *'); // Every 6 hours
      logger.info('Compliance Watchdog started', { schedule: 'every 6 hours' });
    } catch (watchdogError) {
      logger.warn('Compliance Watchdog initialization failed', {}, watchdogError);
    }

    // Start Offer Expiration Scheduler (FIX 3)
    try {
      offerExpirationScheduler.start('0 * * * *'); // Every hour
      logger.info('Offer Expiration Scheduler started', { schedule: 'every hour' });
    } catch (offerError) {
      logger.warn('Offer Expiration Scheduler initialization failed', {}, offerError);
    }

    // Start DocuSeal Reconciliation Scheduler (FIX 5)
    try {
      docuSealReconciliationScheduler.start('0 */4 * * *'); // Every 4 hours
      logger.info('DocuSeal Reconciliation Scheduler started', { schedule: 'every 4 hours' });
    } catch (reconcileError) {
      logger.warn('DocuSeal Reconciliation Scheduler initialization failed', {}, reconcileError);
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

        // Shutdown compliance WebSocket service
        complianceWebSocketService.shutdown();

        // Close voice calling sessions
        await closeVoiceSessions();

        // Stop automation engine retry processor
        automationEngine.stopRetryProcessor();

        // Stop follow-up scheduler
        followUpScheduler.stop();

        // Stop contract reminder scheduler
        contractReminderScheduler.stop();

        // Stop scheduled task scheduler
        scheduledTaskScheduler.stop();

        // Stop compliance watchdog scheduler
        complianceWatchdogScheduler.stop();

        // Stop offer expiration scheduler
        offerExpirationScheduler.stop();

        // Stop DocuSeal reconciliation scheduler
        docuSealReconciliationScheduler.stop();

        // Stop notification scheduler
        notificationScheduler.stop();

        // Stop email sync scheduler
        emailSyncScheduler.stop();

        // Stop deal processing worker
        dealProcessingWorker.stop();

        // Stop photo persistence scheduler
        photoPersistenceService.stop();

        // Shutdown SOC2 Audit Logger (flush remaining logs)
        await soc2AuditLogger.shutdown();

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
