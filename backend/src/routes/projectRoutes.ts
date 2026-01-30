/**
 * Project Routes
 *
 * API routes for project management with Swagger documentation.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as projectController from '../controllers/projectController';
import { clientPortalController } from '../controllers/clientPortalController';
import { authenticate } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';

const router = Router();

// Rate limiting for public endpoints (stricter)
const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Lower limit for public endpoints
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for authenticated endpoints
const projectLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // Increased for development
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================================

/**
 * @swagger
 * /api/projects/public/{id}:
 *   get:
 *     summary: Get public project info (no auth required)
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Public project info
 *       404:
 *         description: Project not found
 */
router.get('/public/:id', publicLimiter, projectController.getPublicProject);

/**
 * @swagger
 * /api/projects/public/{id}/ticket:
 *   post:
 *     summary: Submit a public ticket (no auth required)
 *     tags: [Projects]
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
 *               - title
 *               - description
 *               - email
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Ticket submitted successfully
 *       400:
 *         description: Invalid input or project doesn't accept public tickets
 *       404:
 *         description: Project not found
 */
router.post('/public/:id/ticket', publicLimiter, projectController.submitPublicTicket);

/**
 * @swagger
 * /api/projects/tv-display:
 *   get:
 *     summary: Get projects for TV display (no auth required)
 *     description: Public endpoint for Roku/TV display app - returns all projects with minimal info
 *     tags: [Projects]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: List of projects for TV display
 */
router.get('/tv-display', publicLimiter, projectController.getTVDisplayProjects);

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Apply authentication and rate limiting to remaining routes
router.use(authenticate);
router.use(projectLimiter);

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Project management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Project:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         githubUrl:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [active, on_hold, completed, archived, cancelled]
 *         organizationId:
 *           type: string
 *           format: uuid
 *         createdById:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         startDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         targetEndDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         actualEndDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     ProjectContact:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         projectId:
 *           type: string
 *           format: uuid
 *         contactId:
 *           type: string
 *           format: uuid
 *         role:
 *           type: string
 *           nullable: true
 *         isPrimary:
 *           type: boolean
 *         notes:
 *           type: string
 *           nullable: true
 *     ProjectNote:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         projectId:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         content:
 *           type: string
 *         subject:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 */

// ============================================================================
// PROJECTS CRUD
// ============================================================================

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Retrieve projects with filtering and pagination
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Comma-separated statuses (active,on_hold,completed,archived,cancelled)
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated tags
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: updatedAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *     responses:
 *       200:
 *         description: List of projects with pagination
 *       401:
 *         description: Unauthorized
 */
router.get('/', projectController.getProjects);

/**
 * @swagger
 * /api/projects/stats:
 *   get:
 *     summary: Get project statistics
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Project statistics
 */
router.get('/stats', projectController.getProjectStats);

/**
 * @swagger
 * /api/projects/team-members:
 *   get:
 *     summary: Get all team members in the organization (for member selector)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of team members with name, email, avatar
 */
router.get('/team-members', projectController.getOrganizationTeamMembers);

/**
 * @swagger
 * /api/projects/search:
 *   get:
 *     summary: Search projects
 *     tags: [Projects]
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
router.get('/search', projectController.searchProjects);

/**
 * @swagger
 * /api/projects/tags:
 *   get:
 *     summary: Get all unique tags
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tags with counts
 */
router.get('/tags', projectController.getProjectTags);

/**
 * @swagger
 * /api/projects/recap/all:
 *   post:
 *     summary: Get AI-generated recap of all recent projects
 *     description: Returns a voice-optimized summary of recent project activity across all projects
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userName:
 *                 type: string
 *                 description: User name for personalization
 *               limit:
 *                 type: number
 *                 default: 3
 *                 description: Number of recent projects to include
 *     responses:
 *       200:
 *         description: All projects recap
 */
router.post('/recap/all', projectController.getAllProjectsRecap);

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get a single project
 *     tags: [Projects]
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
 *         description: Project details
 *       404:
 *         description: Project not found
 */
router.get('/:id', projectController.getProject);

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               githubUrl:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, on_hold, completed, archived, cancelled]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               targetEndDate:
 *                 type: string
 *                 format: date-time
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Project created
 */
router.post('/', projectController.createProject);

/**
 * @swagger
 * /api/projects/{id}:
 *   patch:
 *     summary: Update a project
 *     tags: [Projects]
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               githubUrl:
 *                 type: string
 *               status:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               targetEndDate:
 *                 type: string
 *                 format: date-time
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Project updated
 *       404:
 *         description: Project not found
 */
