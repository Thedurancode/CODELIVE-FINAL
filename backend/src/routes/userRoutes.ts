/**
 * User Routes
 *
 * Routes for user profile management including avatar upload.
 */

import { Router, Request, Response } from 'express';
import { uploadSingle } from '../middleware/upload';
import { authenticate } from '../middleware/auth';
import MarketplaceUser from '../models/MarketplaceUser';
import fs from 'fs';

const router = Router();

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const user = await MarketplaceUser.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'avatar', 'phone', 'title', 'createdAt'],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user profile',
    });
  }
});

/**
 * @swagger
 * /api/users/me/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
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
 *         description: Avatar uploaded successfully
 *       400:
 *         description: No file uploaded
 */
router.post('/me/avatar', authenticate, uploadSingle, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const file = req.file;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    // Import storage service dynamically
    const { storageService } = await import('../services/StorageService');

    // Upload to storage with user-specific path
    const avatarUrl = await storageService.uploadFile(file.path, `users/${userId}/avatar`, file.originalname);

    // Update user with avatar URL
    const user = await MarketplaceUser.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    await user.update({ avatar: avatarUrl });

    // Clean up temp file
    fs.unlink(file.path, () => {});

    res.json({
      success: true,
      data: { avatar: avatarUrl },
    });
  } catch (error) {
    // Clean up temp file on error
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload avatar',
    });
  }
});

/**
 * @swagger
 * /api/users/me/avatar:
 *   delete:
 *     summary: Delete user avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Avatar deleted successfully
 */
router.delete('/me/avatar', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const user = await MarketplaceUser.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    await user.update({ avatar: null });

    res.json({
      success: true,
      message: 'Avatar deleted',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete avatar',
    });
  }
});

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               title:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.patch('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { name, phone, title } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const user = await MarketplaceUser.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (title !== undefined) updates.title = title;

    await user.update(updates);

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        title: user.title,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    });
  }
});

export default router;
