/**
 * Property Routes
 * CRUD operations for properties/listings
 *
 * SECURITY:
 * - All routes require authentication
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import {
  getAllProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  enrichProperty,
  bulkCreateProperties,
  bulkUpdateProperties,
  bulkDeleteProperties,
  bulkScoreProperties,
  recordPropertyView,
  getPropertyViewers,
} from '../controllers/propertyController';
import { authenticate } from '../middleware/auth';
import { propertyContactService } from '../services/PropertyContactService';
import { dealApprovalService } from '../services/DealApprovalService';
import type { ContactRole } from '../models/PropertyContact';
import { upload } from '../middleware/upload';
import Property from '../models/Property';
import { supabaseStorageService } from '../services/SupabaseStorageService';

const router = Router();

// Rate limit for property operations
const propertyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests.' },
});

// Apply authentication to ALL property routes
router.use(authenticate);
router.use(propertyLimiter);

// ============================================================================
// BULK OPERATIONS (must be defined before /:id routes to avoid conflicts)
// ============================================================================

/**
 * @swagger
 * /api/listings/bulk:
 *   post:
 *     summary: Bulk create properties
 *     description: Create up to 100 properties in a single request
 *     tags: [Properties]
 */
router.post('/bulk', bulkCreateProperties);

/**
 * @swagger
 * /api/listings/bulk:
 *   put:
 *     summary: Bulk update properties
 *     description: Update up to 100 properties in a single request
 *     tags: [Properties]
 */
router.put('/bulk', bulkUpdateProperties);

/**
 * @swagger
 * /api/listings/bulk:
 *   delete:
 *     summary: Bulk delete properties
 *     description: Delete up to 100 properties in a single request
 *     tags: [Properties]
 */
router.delete('/bulk', bulkDeleteProperties);

/**
 * @swagger
 * /api/listings/bulk/score:
 *   post:
 *     summary: Bulk score properties
 *     description: Score up to 100 properties against buy boxes
 *     tags: [Properties]
 */
router.post('/bulk/score', bulkScoreProperties);

/**
 * @swagger
 * /api/listings/bulk/submit:
 *   post:
 *     summary: Bulk submit properties for broker approval
 *     description: Submit up to 100 properties for broker approval
 *     tags: [Properties]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyIds
 *             properties:
 *               propertyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Properties submitted for approval
 */