router.patch('/:id', projectController.updateProject);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
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
 *         description: Project deleted
 *       404:
 *         description: Project not found
 */
router.delete('/:id', projectController.deleteProject);

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * @swagger
 * /api/projects/bulk/tags:
 *   post:
 *     summary: Add tags to multiple projects
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectIds
 *               - tags
 *             properties:
 *               projectIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Tags added
 */
router.post('/bulk/tags', projectController.bulkAddTags);

/**
 * @swagger
 * /api/projects/bulk/tags:
 *   delete:
 *     summary: Remove tags from multiple projects
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Tags removed
 */
router.delete('/bulk/tags', projectController.bulkRemoveTags);

/**
 * @swagger
 * /api/projects/bulk/delete:
 *   post:
 *     summary: Delete multiple projects
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectIds
 *             properties:
 *               projectIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Projects deleted
 */
router.post('/bulk/delete', projectController.bulkDelete);

// ============================================================================
// PROJECT CONTACTS
// ============================================================================

/**
 * @swagger
 * /api/projects/{id}/contacts:
 *   get:
 *     summary: Get contacts for a project
 *     tags: [Projects]
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
 *         description: List of project contacts
 */
router.get('/:id/contacts', projectController.getProjectContacts);

/**
 * @swagger
 * /api/projects/{id}/contacts:
 *   post:
 *     summary: Add a contact to a project
 *     tags: [Projects]
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
 *               - contactId
 *             properties:
 *               contactId:
 *                 type: string
 *                 format: uuid
 *               role:
 *                 type: string
 *               isPrimary:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Contact added to project
 */
router.post('/:id/contacts', projectController.addProjectContact);

/**
 * @swagger
 * /api/projects/{id}/contacts/{contactId}:
 *   patch:
 *     summary: Update a contact's role on a project
 *     tags: [Projects]
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
 *         name: contactId
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
 *               role:
 *                 type: string
 *               isPrimary:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contact updated
 *       404:
 *         description: Contact not found on project
 */
router.patch('/:id/contacts/:contactId', projectController.updateProjectContact);

/**
 * @swagger
 * /api/projects/{id}/contacts/{contactId}:
 *   delete:
 *     summary: Remove a contact from a project
 *     tags: [Projects]
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
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contact removed from project
 *       404:
 *         description: Contact not found on project
 */
router.delete('/:id/contacts/:contactId', projectController.removeProjectContact);

/**
 * @swagger
 * /api/projects/{id}/contacts/{contactId}/github-invite:
 *   post:
 *     summary: Manually invite a contact to the project's GitHub repository
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Contact ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permission:
 *                 type: string
 *                 enum: [pull, push, admin, maintain, triage]
 *                 description: GitHub permission level (defaults based on contact type)
 *     responses:
 *       200:
 *         description: GitHub invite result
 *       400:
 *         description: GitHub integration not configured or contact has no email
 *       404:
 *         description: Contact not found on project
 */
router.post('/:id/contacts/:contactId/github-invite', projectController.inviteContactToGitHub);

// ============================================================================
// PROJECT NOTES
// ============================================================================

/**
 * @swagger
 * /api/projects/{id}/notes:
 *   get:
 *     summary: Get notes for a project
 *     tags: [Projects]
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
 *         description: List of project notes
 */
router.get('/:id/notes', projectController.getProjectNotes);

/**
 * @swagger
 * /api/projects/{id}/notes:
 *   post:
 *     summary: Create a note on a project
 *     tags: [Projects]
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
 *               subject:
 *                 type: string
 *     responses:
 *       201:
 *         description: Note created
 */
router.post('/:id/notes', projectController.createProjectNote);

/**
 * @swagger
 * /api/projects/{id}/notes/{noteId}:
 *   patch:
 *     summary: Update a note (author only)
 *     tags: [Projects]
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
 *         name: noteId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
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
 *         description: Note updated
 *       403:
 *         description: Not the author
 *       404:
 *         description: Note not found
 */
router.patch('/:id/notes/:noteId', projectController.updateProjectNote);

/**
 * @swagger
 * /api/projects/{id}/notes/{noteId}:
 *   delete:
 *     summary: Delete a note (author only)
 *     tags: [Projects]
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
 *         name: noteId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Note deleted
 *       403:
 *         description: Not the author
 *       404:
 *         description: Note not found
 */
router.delete('/:id/notes/:noteId', projectController.deleteProjectNote);

