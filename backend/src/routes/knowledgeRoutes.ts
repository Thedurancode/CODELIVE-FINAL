/**
 * Knowledge Base API Routes
 *
 * Provides endpoints for managing the RAG knowledge base:
 * - Upload documents
 * - Search knowledge
 * - Manage file watcher
 * - Get statistics
 *
 * SECURITY:
 * - All routes require authentication
 * - Write operations (upload, delete, reindex, watcher) require admin role
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as path from 'path';
import * as fs from 'fs';
import { knowledgeService, fileWatcher } from '../services/knowledge';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Rate limit for knowledge operations
const knowledgeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication to ALL knowledge routes
router.use(authenticate);
router.use(knowledgeLimiter);

// Configure multer for file uploads
const uploadDir = process.env.KNOWLEDGE_FOLDER || './knowledge';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename with timestamp prefix to avoid conflicts
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const supportedExts = knowledgeService.getSupportedExtensions();
    const ext = path.extname(file.originalname).toLowerCase();
    if (supportedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Supported: ${supportedExts.join(', ')}`));
    }
  },
});

/**
 * @swagger
 * tags:
 *   name: Knowledge
 *   description: Document knowledge base with semantic search
 */

/**
 * @swagger
 * /api/knowledge/status:
 *   get:
 *     summary: Get knowledge base status
 *     tags: [Knowledge]
 *     responses:
 *       200:
 *         description: Knowledge base status and statistics
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const stats = await knowledgeService.getStats();
    const watcherStats = fileWatcher.getStats();

    res.json({
      success: true,
      data: {
        knowledgeBase: {
          ready: knowledgeService.isReady(),
          ...stats,
        },
        fileWatcher: watcherStats,
        supportedFormats: knowledgeService.getSupportedExtensions(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/knowledge/search:
 *   post:
 *     summary: Search the knowledge base
 *     tags: [Knowledge]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *               topK:
 *                 type: number
 *                 default: 5
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, topK = 5 } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!knowledgeService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Knowledge base not initialized. Configure PINECONE_API_KEY and OPENAI_API_KEY.',
        timestamp: new Date().toISOString(),
      });
    }

    const results = await knowledgeService.search(query, topK);

    res.json({
      success: true,
      data: {
        query,
        resultsCount: results.length,
        results,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/knowledge/upload:
 *   post:
 *     summary: Upload and index a document
 *     tags: [Knowledge]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 */
router.post('/upload', authorize('admin'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        timestamp: new Date().toISOString(),
      });
    }

    if (!knowledgeService.isReady()) {
      // Delete the uploaded file since we can't process it
      fs.unlinkSync(req.file.path);
      return res.status(503).json({
        success: false,
        error: 'Knowledge base not initialized. Configure PINECONE_API_KEY and OPENAI_API_KEY.',
        timestamp: new Date().toISOString(),
      });
    }

    // Index the document
    const doc = await knowledgeService.indexDocument(req.file.path);

    res.json({
      success: true,
      data: {
        document: {
          id: doc.id,
          filename: doc.filename,
          fileType: doc.fileType,
          chunks: doc.chunksCount,
          status: doc.status,
          indexedAt: doc.indexedAt,
        },
        message: `Document "${doc.filename}" indexed successfully with ${doc.chunksCount} chunks`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/knowledge/documents:
 *   get:
 *     summary: List all indexed documents
 *     tags: [Knowledge]
 */
router.get('/documents', (req: Request, res: Response) => {
  const docs = knowledgeService.getDocuments();

  res.json({
    success: true,
    data: {
      count: docs.length,
      documents: docs.map((d) => ({
        id: d.id,
        filename: d.filename,
        fileType: d.fileType,
        chunks: d.chunksCount,
        status: d.status,
        indexedAt: d.indexedAt,
        error: d.error,
      })),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/knowledge/documents/{id}:
 *   delete:
 *     summary: Delete a document from the knowledge base
 *     tags: [Knowledge]
 */
router.delete('/documents/:id', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!knowledgeService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Knowledge base not initialized',
        timestamp: new Date().toISOString(),
      });
    }

    await knowledgeService.deleteDocument(id);

    res.json({
      success: true,
      message: `Document ${id} deleted`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/knowledge/watcher/start:
 *   post:
 *     summary: Start the file watcher
 *     tags: [Knowledge]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               folder:
 *                 type: string
 *                 description: Folder path to watch
 */
router.post('/watcher/start', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const folder = req.body.folder || process.env.KNOWLEDGE_FOLDER || './knowledge';

    await fileWatcher.start(folder);

    res.json({
      success: true,
      data: {
        message: `File watcher started on: ${folder}`,
        stats: fileWatcher.getStats(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/knowledge/watcher/stop:
 *   post:
 *     summary: Stop the file watcher
 *     tags: [Knowledge]
 */
router.post('/watcher/stop', authorize('admin'), async (req: Request, res: Response) => {
  try {
    await fileWatcher.stop();

    res.json({
      success: true,
      message: 'File watcher stopped',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /api/knowledge/watcher/status:
 *   get:
 *     summary: Get file watcher status
 *     tags: [Knowledge]
 */
router.get('/watcher/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      stats: fileWatcher.getStats(),
      recentEvents: fileWatcher.getRecentEvents(10),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/knowledge/reindex:
 *   post:
 *     summary: Reindex all documents in the watch folder
 *     tags: [Knowledge]
 */
router.post('/reindex', authorize('admin'), async (req: Request, res: Response) => {
  try {
    if (!fileWatcher.isActive()) {
      return res.status(400).json({
        success: false,
        error: 'File watcher not active. Start it first.',
        timestamp: new Date().toISOString(),
      });
    }

    const result = await fileWatcher.reindexAll();

    res.json({
      success: true,
      data: {
        message: 'Reindex complete',
        processed: result.processed,
        failed: result.failed,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
