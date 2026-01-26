import { Request, Response } from 'express';
import { signatureService } from '../services/SignatureService';

/**
 * Signature Controller
 *
 * Handles HTTP requests for signature operations.
 * Includes both authenticated (user) and public (token-based) endpoints.
 */

export const signatureController = {
  // ===========================================================================
  // AUTHENTICATED ENDPOINTS (require auth)
  // ===========================================================================

  /**
   * Request a signature from a contact
   * POST /api/contacts/:id/request-signature
   * Body: { sendSms?: boolean } - default true
   */
  async requestSignature(req: Request, res: Response) {
    try {
      const { id: contactId } = req.params;
      const { sendSms = true } = req.body;
      const userId = (req as any).user?.id;
      const organizationId = (req as any).user?.organizationId;

      if (!userId || !organizationId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await signatureService.createSignatureRequest(
        contactId,
        userId,
        organizationId,
        { sendSms }
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.status(201).json({
        success: true,
        data: {
          requestId: result.request!.id,
          token: result.request!.token,
          expiresAt: result.request!.expiresAt,
          signatureUrl: result.signatureUrl,
          smsSent: sendSms,
        },
      });
    } catch (error: any) {
      console.error('[SignatureController] requestSignature error:', error);
      return res.status(500).json({ success: false, error: 'Failed to request signature' });
    }
  },

  /**
   * Get a contact's signature
   * GET /api/contacts/:id/signature
   */
  async getContactSignature(req: Request, res: Response) {
    try {
      const { id: contactId } = req.params;

      const result = await signatureService.getContactSignature(contactId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        data: {
          hasSignature: result.hasSignature,
          signatureUrl: result.signatureUrl,
          signatureUpdatedAt: result.signatureUpdatedAt,
        },
      });
    } catch (error: any) {
      console.error('[SignatureController] getContactSignature error:', error);
      return res.status(500).json({ success: false, error: 'Failed to get signature' });
    }
  },

  /**
   * Delete a contact's signature
   * DELETE /api/contacts/:id/signature
   */
  async deleteContactSignature(req: Request, res: Response) {
    try {
      const { id: contactId } = req.params;

      const result = await signatureService.deleteContactSignature(contactId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error('[SignatureController] deleteContactSignature error:', error);
      return res.status(500).json({ success: false, error: 'Failed to delete signature' });
    }
  },

  /**
   * Get pending signature request for a contact
   * GET /api/contacts/:id/signature-request
   */
  async getPendingRequest(req: Request, res: Response) {
    try {
      const { id: contactId } = req.params;

      const request = await signatureService.getPendingRequest(contactId);

      return res.json({
        success: true,
        data: request
          ? {
              id: request.id,
              status: request.status,
              expiresAt: request.expiresAt,
              createdAt: request.createdAt,
            }
          : null,
      });
    } catch (error: any) {
      console.error('[SignatureController] getPendingRequest error:', error);
      return res.status(500).json({ success: false, error: 'Failed to get pending request' });
    }
  },

  // ===========================================================================
  // PUBLIC ENDPOINTS (token-based auth)
  // ===========================================================================

  /**
   * Get signature request details by token (public)
   * GET /api/signatures/request/:token
   */
  async getRequestByToken(req: Request, res: Response) {
    try {
      const { token } = req.params;

      const result = await signatureService.getRequestByToken(token);

      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error });
      }

      const { request, contact, organization } = result;

      return res.json({
        success: true,
        data: {
          status: request!.status,
          expiresAt: request!.expiresAt,
          contactName: contact?.name,
          organizationName: organization?.name,
        },
      });
    } catch (error: any) {
      console.error('[SignatureController] getRequestByToken error:', error);
      return res.status(500).json({ success: false, error: 'Failed to get request' });
    }
  },

  /**
   * Upload and process signature (public)
   * POST /api/signatures/upload/:token
   */
  async uploadSignature(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const { cleanupStrength } = req.body;

      // Get uploaded file from multer
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const result = await signatureService.processSignature(
        token,
        file.buffer,
        {
          cleanupStrength: cleanupStrength ? parseInt(cleanupStrength, 10) : undefined,
        }
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        data: {
          signatureUrl: result.signedUrl,
        },
      });
    } catch (error: any) {
      console.error('[SignatureController] uploadSignature error:', error);
      return res.status(500).json({ success: false, error: 'Failed to upload signature' });
    }
  },
};

export default signatureController;