/**
 * @swagger
 * /api/projects/{id}/notes/{noteId}/github-issue:
 *   post:
 *     summary: Create a GitHub issue from a note
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Note ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               labels:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Labels to add to the issue
 *     responses:
 *       201:
 *         description: GitHub issue created
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
 *                     issueNumber:
 *                       type: integer
 *                     issueUrl:
 *                       type: string
 *                     title:
 *                       type: string
 *       400:
 *         description: Project has no GitHub repository linked
 *       404:
 *         description: Project or note not found
 */
router.post('/:id/notes/:noteId/github-issue', projectController.createGitHubIssueFromNote);

// ============================================================================
// PROJECT AI RECAP
// ============================================================================

/**
 * @swagger
 * /api/projects/{id}/recap:
 *   get:
 *     summary: Get AI-generated project recap
 *     description: Returns the current AI-generated activity recap for the project. Generates a new one if missing or stale.
 *     tags: [Projects]
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
 *         description: Project recap
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
 *                     projectId:
 *                       type: string
 *                     recap:
 *                       type: string
 *                       description: AI-generated project activity summary
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Project not found
 */
router.get('/:id/recap', authenticate, projectController.getProjectRecap);

/**
 * @swagger
 * /api/projects/{id}/recap/refresh:
 *   post:
 *     summary: Force refresh the project recap
 *     description: Bypasses cache and generates a new AI recap immediately
 *     tags: [Projects]
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
 *         description: Refreshed project recap
 *       404:
 *         description: Project not found
 */
router.post('/:id/recap/refresh', authenticate, projectController.refreshProjectRecap);

/**
 * @swagger
 * /api/projects/{id}/recap/audio:
 *   get:
 *     summary: Get cached TTS audio for project recap
 *     description: Returns cached audio URL if available, otherwise generates new audio using ElevenLabs and caches it
 *     tags: [Projects]
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
 *         name: voice
 *         schema:
 *           type: string
 *           default: rachel
 *         description: ElevenLabs voice key (rachel, adam, sarah, etc.)
 *       - in: query
 *         name: regenerate
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Force regenerate audio even if cached
 *     responses:
 *       200:
 *         description: Audio URL for project recap
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
 *                     audioUrl:
 *                       type: string
 *                       description: URL to the audio file
 *                     cached:
 *                       type: boolean
 *                       description: Whether the audio was served from cache
 *                     recap:
 *                       type: string
 *                       description: The recap text that was converted to audio
 *       404:
 *         description: Project not found
 *       503:
 *         description: ElevenLabs not configured
 */
router.get('/:id/recap/audio', authenticate, projectController.getProjectRecapAudio);

// ============================================================================
// PROJECT LOGO
// ============================================================================

/**
 * @swagger
 * /api/projects/{id}/logo:
 *   post:
 *     summary: Upload project logo
 *     tags: [Projects]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Logo uploaded successfully
 *       400:
 *         description: No file uploaded
 *       404:
 *         description: Project not found
 */
router.post('/:id/logo', uploadSingle, projectController.uploadProjectLogo);

/**
 * @swagger
 * /api/projects/{id}/logo:
 *   delete:
 *     summary: Delete project logo
 *     tags: [Projects]
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
 *         description: Logo deleted successfully
 *       404:
 *         description: Project not found
 */
router.delete('/:id/logo', projectController.deleteProjectLogo);

// ============================================================================
// PROJECT TASKS
// ============================================================================

/**
 * @swagger
 * /api/projects/{id}/tasks:
 *   get:
 *     summary: Get tasks for a project
 *     tags: [Projects]
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
 *         name: status
 *         schema:
 *           type: string
 *         description: Comma-separated statuses
 *     responses:
 *       200:
 *         description: List of project tasks
 */
router.get('/:id/tasks', projectController.getProjectTasks);

/**
 * @swagger
 * /api/projects/{id}/tasks:
 *   post:
 *     summary: Create a task for a project
 *     tags: [Projects]
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
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high, urgent]
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               assignedTo:
 *                 type: string
 *                 format: uuid
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Task created
 */
router.post('/:id/tasks', projectController.createProjectTask);

// ============================================================================
// PROJECT MEMBERS (Team Members)
// ============================================================================

/**
 * @swagger
 * /api/projects/{id}/members:
 *   get:
 *     summary: Get members assigned to a project
 *     tags: [Projects]
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
 *         description: List of project members
 */
router.get('/:id/members', projectController.getProjectMembers);

/**
 * @swagger
 * /api/projects/{id}/members:
 *   post:
 *     summary: Add a member to a project
 *     tags: [Projects]
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
 *               - memberId
 *             properties:
 *               memberId:
 *                 type: string
 *                 format: uuid
 *               projectRole:
 *                 type: string
 *                 enum: [owner, lead, developer, designer, manager, contributor, viewer]
 *               githubUsername:
 *                 type: string
 *     responses:
 *       201:
 *         description: Member added to project
 */