router.post('/bulk/submit', async (req: Request, res: Response) => {
  try {
    const { propertyIds } = req.body;

    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'propertyIds array is required',
      });
    }

    if (propertyIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 properties can be submitted at once',
      });
    }

    const results = {
      submitted: [] as number[],
      failed: [] as { id: number; error: string }[],
    };

    for (const id of propertyIds) {
      try {
        await dealApprovalService.queueForApproval(parseInt(id, 10));
        results.submitted.push(parseInt(id, 10));
      } catch (error) {
        results.failed.push({
          id: parseInt(id, 10),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `${results.submitted.length} properties submitted for approval`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error bulk submitting properties:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// SINGLE ITEM OPERATIONS
// ============================================================================

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: Get all properties
 *     description: Retrieve a list of all properties with optional filtering and pagination
 *     tags: [Properties]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of properties per page
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by state (e.g., TX, FL)
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by city
 *       - in: query
 *         name: propertyType
 *         schema:
 *           type: string
 *         description: Filter by property type
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum listing price
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum listing price
 *     responses:
 *       200:
 *         description: List of properties retrieved successfully
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
 *                     $ref: '#/components/schemas/Property'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', getAllProperties);

/**
 * @swagger
 * /api/listings/{id}:
 *   get:
 *     summary: Get property by ID
 *     description: Retrieve a single property by its unique ID
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 */
router.get('/:id', getPropertyById);

/**
 * @swagger
 * /api/listings:
 *   post:
 *     summary: Create a new property
 *     description: Add a new property to the system
 *     tags: [Properties]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - propertyId
 *               - propertyType
 *               - address
 *               - city
 *               - state
 *               - zip
 *               - bedroomCount
 *               - bathroomCount
 *             properties:
 *               propertyId:
 *                 type: string
 *                 description: Unique property identifier
 *                 example: PROP-12345
 *               propertyType:
 *                 type: string
 *                 enum: [Single Family, Multi Family, Condo, Townhouse, Commercial, Land]
 *                 example: Single Family
 *               address:
 *                 type: object
 *                 properties:
 *                   houseNumber:
 *                     type: string
 *                     example: "123"
 *                   street:
 *                     type: string
 *                     example: "Main St"
 *               city:
 *                 type: string
 *                 example: Dallas
 *               state:
 *                 type: string
 *                 example: TX
 *               zip:
 *                 type: string
 *                 example: "75201"
 *               county:
 *                 type: string
 *                 example: Dallas County
 *               bedroomCount:
 *                 type: integer
 *                 example: 3
 *               bathroomCount:
 *                 type: integer
 *                 example: 2
 *               livingSpaceSqFt:
 *                 type: integer
 *                 example: 1800
 *               lotSizeSqFt:
 *                 type: integer
 *                 example: 7500
 *               yearBuilt:
 *                 type: integer
 *                 example: 1985
 *               mlsListingPrice:
 *                 type: number
 *                 example: 250000
 *               arv:
 *                 type: number
 *                 description: After Repair Value
 *                 example: 320000
 *               rehabCost:
 *                 type: number
 *                 example: 35000
 *     responses:
 *       201:
 *         description: Property created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Server error
 */
router.post('/', createProperty);

/**
 * @swagger
 * /api/listings/{id}:
 *   put:
 *     summary: Update a property
 *     description: Update an existing property's information
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               propertyType:
 *                 type: string
 *               address:
 *                 type: object
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zip:
 *                 type: string
 *               bedroomCount:
 *                 type: integer
 *               bathroomCount:
 *                 type: integer
 *               livingSpaceSqFt:
 *                 type: integer
 *               lotSizeSqFt:
 *                 type: integer
 *               yearBuilt:
 *                 type: integer
 *               mlsListingPrice:
 *                 type: number
 *               arv:
 *                 type: number
 *               rehabCost:
 *                 type: number
 *               occupancyStatus:
 *                 type: string
 *               condition:
 *                 type: string
 *     responses:
 *       200:
 *         description: Property updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Property'
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.put('/:id', updateProperty);
router.post('/:id/enrich', enrichProperty);

/**
 * @swagger
 * /api/listings/{id}:
 *   delete:
 *     summary: Delete a property
 *     description: Remove a property from the system
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Property deleted successfully
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', deleteProperty);

// ============================================================================
// SUBMIT FOR APPROVAL
// ============================================================================

/**
 * @swagger
 * /api/listings/{id}/submit:
 *   post:
 *     summary: Submit property for broker approval
 *     description: Queue a property for broker review and approval
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property submitted for approval
 *       400:
 *         description: Property cannot be submitted (wrong status or no broker available)
 *       404:
 *         description: Property not found
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const property = await dealApprovalService.queueForApproval(parseInt(id, 10));

    res.json({
      success: true,
      data: property,
      message: property.approvalStatus === 'pending_broker_approval'
        ? 'Property submitted for broker approval'
        : 'Property queued but no broker available - will be assigned when one becomes available',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error submitting property for approval:', error);
    const status = (error as Error).message.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/resubmit:
 *   post:
 *     summary: Resubmit property after changes
 *     description: Resubmit a property that was sent back for changes or rejected
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property resubmitted for approval
 */
router.post('/:id/resubmit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const property = await dealApprovalService.resubmitForApproval(parseInt(id, 10));

    res.json({
      success: true,
      data: property,
      message: 'Property resubmitted for broker approval',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error resubmitting property:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// VIEW TRACKING
// ============================================================================

/**
 * @swagger
 * /api/listings/{id}/view:
 *   post:
 *     summary: Record a property view
 *     description: Records that the authenticated user viewed a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: View recorded successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Property not found
 */
router.post('/:id/view', recordPropertyView);

/**
 * @swagger
 * /api/listings/{id}/viewers:
 *   get:
 *     summary: Get property viewers
 *     description: Get list of users who viewed a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: List of viewers
 */
router.get('/:id/viewers', getPropertyViewers);

// ============================================================================
// PROPERTY CONTACTS
// ============================================================================

/**
 * @swagger
 * /api/listings/{id}/contacts:
 *   get:
 *     summary: Get contacts assigned to a property
 *     description: Get all contacts assigned to a property/deal
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     responses:
 *       200:
 *         description: List of assigned contacts
 */
router.get('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contacts = await propertyContactService.getPropertyContacts(id);
    res.json({
      success: true,
      data: contacts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching property contacts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/contacts:
 *   post:
 *     summary: Assign a contact to a property
 *     description: Assign a CRM contact to a property/deal with a specific role
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contactId
 *               - role
 *             properties:
 *               contactId:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [agent, broker, seller, wholesaler, attorney, re_agent, buyer, other]
 *               isPrimary:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Contact assigned successfully
 *       400:
 *         description: Invalid request data
 */
router.post('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { contactId, role, isPrimary, notes } = req.body;

    if (!contactId || !role) {
      return res.status(400).json({
        success: false,
        error: 'contactId and role are required',
      });
    }

    const assignment = await propertyContactService.assignContact({
      propertyId: id,
      contactId,
      role,
      isPrimary,
      notes,
    });

    res.status(201).json({
      success: true,
      data: assignment,
      message: 'Contact assigned successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error assigning contact:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/contacts/{contactId}:
 *   delete:
 *     summary: Unassign a contact from a property
 *     description: Remove a contact assignment from a property/deal
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Property ID
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *         description: Contact ID
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Optional role to remove (removes all roles if not specified)
 *     responses:
 *       200:
 *         description: Contact unassigned successfully
 *       404:
 *         description: Assignment not found
 */
router.delete('/:id/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    const { id, contactId } = req.params;
    const { role } = req.query;

    const deleted = await propertyContactService.unassignContact(
      id,
      contactId,
      role as ContactRole | undefined
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Contact assignment not found',
      });
    }

    res.json({
      success: true,
      message: 'Contact unassigned successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error unassigning contact:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/contacts/{contactId}:
 *   patch:
 *     summary: Update a contact assignment
 *     description: Update the role or primary status of a contact assignment
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *               isPrimary:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Assignment updated successfully
 */
router.patch('/:id/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    const { id, contactId } = req.params;
    const updates = req.body;

    const assignment = await propertyContactService.updateAssignment(id, contactId, updates);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Contact assignment not found',
      });
    }

    res.json({
      success: true,
      data: assignment,
      message: 'Assignment updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// PHOTO MANAGEMENT ROUTES
// ============================================================================

// Ensure photos directory exists
const photosDir = path.join(process.cwd(), 'uploads', 'photos');
if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}

// Ensure temp photos directory exists
const tempPhotosDir = path.join(process.cwd(), 'uploads', 'photos', 'temp');
if (!fs.existsSync(tempPhotosDir)) {
  fs.mkdirSync(tempPhotosDir, { recursive: true });
}

/**
 * @swagger
 * /api/listings/upload-temp-photos:
 *   post:
 *     summary: Upload temporary photos before creating a property
 *     tags: [Properties]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Photos uploaded successfully
 */
router.post('/upload-temp-photos', upload.array('photos', 20), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No photos provided' });
    }

    const uploadedUrls: string[] = [];
    const tempId = `temp-${Date.now()}`;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileBuffer = fs.readFileSync(file.path);

      // Upload to Supabase with a temporary property ID
      const result = await supabaseStorageService.uploadPhoto(
        fileBuffer,
        0, // Use 0 as temp property ID, will be moved later
        i
      );

      if (result.success) {
        uploadedUrls.push(result.url);
      } else {
        console.error(`Failed to upload temp photo ${file.originalname}:`, result.error);
      }

      // Clean up temp file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    if (uploadedUrls.length === 0) {
      return res.status(500).json({ success: false, error: 'Failed to upload any photos' });
    }

    res.json({
      success: true,
      data: {
        urls: uploadedUrls,
        count: uploadedUrls.length,
      },
      message: `${uploadedUrls.length} photo(s) uploaded successfully`,
    });
  } catch (error) {
    console.error('Error uploading temp photos:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/photos:
 *   get:
 *     summary: Get all photos for a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of photo URLs
 */
router.get('/:id/photos', async (req: Request, res: Response) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    res.json({
      success: true,
      data: {
        photos: property.photoLinks || [],
        primaryPhoto: property.photoLinks?.[0] || null,
      },
    });
  } catch (error) {
    console.error('Error getting photos:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/photos:
 *   post:
 *     summary: Upload photos to a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Photos uploaded successfully
 */
router.post('/:id/photos', upload.array('photos', 20), async (req: Request, res: Response) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    // Upload files to Supabase Storage
    const newPhotoUrls: string[] = [];
    const existingPhotos = property.getDataValue('photoLinks') || [];
    const startIndex = existingPhotos.length;
    const propertyId = parseInt(req.params.id, 10); // Use req.params.id to avoid Sequelize class field issue

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Read file from temp location
      const buffer = fs.readFileSync(file.path);

      // Upload to Supabase
      const result = await supabaseStorageService.uploadPhoto(
        buffer,
        propertyId,
        startIndex + i
      );

      if (result.success) {
        newPhotoUrls.push(result.url);
      } else {
        console.error(`Failed to upload photo ${file.originalname}:`, result.error);
      }

      // Clean up temp file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    if (newPhotoUrls.length === 0) {
      return res.status(500).json({ success: false, error: 'Failed to upload any photos to storage' });
    }

    // Append to existing photos
    const updatedPhotos = [...existingPhotos, ...newPhotoUrls];

    await property.update({ photoLinks: updatedPhotos });

    res.json({
      success: true,
      data: {
        uploadedPhotos: newPhotoUrls,
        allPhotos: updatedPhotos,
        count: updatedPhotos.length,
      },
      message: `${newPhotoUrls.length} photo(s) uploaded successfully`,
    });
  } catch (error) {
    console.error('Error uploading photos:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/photos/primary:
 *   put:
 *     summary: Set primary photo for a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               photoUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Primary photo set successfully
 */
router.put('/:id/photos/primary', async (req: Request, res: Response) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    const { photoUrl } = req.body;
    if (!photoUrl) {
      return res.status(400).json({ success: false, error: 'photoUrl is required' });
    }

    const photos = property.photoLinks || [];
    const photoIndex = photos.indexOf(photoUrl);

    if (photoIndex === -1) {
      return res.status(404).json({ success: false, error: 'Photo not found in property photos' });
    }

    // Move selected photo to the beginning (primary position)
    const reorderedPhotos = [
      photoUrl,
      ...photos.filter((p: string) => p !== photoUrl),
    ];

    await property.update({ photoLinks: reorderedPhotos });

    res.json({
      success: true,
      data: {
        primaryPhoto: photoUrl,
        allPhotos: reorderedPhotos,
      },
      message: 'Primary photo set successfully',
    });
  } catch (error) {
    console.error('Error setting primary photo:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/photos:
 *   delete:
 *     summary: Delete a photo from a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               photoUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Photo deleted successfully
 */
router.delete('/:id/photos', async (req: Request, res: Response) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    const { photoUrl } = req.body;
    if (!photoUrl) {
      return res.status(400).json({ success: false, error: 'photoUrl is required' });
    }

    const photos = property.photoLinks || [];
    const photoIndex = photos.indexOf(photoUrl);

    if (photoIndex === -1) {
      return res.status(404).json({ success: false, error: 'Photo not found in property photos' });
    }

    // Remove photo from array
    const updatedPhotos = photos.filter((p: string) => p !== photoUrl);
    await property.update({ photoLinks: updatedPhotos });

    // Try to delete the file from storage
    if (photoUrl.startsWith('/uploads/photos/')) {
      // Local file - delete from filesystem
      const filePath = path.join(process.cwd(), photoUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else if (photoUrl.includes('supabase') && photoUrl.includes('/storage/')) {
      // Supabase URL - extract path and delete from Supabase
      try {
        // URL format: https://{project}.supabase.co/storage/v1/object/public/storage/photos/{propertyId}/{filename}
        const urlParts = photoUrl.split('/storage/v1/object/public/storage/');
        if (urlParts.length > 1) {
          const storagePath = urlParts[1]; // e.g., "photos/123/0-abc123.jpg"
          await supabaseStorageService.deletePhoto(storagePath);
        }
      } catch (deleteError) {
        console.error('Failed to delete photo from Supabase:', deleteError);
        // Continue even if storage deletion fails - photo is removed from DB
      }
    }

    res.json({
      success: true,
      data: {
        deletedPhoto: photoUrl,
        remainingPhotos: updatedPhotos,
        count: updatedPhotos.length,
      },
      message: 'Photo deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * @swagger
 * /api/listings/{id}/photos/reorder:
 *   put:
 *     summary: Reorder photos for a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Photos reordered successfully
 */
router.put('/:id/photos/reorder', async (req: Request, res: Response) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    const { photos } = req.body;
    if (!Array.isArray(photos)) {
      return res.status(400).json({ success: false, error: 'photos must be an array' });
    }

    await property.update({ photoLinks: photos });

    res.json({
      success: true,
      data: {
        photos,
        primaryPhoto: photos[0] || null,
      },
      message: 'Photos reordered successfully',
    });
  } catch (error) {
    console.error('Error reordering photos:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// DEAL TEAM MEMBER ROUTES
// ============================================================================

/**
 * @swagger
 * /api/listings/{id}/team:
 *   get:
 *     summary: Get team members assigned to a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of team members
 */
router.get('/:id/team', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.id);
    const organizationId = (req as any).organizationId;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    // Dynamic import to avoid circular dependency
    const { default: DealTeamMember } = await import('../models/DealTeamMember');
    const { default: MarketplaceUser } = await import('../models/MarketplaceUser');

    const teamMembers = await DealTeamMember.findAll({
      where: { propertyId, organizationId, isActive: true },
      include: [{
        model: MarketplaceUser,
        as: 'user',
        attributes: ['id', 'name', 'email', 'phone', 'avatar', 'title', 'bio', 'expertise'],
      }],
      order: [
        ['dealRole', 'ASC'],
        ['assignedAt', 'ASC'],
      ],
    });

    res.json({ success: true, data: teamMembers });
  } catch (error) {
    console.error('Error fetching deal team:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/listings/{id}/team:
 *   post:
 *     summary: Assign a team member to a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - dealRole
 *             properties:
 *               userId:
 *                 type: string
 *               dealRole:
 *                 type: string
 *                 enum: [lead, acquisitions, underwriting, closing, support, observer]
 *     responses:
 *       200:
 *         description: Team member assigned
 */
router.post('/:id/team', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.id);
    const organizationId = (req as any).organizationId;
    const assignedBy = (req as any).userId;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const { userId, dealRole, notes } = req.body;
    if (!userId || !dealRole) {
      return res.status(400).json({ success: false, error: 'userId and dealRole are required' });
    }

    // Dynamic import to avoid circular dependency
    const { default: DealTeamMember } = await import('../models/DealTeamMember');
    const { default: MarketplaceUser } = await import('../models/MarketplaceUser');

    // Verify user exists and is in the organization
    const user = await MarketplaceUser.findOne({
      where: { id: userId, organizationId },
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found in organization' });
    }

    const assignment = await DealTeamMember.assignToProperty({
      propertyId,
      userId,
      organizationId,
      dealRole,
      assignedBy,
      notes,
    });

    // Notify team of the change
    const { dealActivityNotificationService } = await import('../services/DealActivityNotificationService');
    const assignerUser = await MarketplaceUser.findByPk(assignedBy);

    dealActivityNotificationService.notifyOfTeamChange(
      propertyId,
      organizationId,
      {
        memberName: user.name,
        action: 'assigned',
        role: dealRole,
        changedBy: assignerUser?.name || 'Unknown',
      },
      assignedBy
    ).catch(err => console.warn('Failed to notify of team change:', err.message));

    res.json({ success: true, data: assignment });
  } catch (error) {
    console.error('Error assigning team member:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/listings/{id}/team/{userId}:
 *   delete:
 *     summary: Remove a team member from a property
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team member removed
 */
router.delete('/:id/team/:userId', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.id);
    const { userId } = req.params;
    const organizationId = (req as any).organizationId;
    const removedBy = (req as any).userId;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    // Dynamic import to avoid circular dependency
    const { default: DealTeamMember } = await import('../models/DealTeamMember');
    const { default: MarketplaceUser } = await import('../models/MarketplaceUser');

    const user = await MarketplaceUser.findByPk(userId);
    const removed = await DealTeamMember.removeFromProperty(propertyId, userId, organizationId);

    if (!removed) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    // Notify team of the change
    const { dealActivityNotificationService } = await import('../services/DealActivityNotificationService');
    const removerUser = await MarketplaceUser.findByPk(removedBy);

    dealActivityNotificationService.notifyOfTeamChange(
      propertyId,
      organizationId,
      {
        memberName: user?.name || 'Team member',
        action: 'removed',
        changedBy: removerUser?.name || 'Unknown',
      },
      removedBy
    ).catch(err => console.warn('Failed to notify of team change:', err.message));

    res.json({ success: true, message: 'Team member removed' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
