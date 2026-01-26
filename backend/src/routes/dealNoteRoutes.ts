/**
 * Deal Note Routes
 *
 * API endpoints for managing notes on deals/properties.
 *
 * @swagger
 * tags:
 *   name: Deal Notes
 *   description: Notes on deals with team member attribution
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { dealNoteService } from '../services/DealNoteService';

const router = Router();

/**
 * @swagger
 * /api/listings/{propertyId}/notes:
 *   get:
 *     summary: Get all notes for a deal
 *     tags: [Deal Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The property/deal ID
 *     responses:
 *       200:
 *         description: List of notes with author info
 */
router.get('/:propertyId/notes', authenticate, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId, 10);
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization context required',
      });
    }

    if (isNaN(propertyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid property ID',
      });
    }

    const notes = await dealNoteService.getNotesForProperty(propertyId, organizationId);

    res.json({
      success: true,
      data: notes,
      count: notes.length,
    });
  } catch (error) {
    console.error('Error fetching deal notes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch notes',
    });
  }
});

/**
 * @swagger
 * /api/listings/{propertyId}/notes:
 *   post:
 *     summary: Create a new note on a deal
 *     tags: [Deal Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The property/deal ID
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
 *                 description: The note content
 *               subject:
 *                 type: string
 *                 description: Optional note title/subject
 *     responses:
 *       201:
 *         description: Note created successfully
 */
router.post('/:propertyId/notes', authenticate, async (req: Request, res: Response) => {
  try {
    const propertyId = parseInt(req.params.propertyId, 10);
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (isNaN(propertyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid property ID',
      });
    }

    const { content, subject } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Note content is required',
      });
    }

    const note = await dealNoteService.createNote({
      propertyId,
      userId,
      organizationId,
      content: content.trim(),
      subject: subject?.trim(),
    });

    res.status(201).json({
      success: true,
      data: note,
      message: 'Note created successfully',
    });
  } catch (error) {
    console.error('Error creating deal note:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create note',
    });
  }
});

/**
 * @swagger
 * /api/listings/{propertyId}/notes/{noteId}:
 *   patch:
 *     summary: Update a note (author only)
 *     tags: [Deal Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               subject:
 *                 type: string
 *     responses:
 *       200:
 *         description: Note updated successfully
 *       403:
 *         description: Only the author can edit this note
 */
router.patch('/:propertyId/notes/:noteId', authenticate, async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.noteId, 10);
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid note ID',
      });
    }

    const { content, subject } = req.body;
    const updates: { content?: string; subject?: string } = {};

    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Note content cannot be empty',
        });
      }
      updates.content = content.trim();
    }

    if (subject !== undefined) {
      updates.subject = subject?.trim() || undefined;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid updates provided',
      });
    }

    const note = await dealNoteService.updateNote(noteId, userId, organizationId, updates);

    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
      });
    }

    res.json({
      success: true,
      data: note,
      message: 'Note updated successfully',
    });
  } catch (error) {
    console.error('Error updating deal note:', error);

    // Check if it's an authorization error
    if (error instanceof Error && error.message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update note',
    });
  }
});

/**
 * @swagger
 * /api/listings/{propertyId}/notes/{noteId}:
 *   delete:
 *     summary: Delete a note (author only)
 *     tags: [Deal Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Note deleted successfully
 *       403:
 *         description: Only the author can delete this note
 */
router.delete('/:propertyId/notes/:noteId', authenticate, async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.noteId, 10);
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid note ID',
      });
    }

    const deleted = await dealNoteService.deleteNote(noteId, userId, organizationId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Note not found',
      });
    }

    res.json({
      success: true,
      message: 'Note deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting deal note:', error);

    // Check if it's an authorization error
    if (error instanceof Error && error.message.includes('Only the author')) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete note',
    });
  }
});

export default router;