router.post('/:id/members', projectController.addProjectMember);

/**
 * @swagger
 * /api/projects/{id}/members/bulk:
 *   post:
 *     summary: Bulk add members to a project
 *     tags: [Projects]
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
 *               - memberIds
 *             properties:
 *               memberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               projectRole:
 *                 type: string
 *                 enum: [owner, lead, developer, designer, manager, contributor, viewer]
 *     responses:
 *       201:
 *         description: Members added to project
 */
router.post('/:id/members/bulk', projectController.bulkAddProjectMembers);

/**
 * @swagger
 * /api/projects/{id}/members/{memberId}:
 *   patch:
 *     summary: Update a project member's role
 *     tags: [Projects]
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
 *         name: memberId
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
 *               projectRole:
 *                 type: string
 *               githubUsername:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member updated
 */
router.patch('/:id/members/:memberId', projectController.updateProjectMember);

/**
 * @swagger
 * /api/projects/{id}/members/{memberId}:
 *   delete:
 *     summary: Remove a member from a project
 *     tags: [Projects]
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
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Member removed from project
 */
router.delete('/:id/members/:memberId', projectController.removeProjectMember);

// ============================================================================
// PROJECT CONTRACTS (DocuSeal Integration)
// ============================================================================

/**
 * @swagger
 * /api/projects/{id}/contracts:
 *   get:
 *     summary: Get contracts for a project
 *     description: Retrieves all DocuSeal contracts/submissions associated with this project
 *     tags: [Projects]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, viewed, partially_signed, completed, declined, expired, archived]
 *     responses:
 *       200:
 *         description: List of project contracts
 *       404:
 *         description: Project not found
 */
router.get('/:id/contracts', projectController.getProjectContracts);

/**
 * @swagger
 * /api/projects/{id}/contracts:
 *   post:
 *     summary: Link a contract to a project
 *     description: Associates an existing DocuSeal submission with this project
 *     tags: [Projects]
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
 *               - docuSealSubmissionId
 *             properties:
 *               docuSealSubmissionId:
 *                 type: integer
 *                 description: DocuSeal submission ID to link
 *     responses:
 *       200:
 *         description: Contract linked to project
 *       404:
 *         description: Project or submission not found
 */
router.post('/:id/contracts', projectController.linkProjectContract);

/**
 * @swagger
 * /api/projects/{id}/contracts/{contractId}:
 *   delete:
 *     summary: Unlink a contract from a project
 *     tags: [Projects]
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
 *         name: contractId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Local DocuSealSubmission ID
 *     responses:
 *       200:
 *         description: Contract unlinked from project
 *       404:
 *         description: Contract not found
 */
router.delete('/:id/contracts/:contractId', projectController.unlinkProjectContract);

/**
 * @swagger
 * /api/projects/{id}/signers:
 *   get:
 *     summary: Get all contract signers for a project
 *     description: Retrieves all signers across all contracts associated with this project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, sent, opened, completed, declined]
 *         description: Filter by signer status
 *     responses:
 *       200:
 *         description: List of project signers
 *       404:
 *         description: Project not found
 */
router.get('/:id/signers', projectController.getProjectSigners);

// ============================================================================
// PROJECT CLIENTS (Client Portal Access)
// ============================================================================

/**
 * @swagger
 * /api/projects/{id}/clients:
 *   get:
 *     summary: List clients for a project
 *     tags: [Projects]
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
 *         description: List of project clients
 */
router.get('/:id/clients', clientPortalController.listProjectClients);

/**
 * @swagger
 * /api/projects/{id}/clients/invite:
 *   post:
 *     summary: Generate client invite link
 *     tags: [Projects]
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
 *               clientEmail:
 *                 type: string
 *                 format: email
 *                 description: Optional email to track who the invite is for
 *               expiresInDays:
 *                 type: integer
 *                 description: Number of days until invite expires (default 7)
 *     responses:
 *       201:
 *         description: Invite link generated
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
 *                     inviteToken:
 *                       type: string
 *                     inviteUrl:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 */
router.post('/:id/clients/invite', clientPortalController.generateInvite);

/**
 * @swagger
 * /api/projects/{id}/clients/{clientId}:
 *   delete:
 *     summary: Revoke client access
 *     tags: [Projects]
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
 *         name: clientId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ProjectClient ID
 *     responses:
 *       200:
 *         description: Client access revoked
 *       404:
 *         description: Client not found
 */
router.delete('/:id/clients/:clientId', clientPortalController.revokeClientAccess);

export default router;
