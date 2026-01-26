/**
 * Setup Routes
 *
 * Handles first-run setup for fresh installations.
 * Detects if the system needs initial configuration and provides
 * endpoints to set up the organization, admin user, and AI agent.
 */

import { Router, Request, Response } from 'express';
import { Organization, MarketplaceUser, Settings } from '../models';

const router = Router();

/**
 * @swagger
 * /api/setup/status:
 *   get:
 *     summary: Check if first-run setup is needed
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Setup status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Check if any organization exists
    const orgCount = await Organization.count();
    const userCount = await MarketplaceUser.count();

    // Get AI agent settings if they exist
    const agentName = await Settings.findByPk('agent_name');
    const agentAvatar = await Settings.findByPk('agent_avatar');

    const needsSetup = orgCount === 0;

    res.json({
      success: true,
      data: {
        needsSetup,
        hasOrganization: orgCount > 0,
        hasUsers: userCount > 0,
        agentConfig: {
          name: agentName?.value || 'Diana',
          avatar: agentAvatar?.value || '/agent.png',
        },
      },
    });
  } catch (error) {
    console.error('Setup status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check setup status',
    });
  }
});

/**
 * @swagger
 * /api/setup/initialize:
 *   post:
 *     summary: Initialize the system with first organization and admin
 *     tags: [Setup]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationName
 *             properties:
 *               organizationName:
 *                 type: string
 *               organizationSlug:
 *                 type: string
 *               agentName:
 *                 type: string
 *               agentAvatar:
 *                 type: string
 *               agentPersonality:
 *                 type: string
 *               teamMembers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const {
      organizationName,
      organizationSlug,
      agentName = 'Diana',
      agentAvatar = '/agent.png',
      agentPersonality = 'friendly and professional',
      teamMembers = [],
    } = req.body;

    // Validate required fields
    if (!organizationName) {
      return res.status(400).json({
        success: false,
        error: 'Organization name is required',
      });
    }

    // Check if already initialized
    const existingOrg = await Organization.count();
    if (existingOrg > 0) {
      return res.status(400).json({
        success: false,
        error: 'System is already initialized',
      });
    }

    // Generate slug if not provided
    const slug = organizationSlug || organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Create the organization
    const organization = await Organization.create({
      name: organizationName,
      slug,
      status: 'active',
      plan: 'professional',
    });

    // Save AI agent settings
    await Settings.upsert({
      key: 'agent_name',
      value: agentName,
      type: 'string',
      category: 'general',
      description: 'AI Agent display name',
    });

    await Settings.upsert({
      key: 'agent_avatar',
      value: agentAvatar,
      type: 'string',
      category: 'general',
      description: 'AI Agent avatar URL',
    });

    await Settings.upsert({
      key: 'agent_personality',
      value: agentPersonality,
      type: 'string',
      category: 'general',
      description: 'AI Agent personality description',
    });

    // Create placeholder team members (they'll need to sign up via Supabase)
    const createdMembers = [];
    for (const member of teamMembers) {
      if (member.email) {
        // Create a placeholder user that will be linked when they sign up
        const user = await MarketplaceUser.create({
          email: member.email,
          name: member.name || member.email.split('@')[0],
          role: member.role || 'user',
          organizationId: organization.id,
          verified: false,
        });
        createdMembers.push({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        });
      }
    }

    res.json({
      success: true,
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        agentConfig: {
          name: agentName,
          avatar: agentAvatar,
          personality: agentPersonality,
        },
        teamMembers: createdMembers,
      },
    });
  } catch (error) {
    console.error('Setup initialization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize system',
    });
  }
});

/**
 * @swagger
 * /api/setup/agent:
 *   put:
 *     summary: Update AI agent settings
 *     tags: [Setup]
 */
router.put('/agent', async (req: Request, res: Response) => {
  try {
    const { name, avatar, personality } = req.body;

    if (name) {
      await Settings.upsert({
        key: 'agent_name',
        value: name,
        type: 'string',
        category: 'general',
        description: 'AI Agent display name',
      });
    }

    if (avatar) {
      await Settings.upsert({
        key: 'agent_avatar',
        value: avatar,
        type: 'string',
        category: 'general',
        description: 'AI Agent avatar URL',
      });
    }

    if (personality) {
      await Settings.upsert({
        key: 'agent_personality',
        value: personality,
        type: 'string',
        category: 'general',
        description: 'AI Agent personality description',
      });
    }

    res.json({
      success: true,
      data: { name, avatar, personality },
    });
  } catch (error) {
    console.error('Agent settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update agent settings',
    });
  }
});

/**
 * @swagger
 * /api/setup/agent:
 *   get:
 *     summary: Get AI agent settings
 *     tags: [Setup]
 */
router.get('/agent', async (req: Request, res: Response) => {
  try {
    const agentName = await Settings.findByPk('agent_name');
    const agentAvatar = await Settings.findByPk('agent_avatar');
    const agentPersonality = await Settings.findByPk('agent_personality');

    res.json({
      success: true,
      data: {
        name: agentName?.value || 'Diana',
        avatar: agentAvatar?.value || '/agent.png',
        personality: agentPersonality?.value || 'friendly and professional',
      },
    });
  } catch (error) {
    console.error('Get agent settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent settings',
    });
  }
});

export default router;
