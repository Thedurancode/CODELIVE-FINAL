/**
 * Team Member Routes
 *
 * API endpoints for team member profiles and deal assignments.
 */

import { Router, Request, Response } from 'express';
import MarketplaceUser from '../models/MarketplaceUser';
import DealTeamMember from '../models/DealTeamMember';
import Property from '../models/Property';
import Contact, { ContactType } from '../models/Contact';
import Organization from '../models/Organization';
import { authenticate } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/team/profile:
 *   get:
 *     summary: Get current user's team profile
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Team member profile
 */
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const user = await MarketplaceUser.findByPk(userId, {
      attributes: [
        'id', 'email', 'name', 'phone', 'company', 'role', 'avatar',
        'bio', 'expertise', 'title', 'timezone', 'organizationId',
        'notifyEmail', 'notifySms', 'notifyPush', 'dealAlerts', 'instantAlerts',
        'createdAt', 'lastActiveAt'
      ],
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error fetching team profile:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/profile:
 *   patch:
 *     summary: Update current user's team profile
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bio:
 *                 type: string
 *               expertise:
 *                 type: array
 *                 items:
 *                   type: string
 *               title:
 *                 type: string
 *               phone:
 *                 type: string
 *               timezone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.patch('/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const user = await MarketplaceUser.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Only allow updating specific profile fields
    const allowedFields = ['bio', 'expertise', 'title', 'phone', 'timezone', 'avatar', 'name'];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    await user.update(updates);

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        bio: user.bio,
        expertise: user.expertise,
        title: user.title,
        timezone: user.timezone,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('Error updating team profile:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/profile/notifications:
 *   patch:
 *     summary: Update notification preferences
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/profile/notifications', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const user = await MarketplaceUser.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const allowedFields = ['notifyEmail', 'notifySms', 'notifyPush', 'dealAlerts', 'instantAlerts', 'dailyDigest'];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    await user.update(updates);

    res.json({
      success: true,
      data: {
        notifyEmail: user.notifyEmail,
        notifySms: user.notifySms,
        notifyPush: user.notifyPush,
        dealAlerts: user.dealAlerts,
        instantAlerts: user.instantAlerts,
        dailyDigest: user.dailyDigest,
      },
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/members:
 *   get:
 *     summary: List all team members in the organization
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 */
router.get('/members', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const members = await MarketplaceUser.findAll({
      where: { organizationId },
      attributes: [
        'id', 'email', 'name', 'phone', 'role', 'avatar',
        'bio', 'expertise', 'title', 'timezone', 'lastActiveAt'
      ],
      order: [['name', 'ASC']],
    });

    res.json({ success: true, data: members });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/members/{userId}:
 *   get:
 *     summary: Get a specific team member's profile
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 */
router.get('/members/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const organizationId = (req as any).organizationId;

    const user = await MarketplaceUser.findOne({
      where: { id: userId, organizationId },
      attributes: [
        'id', 'email', 'name', 'phone', 'company', 'role', 'avatar',
        'bio', 'expertise', 'title', 'timezone', 'lastActiveAt'
      ],
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    // Get deals assigned to this team member
    const dealAssignments = await DealTeamMember.findAll({
      where: { userId, organizationId, isActive: true },
      include: [{
        model: Property,
        as: 'property',
        attributes: ['id', 'address', 'city', 'state', 'askingPrice', 'status'],
      }],
      order: [['assignedAt', 'DESC']],
      limit: 10,
    });

    res.json({
      success: true,
      data: {
        ...user.toJSON(),
        dealAssignments: dealAssignments.map(da => ({
          propertyId: da.propertyId,
          role: da.dealRole,
          assignedAt: da.assignedAt,
          property: da.property,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching team member:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/members/{userId}:
 *   patch:
 *     summary: Update a team member's profile (admin only)
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               company:
 *                 type: string
 *               title:
 *                 type: string
 *               bio:
 *                 type: string
 *               expertise:
 *                 type: array
 *                 items:
 *                   type: string
 *               timezone:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated team member
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Team member not found
 */
router.patch('/members/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = (req as any).userId;
    const organizationId = (req as any).organizationId;
    const currentUserRole = (req as any).user?.role;

    // Check if current user has permission (admin or super_admin)
    const adminRoles = ['super_admin', 'admin', 'broker'];
    if (!adminRoles.includes(currentUserRole)) {
      return res.status(403).json({
        success: false,
        error: 'Only admins can edit other team members'
      });
    }

    const user = await MarketplaceUser.findOne({
      where: { id: userId, organizationId },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    // Prevent editing super_admin unless you are super_admin
    if (user.role === 'super_admin' && currentUserRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot edit super admin'
      });
    }

    // Allow updating these fields
    const allowedFields = ['name', 'phone', 'company', 'title', 'bio', 'expertise', 'timezone', 'avatar'];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Role changes require additional permission check
    if (req.body.role !== undefined) {
      // Only super_admin can promote to admin/super_admin
      if (['super_admin', 'admin'].includes(req.body.role) && currentUserRole !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super admin can promote to admin roles'
        });
      }
      updates.role = req.body.role;
    }

    await user.update(updates);

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        company: user.company,
        role: user.role,
        title: user.title,
        bio: user.bio,
        expertise: user.expertise,
        timezone: user.timezone,
        avatar: user.avatar,
        lastActiveAt: user.lastActiveAt,
      },
      message: `Team member "${user.name}" updated successfully`,
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/my-deals:
 *   get:
 *     summary: Get deals assigned to the current user
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my-deals', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const organizationId = (req as any).organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const assignments = await DealTeamMember.findAll({
      where: { userId, organizationId, isActive: true },
      include: [{
        model: Property,
        as: 'property',
        attributes: ['id', 'address', 'city', 'state', 'askingPrice', 'status', 'propertyType', 'bedrooms', 'bathrooms'],
      }],
      order: [['assignedAt', 'DESC']],
    });

    res.json({
      success: true,
      data: assignments.map(a => ({
        id: a.id,
        propertyId: a.propertyId,
        role: a.dealRole,
        assignedAt: a.assignedAt,
        notifyOnOffer: a.notifyOnOffer,
        notifyOnMessage: a.notifyOnMessage,
        notifyOnStatusChange: a.notifyOnStatusChange,
        notifyOnDocument: a.notifyOnDocument,
        notifyOnNote: a.notifyOnNote,
        property: a.property,
      })),
    });
  } catch (error) {
    console.error('Error fetching my deals:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/deals/{propertyId}/notifications:
 *   patch:
 *     summary: Update notification preferences for a specific deal
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/deals/:propertyId/notifications', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const organizationId = (req as any).organizationId;
    const propertyId = parseInt(req.params.propertyId);

    if (!userId || !organizationId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const assignment = await DealTeamMember.findOne({
      where: { userId, organizationId, propertyId },
    });

    if (!assignment) {
      return res.status(404).json({ success: false, error: 'Not assigned to this deal' });
    }

    const allowedFields = ['notifyOnOffer', 'notifyOnMessage', 'notifyOnStatusChange', 'notifyOnDocument', 'notifyOnNote'];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    await assignment.update(updates);

    res.json({
      success: true,
      data: {
        propertyId: assignment.propertyId,
        notifyOnOffer: assignment.notifyOnOffer,
        notifyOnMessage: assignment.notifyOnMessage,
        notifyOnStatusChange: assignment.notifyOnStatusChange,
        notifyOnDocument: assignment.notifyOnDocument,
        notifyOnNote: assignment.notifyOnNote,
      },
    });
  } catch (error) {
    console.error('Error updating deal notification preferences:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/invite:
 *   post:
 *     summary: Invite a user to join your organization
 *     description: Add an existing user to your organization by email. The user must already have an account.
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [team_member, admin, broker, broker_assistant]
 *                 default: team_member
 *     responses:
 *       200:
 *         description: User added to organization
 *       400:
 *         description: User not found or already in an organization
 *       403:
 *         description: Not authorized
 */
router.post('/invite', async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).userId;
    const organizationId = (req as any).organizationId;
    const currentUserRole = (req as any).user?.role;
    const { email, role = 'team_member' } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'You must be in an organization to invite members',
      });
    }

    // Check if current user has permission
    const adminRoles = ['super_admin', 'admin', 'broker'];
    if (!adminRoles.includes(currentUserRole)) {
      return res.status(403).json({
        success: false,
        error: 'Only admins can invite team members',
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    // Find the user by email
    const userToInvite = await MarketplaceUser.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!userToInvite) {
      return res.status(400).json({
        success: false,
        error: 'User not found',
        message: `No user found with email ${email}. They need to create an account first.`,
      });
    }

    // Check if user is already in this organization
    if (userToInvite.organizationId === organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Already a member',
        message: 'This user is already in your organization',
      });
    }

    // Update user's organization (this removes them from their old org)
    await userToInvite.update({
      organizationId,
      role: role || 'team_member',
    });

    // Create a contact record for this user in the organization
    const existingContact = await Contact.findOne({
      where: { linkedUserId: userToInvite.id, organizationId },
    });

    if (!existingContact) {
      const roleToType: Record<string, ContactType> = {
        buyer: 'buyer',
        investor: 'buyer',
        wholesaler: 'wholesaler',
        agent: 're_agent',
        broker: 'broker',
        broker_assistant: 'broker',
        transaction_coordinator: 'transaction_coordinator',
        team_member: 'team_member',
        admin: 'team_member',
        super_admin: 'team_member',
      };

      await Contact.create({
        organizationId,
        createdById: currentUserId,
        linkedUserId: userToInvite.id,
        type: roleToType[userToInvite.role] || 'team_member',
        name: userToInvite.name,
        email: userToInvite.email,
        phone: userToInvite.phone || null,
        company: userToInvite.company || null,
        status: 'active',
        tags: ['team-member', 'invited'],
      });
    }

    res.json({
      success: true,
      message: `${userToInvite.name} has been added to your organization`,
      data: {
        id: userToInvite.id,
        email: userToInvite.email,
        name: userToInvite.name,
        role: userToInvite.role,
      },
    });
  } catch (error) {
    console.error('Error inviting team member:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/sync-contacts:
 *   post:
 *     summary: Sync all organization members to contacts
 *     description: Creates Contact records for all users in your organization who don't have one yet.
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contacts synced
 */
router.post('/sync-contacts', async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).userId;
    const organizationId = (req as any).organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'You must be in an organization to sync contacts',
      });
    }

    // Get all users in the organization
    const orgMembers = await MarketplaceUser.findAll({
      where: { organizationId },
    });

    const roleToType: Record<string, ContactType> = {
      buyer: 'buyer',
      investor: 'buyer',
      wholesaler: 'wholesaler',
      agent: 're_agent',
      broker: 'broker',
      broker_assistant: 'broker',
      transaction_coordinator: 'transaction_coordinator',
      team_member: 'team_member',
      admin: 'team_member',
      super_admin: 'team_member',
    };

    let created = 0;
    let skipped = 0;

    for (const member of orgMembers) {
      // Check if contact already exists
      const existingContact = await Contact.findOne({
        where: { linkedUserId: member.id, organizationId },
      });

      if (existingContact) {
        skipped++;
        continue;
      }

      // Create contact for this member
      await Contact.create({
        organizationId,
        createdById: currentUserId,
        linkedUserId: member.id,
        type: roleToType[member.role] || 'team_member',
        name: member.name,
        email: member.email,
        phone: member.phone || null,
        company: member.company || null,
        status: 'active',
        tags: ['team-member', 'auto-synced'],
      });
      created++;
    }

    res.json({
      success: true,
      message: `Synced ${created} contacts (${skipped} already existed)`,
      data: {
        created,
        skipped,
        total: orgMembers.length,
      },
    });
  } catch (error) {
    console.error('Error syncing contacts:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * @swagger
 * /api/team/organization:
 *   get:
 *     summary: Get current user's organization details
 *     tags: [Team]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Organization details
 */
router.get('/organization', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).organizationId;

    if (!organizationId) {
      return res.status(404).json({
        success: false,
        error: 'No organization',
        message: 'You are not part of any organization. Please log out and log back in to create one.',
      });
    }

    const organization = await Organization.findByPk(organizationId);

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    // Get member count
    const memberCount = await MarketplaceUser.count({
      where: { organizationId },
    });

    res.json({
      success: true,
      data: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        plan: organization.plan,
        memberCount,
      },
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
