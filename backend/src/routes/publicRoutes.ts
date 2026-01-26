/**
 * Public Routes - No authentication required
 *
 * These endpoints are accessible without login for public sharing features.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import Property from '../models/Property';
import { upload } from '../middleware/upload';
import { supabaseStorageService } from '../services/SupabaseStorageService';
import { authenticate } from '../middleware/auth';
import * as publicDealController from '../controllers/publicDealController';

const router = Router();

// Secret for generating share tokens (use env var in production)
const SHARE_TOKEN_SECRET = process.env.SHARE_TOKEN_SECRET || 'dispotree-photo-share-secret-2024';

/**
 * Generate a share token for a property
 */
function generateShareToken(propertyId: number): string {
  const hash = crypto
    .createHmac('sha256', SHARE_TOKEN_SECRET)
    .update(`property-${propertyId}-photos`)
    .digest('hex')
    .substring(0, 16);
  return `${propertyId}-${hash}`;
}

/**
 * Verify and extract property ID from share token
 */
function verifyShareToken(token: string): number | null {
  const parts = token.split('-');
  if (parts.length < 2) return null;

  const propertyId = parseInt(parts[0], 10);
  if (isNaN(propertyId)) return null;

  const expectedToken = generateShareToken(propertyId);
  if (token !== expectedToken) return null;

  return propertyId;
}

/**
 * @swagger
 * /api/public/photos/token/{propertyId}:
 *   get:
 *     summary: Get share token for property photo uploads
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Share token and upload URL
 */
router.get('/photos/token/:propertyId', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId, 10);

    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    const token = generateShareToken(propertyId);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const uploadUrl = `${baseUrl}/upload/${token}`;

    // Handle address - can be string or object
    const addressRaw = property.getDataValue('address');
    const address = typeof addressRaw === 'object' && addressRaw
      ? `${(addressRaw as any).houseNumber || ''} ${(addressRaw as any).street || ''}`.trim()
      : addressRaw;

    res.json({
      success: true,
      data: {
        token,
        uploadUrl,
        propertyId,
        address,
      },
    });
  } catch (error) {
    console.error('Error generating share token:', error);
    res.status(500).json({ success: false, error: 'Failed to generate share token' });
  }
});

/**
 * @swagger
 * /api/public/photos/{token}:
 *   get:
 *     summary: Get property info for public upload page
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Property info for upload page
 */
router.get('/photos/:token', async (req: Request, res: Response) => {
  try {
    const propertyId = verifyShareToken(req.params.token);

    if (!propertyId) {
      return res.status(400).json({ success: false, error: 'Invalid or expired share link' });
    }

    const property = await Property.findByPk(propertyId);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    // Handle address - can be string or object
    const addressRaw = property.getDataValue('address');
    const address = typeof addressRaw === 'object' && addressRaw
      ? `${(addressRaw as any).houseNumber || ''} ${(addressRaw as any).street || ''}`.trim()
      : addressRaw;

    res.json({
      success: true,
      data: {
        propertyId,
        address,
        city: property.getDataValue('city'),
        state: property.getDataValue('state'),
        zip: property.getDataValue('zip'),
        photoCount: (property.getDataValue('photoLinks') || []).length,
      },
    });
  } catch (error) {
    console.error('Error fetching property for public upload:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch property info' });
  }
});

/**
 * @swagger
 * /api/public/photos/{token}:
 *   post:
 *     summary: Upload photos via public share link (no auth required)
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: token
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
router.post('/photos/:token', upload.array('photos', 20), async (req: Request, res: Response) => {
  try {
    const propertyId = verifyShareToken(req.params.token);

    if (!propertyId) {
      return res.status(400).json({ success: false, error: 'Invalid or expired share link' });
    }

    const property = await Property.findByPk(propertyId);
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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = fs.readFileSync(file.path);

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
      return res.status(500).json({ success: false, error: 'Failed to upload photos' });
    }

    // Update property with new photos
    const updatedPhotos = [...existingPhotos, ...newPhotoUrls];
    await property.update({ photoLinks: updatedPhotos });

    res.json({
      success: true,
      data: {
        uploadedCount: newPhotoUrls.length,
        totalPhotos: updatedPhotos.length,
      },
      message: `${newPhotoUrls.length} photo(s) uploaded successfully`,
    });
  } catch (error) {
    console.error('Error uploading photos via public link:', error);
    res.status(500).json({ success: false, error: 'Failed to upload photos' });
  }
});

// ============================================================================
// PUBLIC DEAL SHARING ROUTES
// ============================================================================

/**
 * @swagger
 * /api/public/deal/{id}/{token}:
 *   get:
 *     summary: Get public deal by ID and token (no auth required)
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Access token
 *     responses:
 *       200:
 *         description: Deal data with visibility settings applied
 *       403:
 *         description: Invalid or expired token
 *       404:
 *         description: Deal not found
 */
router.get('/deal/:id/:token', publicDealController.getPublicDeal);

/**
 * @swagger
 * /api/public/deal/{id}/join-discussion:
 *   post:
 *     summary: Join public discussion for a deal (no auth required)
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully joined discussion
 *       400:
 *         description: Missing phone number
 *       403:
 *         description: Discussion not enabled or invalid token
 */
router.post('/deal/:id/join-discussion', publicDealController.joinPublicDiscussion);

/**
 * @swagger
 * /api/public/deals/{id}/links:
 *   post:
 *     summary: Create a public deal link (auth required)
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               settings:
 *                 type: object
 *                 properties:
 *                   showFinancials:
 *                     type: boolean
 *                   showPropertyDetails:
 *                     type: boolean
 *                   showOccupancy:
 *                     type: boolean
 *                   showFeatures:
 *                     type: boolean
 *                   showDocuments:
 *                     type: boolean
 *                   showCompliance:
 *                     type: boolean
 *                   showViewers:
 *                     type: boolean
 *                   showBuyers:
 *                     type: boolean
 *                   showOffers:
 *                     type: boolean
 *                   showSkipTrace:
 *                     type: boolean
 *                   showContacts:
 *                     type: boolean
 *                   showDiscussion:
 *                     type: boolean
 *                   showPhotos:
 *                     type: boolean
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Link created successfully
 *       404:
 *         description: Property not found
 */
router.post('/deals/:id/links', authenticate, publicDealController.createPublicDealLink);

/**
 * @swagger
 * /api/public/deals/{id}/links:
 *   get:
 *     summary: Get all public links for a property (auth required)
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     responses:
 *       200:
 *         description: List of public links
 */
router.get('/deals/:id/links', authenticate, publicDealController.getPropertyPublicLinks);

/**
 * @swagger
 * /api/public/links/{linkId}:
 *   patch:
 *     summary: Update a public deal link (auth required)
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Link ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               settings:
 *                 type: object
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Link updated successfully
 *       404:
 *         description: Link not found
 */
router.patch('/links/:linkId', authenticate, publicDealController.updatePublicDealLink);

/**
 * @swagger
 * /api/public/links/{linkId}:
 *   delete:
 *     summary: Delete a public deal link (auth required)
 *     tags: [Public]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Link ID
 *     responses:
 *       200:
 *         description: Link deleted successfully
 *       404:
 *         description: Link not found
 */
router.delete('/links/:linkId', authenticate, publicDealController.deletePublicDealLink);

export default router;
