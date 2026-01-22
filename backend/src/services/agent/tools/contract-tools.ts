/**
 * Contract Tools
 *
 * Tools for managing contracts and e-signatures via DocuSeal.
 */

import { z } from 'zod';
import { toolRegistry, success, failure, defineTool } from './registry';
import { docuSealService } from '../../DocuSealService';

/**
 * Register all contract tools with the registry
 */
export function registerContractTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // LIST CONTRACT TEMPLATES
    // =========================================================================
    defineTool({
      name: 'list_contract_templates',
      description: 'List all available contract templates for e-signatures.',
      category: 'contract',
      schema: z.object({}),
      handler: async (input, context) => {
        try {
          if (!docuSealService.isReady()) {
            return success({
              templates: [],
              message: 'Contract service not available. Please check DocuSeal configuration.',
            });
          }

          const result = await docuSealService.listTemplates({ limit: 50 });

          return success({
            templates: result.map((t: any) => ({
              id: t.id,
              name: t.name,
              createdAt: t.created_at,
              fields: t.fields?.length || 0,
            })),
            count: result.length,
          });
        } catch (error) {
          return failure(`Error listing contract templates: ${error}`);
        }
      },
      cacheable: true,
      cacheTTL: 60 * 60, // 1 hour
    }),

    // =========================================================================
    // SEND CONTRACT
    // =========================================================================
    defineTool({
      name: 'send_contract',
      description: 'Send a contract for e-signature to specified recipients.',
      category: 'contract',
      schema: z.object({
        templateId: z.string().describe('Contract template ID'),
        recipients: z
          .array(
            z.object({
              name: z.string().describe('Recipient name'),
              email: z.string().describe('Recipient email'),
              role: z.string().optional().describe('Role in contract (buyer, seller, etc.)'),
            })
          )
          .describe('List of recipients'),
        propertyId: z.string().optional().describe('Related property ID'),
        customFields: z
          .record(z.string(), z.string())
          .optional()
          .describe('Custom field values for the contract'),
        message: z.string().optional().describe('Custom message to include'),
        expiresInDays: z.number().optional().default(7).describe('Days until expiration'),
      }),
      handler: async (input, context) => {
        try {
          if (!docuSealService.isReady()) {
            return failure('Contract service not available.');
          }

          const result = await docuSealService.createSubmission({
            templateId: parseInt(input.templateId),
            submitters: input.recipients.map((r: any) => ({
              email: r.email,
              name: r.name,
              role: r.role || 'Signer',
            })),
            sendEmail: true,
            message: input.message ? { body: input.message } : undefined,
          });

          return success({
            submissionId: result.id,
            status: result.status,
            recipients: input.recipients.map((r: any) => r.email),
            message: `Contract sent to ${input.recipients.length} recipient(s) for signature.`,
          });
        } catch (error) {
          return failure(`Error sending contract: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // GET CONTRACT STATUS
    // =========================================================================
    defineTool({
      name: 'get_contract_status',
      description: 'Check the status of a sent contract.',
      category: 'contract',
      schema: z.object({
        submissionId: z.string().describe('Contract submission ID'),
      }),
      handler: async (input, context) => {
        try {
          if (!docuSealService.isReady()) {
            return failure('Contract service not available.');
          }

          const submission = await docuSealService.getSubmission(parseInt(input.submissionId));

          return success({
            submissionId: input.submissionId,
            status: submission.status,
            completedAt: submission.completed_at,
            submitters: submission.submitters?.map((s: any) => ({
              email: s.email,
              name: s.name,
              status: s.status,
              completedAt: s.completed_at,
            })),
          });
        } catch (error) {
          return failure(`Error getting contract status: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // RESEND CONTRACT REMINDER
    // =========================================================================
    defineTool({
      name: 'resend_contract_reminder',
      description: 'Send a reminder to recipients who have not yet signed.',
      category: 'contract',
      schema: z.object({
        submissionId: z.string().describe('Contract submission ID'),
        message: z.string().optional().describe('Custom reminder message'),
      }),
      handler: async (input, context) => {
        try {
          if (!docuSealService.isReady()) {
            return failure('Contract service not available.');
          }

          // Get submission to find pending submitters
          const submission = await docuSealService.getSubmission(parseInt(input.submissionId));
          const pendingSubmitters = submission.submitters?.filter((s: any) => s.status === 'pending') || [];

          // Send reminder to each pending submitter
          let remindersSent = 0;
          for (const submitter of pendingSubmitters) {
            try {
              await docuSealService.resendEmail(submitter.id);
              remindersSent++;
            } catch (e) {
              // Continue with other submitters
            }
          }

          return success({
            submissionId: input.submissionId,
            remindersSent,
            recipients: pendingSubmitters.map((s: any) => s.email),
            message: `Reminder sent to ${remindersSent} recipient(s).`,
          });
        } catch (error) {
          return failure(`Error sending reminder: ${error}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerContractTools;
