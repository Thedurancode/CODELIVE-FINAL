/**
 * Entity Search Routes
 *
 * API endpoints for managing the semantic entity search index.
 */

import { Router, Request, Response } from 'express';
import { entitySearchService } from '../services/EntitySearchService';
import { Contact, Property } from '../models';

const router = Router();

/**
 * @swagger
 * /api/entity-search/status:
 *   get:
 *     summary: Get entity search service status
 *     tags: [Entity Search]
 *     responses:
 *       200:
 *         description: Service status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isReady = entitySearchService.isReady();
    res.json({
      success: true,
      data: {
        enabled: isReady,
        message: isReady
          ? 'Entity search service is ready (semantic search enabled)'
          : 'Entity search service is disabled (missing API keys)',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/entity-search/sync:
 *   post:
 *     summary: Trigger a full sync of entities to the search index
 *     tags: [Entity Search]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organizationId:
 *                 type: string
 *                 description: Optional organization ID to sync
 *     responses:
 *       200:
 *         description: Sync results
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    if (!entitySearchService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Entity search service is not available',
      });
    }

    const { organizationId } = req.body;
    const result = await entitySearchService.fullSync(organizationId);

    res.json({
      success: true,
      data: {
        contacts: result.contacts,
        properties: result.properties,
        message: `Synced ${result.contacts} contacts and ${result.properties} properties`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/entity-search/sync/incremental:
 *   post:
 *     summary: Trigger an incremental sync of recently updated entities
 *     tags: [Entity Search]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sinceMinutes:
 *                 type: number
 *                 default: 60
 *                 description: Sync entities updated within this many minutes
 *     responses:
 *       200:
 *         description: Sync results
 */
router.post('/sync/incremental', async (req: Request, res: Response) => {
  try {
    if (!entitySearchService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Entity search service is not available',
      });
    }

    const { sinceMinutes = 60 } = req.body;
    const result = await entitySearchService.incrementalSync(sinceMinutes);

    res.json({
      success: true,
      data: {
        contacts: result.contacts,
        properties: result.properties,
        message: `Synced ${result.contacts} contacts and ${result.properties} properties updated in the last ${sinceMinutes} minutes`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/entity-search/index/contact/{id}:
 *   post:
 *     summary: Index a specific contact
 *     tags: [Entity Search]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Contact indexed
 */
router.post('/index/contact/:id', async (req: Request, res: Response) => {
  try {
    if (!entitySearchService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Entity search service is not available',
      });
    }

    const contactId = parseInt(req.params.id, 10);
    const contact = await Contact.findByPk(contactId);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: `Contact not found: ${contactId}`,
      });
    }

    await entitySearchService.indexContact(contact);

    res.json({
      success: true,
      data: {
        indexed: true,
        contactId,
        contactName: contact.name,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/entity-search/index/property/{id}:
 *   post:
 *     summary: Index a specific property
 *     tags: [Entity Search]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Property indexed
 */
router.post('/index/property/:id', async (req: Request, res: Response) => {
  try {
    if (!entitySearchService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Entity search service is not available',
      });
    }

    const propertyId = parseInt(req.params.id, 10);
    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: `Property not found: ${propertyId}`,
      });
    }

    await entitySearchService.indexProperty(property);

    res.json({
      success: true,
      data: {
        indexed: true,
        propertyId,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * @swagger
 * /api/entity-search/search:
 *   post:
 *     summary: Search entities semantically
 *     tags: [Entity Search]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query
 *               types:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [contact, property]
 *               organizationId:
 *                 type: string
 *               topK:
 *                 type: number
 *                 default: 5
 *               minScore:
 *                 type: number
 *                 default: 0.5
 *     responses:
 *       200:
 *         description: Search results
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    if (!entitySearchService.isReady()) {
      return res.status(503).json({
        success: false,
        error: 'Entity search service is not available',
      });
    }

    const { query, types, organizationId, topK, minScore } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
      });
    }

    const results = await entitySearchService.search(query, {
      types,
      organizationId,
      topK,
      minScore,
    });

    res.json({
      success: true,
      data: {
        query,
        results,
        count: results.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
