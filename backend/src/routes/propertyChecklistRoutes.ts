/**
 * Property Checklist Routes
 *
 * API endpoints for property compliance checklists
 */

import express, { Request, Response } from 'express';
import propertyChecklistService from '../services/PropertyChecklistService';

const router = express.Router();

/**
 * @swagger
 * /api/properties/{id}/checklist:
 *   get:
 *     summary: Get compliance checklist for a property
 *     description: Returns a dynamic checklist showing required contacts, documents, and compliance status
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Property checklist
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
 *                     propertyId:
 *                       type: integer
 *                     state:
 *                       type: string
 *                     currentPhase:
 *                       type: integer
 *                     overallStatus:
 *                       type: string
 *                       enum: [complete, incomplete, blocked]
 *                     overallProgress:
 *                       type: integer
 *                       description: 0-100
 *                     sections:
 *                       type: object
 *                       properties:
 *                         llcSetup:
 *                           $ref: '#/components/schemas/ChecklistSection'
 *                         contacts:
 *                           $ref: '#/components/schemas/ChecklistSection'
 *                         documents:
 *                           $ref: '#/components/schemas/ChecklistSection'
 *                         agreements:
 *                           $ref: '#/components/schemas/ChecklistSection'
 *                         complianceRules:
 *                           $ref: '#/components/schemas/ChecklistSection'
 *                     blockingIssues:
 *                       type: array
 *                       items:
 *                         type: string
 *                     nextSteps:
 *                       type: array
 *                       items:
 *                         type: string
 *       404:
 *         description: Property not found
 *       500:
 *         description: Server error
 */
router.get('/:id/checklist', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.id);

    if (isNaN(propertyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid property ID',
      });
    }

    const checklist = await propertyChecklistService.generateChecklist(propertyId);

    res.json({
      success: true,
      data: checklist,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    console.error('Error generating property checklist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate property checklist',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/properties/{id}/checklist/summary:
 *   get:
 *     summary: Get checklist summary for a property
 *     description: Returns a lightweight summary of property checklist progress
 *     tags: [Properties]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Property ID
 *     responses:
 *       200:
 *         description: Checklist summary
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
 *                     propertyId:
 *                       type: integer
 *                     overallProgress:
 *                       type: integer
 *                     overallStatus:
 *                       type: string
 *                     blockingCount:
 *                       type: integer
 *                     completedCount:
 *                       type: integer
 *                     totalCount:
 *                       type: integer
 */
router.get('/:id/checklist/summary', async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.id);

    if (isNaN(propertyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid property ID',
      });
    }

    const checklist = await propertyChecklistService.generateChecklist(propertyId);

    // Calculate summary
    const allItems = [
      ...checklist.sections.llcSetup.items,
      ...checklist.sections.contacts.items,
      ...checklist.sections.documents.items,
      ...checklist.sections.agreements.items,
      ...checklist.sections.complianceRules.items,
    ];

    const summary = {
      propertyId: checklist.propertyId,
      overallProgress: checklist.overallProgress,
      overallStatus: checklist.overallStatus,
      blockingCount: allItems.filter(i => i.blocking && i.status === 'missing').length,
      completedCount: allItems.filter(i => i.required && i.status === 'complete').length,
      totalCount: allItems.filter(i => i.required).length,
    };

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('Error generating checklist summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate checklist summary',
    });
  }
});

export default router;
