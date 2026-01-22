/**
 * Seed Default Follow-Up Chains
 *
 * Creates pre-configured follow-up chains for common scenarios.
 */

import FollowUpChain, { FollowUpStep } from '../models/FollowUpChain';

export async function seedFollowUpChains(): Promise<void> {
  console.log('🌱 Seeding default follow-up chains...');

  const chains = [
    // Chain 1: Offer No-Response Follow-up
    {
      name: 'Offer No-Response Follow-up',
      description: 'Automated follow-up sequence when an offer receives no response',
      triggerEvent: 'offer.no_response',
      priority: 10,
      steps: [
        {
          stepNumber: 1,
          name: 'Initial Check-in Email',
          delayDays: 0,
          delayHours: 0,
          actionType: 'send_email',
          actionConfig: {
            to: 'seller',
            subject: 'Checking in on your offer for {{address}}',
            template: `
              <h2>Following Up on Your Offer</h2>
              <p>Hi,</p>
              <p>We wanted to check in regarding the offer of \${{offerAmount}} for the property at {{address}}.</p>
              <p>Please let us know if you have any questions or would like to discuss the terms.</p>
              <p>Best regards,<br>The Dispotree Team</p>
            `,
          },
        },
        {
          stepNumber: 2,
          name: 'SMS Follow-up',
          delayDays: 3,
          delayHours: 0,
          actionType: 'send_sms',
          actionConfig: {
            message: 'Quick follow-up on the offer for {{address}}. Any updates? Reply or call us.',
          },
        },
        {
          stepNumber: 3,
          name: 'Create Call Task',
          delayDays: 5,
          delayHours: 0,
          actionType: 'create_task',
          actionConfig: {
            taskTitle: 'Call seller about offer - {{address}}',
            taskDescription: 'Offer has been pending for 5 days with no response. Call to follow up.',
            priority: 'high',
          },
        },
        {
          stepNumber: 4,
          name: 'Final Follow-up Email',
          delayDays: 10,
          delayHours: 0,
          actionType: 'send_email',
          actionConfig: {
            to: 'seller',
            subject: 'Final follow-up - Offer expiring soon for {{address}}',
            template: `
              <h2>Final Follow-Up</h2>
              <p>Hi,</p>
              <p>This is our final follow-up regarding the offer of \${{offerAmount}} for {{address}}.</p>
              <p>The offer will expire in a few days if we don't hear back.</p>
              <p>Please respond at your earliest convenience.</p>
              <p>Best regards,<br>The Dispotree Team</p>
            `,
          },
        },
        {
          stepNumber: 5,
          name: 'Archive Offer',
          delayDays: 14,
          delayHours: 0,
          actionType: 'archive',
          actionConfig: {
            reason: 'No response after 14 days',
          },
        },
      ] as FollowUpStep[],
      stopChainConditions: [
        { field: 'offer.status', operator: '!=', value: 'pending' },
      ],
    },

    // Chain 2: Stale Deal Re-engagement
    {
      name: 'Stale Deal Re-engagement',
      description: 'Reactivate deals that have been inactive for too long',
      triggerEvent: 'deal.stale',
      priority: 20,
      steps: [
        {
          stepNumber: 1,
          name: 'Tag and Create Task',
          delayDays: 0,
          delayHours: 0,
          actionType: 'add_tag',
          actionConfig: {
            tag: 'needs-attention',
          },
        },
        {
          stepNumber: 2,
          name: 'Create Review Task',
          delayDays: 0,
          delayHours: 1,
          actionType: 'create_task',
          actionConfig: {
            taskTitle: 'Review stale deal - {{address}}',
            taskDescription: 'This deal has had no activity in 7+ days. Review and take action.',
            priority: 'medium',
          },
        },
        {
          stepNumber: 3,
          name: 'Notify Matched Buyers',
          delayDays: 3,
          delayHours: 0,
          actionType: 'notify_user',
          actionConfig: {
            subject: 'Price reduction opportunity - {{address}}',
            template: 'Consider a 5% price reduction to attract more interest.',
          },
        },
        {
          stepNumber: 4,
          name: 'Suggest Price Reduction',
          delayDays: 7,
          delayHours: 0,
          actionType: 'send_email',
          actionConfig: {
            to: 'seller',
            subject: 'Market Update - {{address}}',
            template: `
              <h2>Market Update</h2>
              <p>Hi,</p>
              <p>Your property at {{address}} has been on the market for a while.</p>
              <p>Based on current market conditions, a 5% price reduction might help attract more buyers.</p>
              <p>Let us know if you'd like to discuss this option.</p>
              <p>Best regards,<br>The Dispotree Team</p>
            `,
          },
        },
        {
          stepNumber: 5,
          name: 'Move to Cold Pipeline',
          delayDays: 14,
          delayHours: 0,
          actionType: 'update_status',
          actionConfig: {
            newStatus: 'cold',
          },
        },
      ] as FollowUpStep[],
      stopChainConditions: [
        { field: 'deal.updatedAt', operator: '>', value: 'now-1d' },
      ],
    },

    // Chain 3: Post-Rejection Re-engagement
    {
      name: 'Post-Rejection Re-engagement',
      description: 'Follow up after an offer is rejected',
      triggerEvent: 'offer.rejected',
      priority: 30,
      steps: [
        {
          stepNumber: 1,
          name: 'Create Review Task',
          delayDays: 0,
          delayHours: 0,
          actionType: 'create_task',
          actionConfig: {
            taskTitle: 'Review rejection feedback - {{address}}',
            taskDescription: 'Analyze why the offer was rejected and identify improvement opportunities.',
            priority: 'medium',
          },
        },
        {
          stepNumber: 2,
          name: 'Market Update Email',
          delayDays: 7,
          delayHours: 0,
          actionType: 'send_email',
          actionConfig: {
            to: 'seller',
            subject: 'Market Update for {{address}}',
            template: `
              <h2>Market Update</h2>
              <p>Hi,</p>
              <p>We wanted to share some recent market updates that might be relevant to your property at {{address}}.</p>
              <p>If you're still looking to sell, we'd love to reconnect and discuss options.</p>
              <p>Best regards,<br>The Dispotree Team</p>
            `,
          },
        },
        {
          stepNumber: 3,
          name: 'Check for Price Drop',
          delayDays: 14,
          delayHours: 0,
          actionType: 'notify_user',
          actionConfig: {
            subject: 'Re-evaluation - {{address}}',
            template: 'Check if the property has had a price drop and consider resubmitting.',
          },
        },
        {
          stepNumber: 4,
          name: 'Archive from Active Tracking',
          delayDays: 30,
          delayHours: 0,
          actionType: 'add_tag',
          actionConfig: {
            tag: 'archived-rejected',
          },
        },
      ] as FollowUpStep[],
      stopChainConditions: [
        { field: 'offer.status', operator: '==', value: 'accepted' },
      ],
    },

    // Chain 4: Contract Sent Follow-up
    {
      name: 'Contract Sent Follow-up',
      description: 'Follow up after a contract is sent for signature',
      triggerEvent: 'contract.sent',
      priority: 5,
      steps: [
        {
          stepNumber: 1,
          name: 'Reminder Email',
          delayDays: 2,
          delayHours: 0,
          actionType: 'send_email',
          actionConfig: {
            to: 'seller',
            subject: 'Reminder: Contract awaiting signature - {{address}}',
            template: `
              <h2>Contract Reminder</h2>
              <p>Hi,</p>
              <p>This is a friendly reminder that the contract for {{address}} is awaiting your signature.</p>
              <p>Please review and sign at your earliest convenience.</p>
              <p>Best regards,<br>The Dispotree Team</p>
            `,
          },
        },
        {
          stepNumber: 2,
          name: 'SMS Reminder',
          delayDays: 4,
          delayHours: 0,
          actionType: 'send_sms',
          actionConfig: {
            message: 'Contract for {{address}} awaits your signature. Please sign to proceed.',
          },
        },
        {
          stepNumber: 3,
          name: 'Urgent Task',
          delayDays: 6,
          delayHours: 0,
          actionType: 'create_task',
          actionConfig: {
            taskTitle: 'URGENT: Contract unsigned - {{address}}',
            taskDescription: 'Contract has been pending signature for 6 days. Immediate follow-up required.',
            priority: 'high',
          },
        },
      ] as FollowUpStep[],
      stopChainConditions: [
        { field: 'contract.status', operator: '==', value: 'signed' },
      ],
    },

    // Chain 5: New Lead Nurturing
    {
      name: 'New Lead Nurturing',
      description: 'Nurture newly created deals',
      triggerEvent: 'deal.created',
      priority: 50,
      steps: [
        {
          stepNumber: 1,
          name: 'Welcome Email',
          delayDays: 0,
          delayHours: 1,
          actionType: 'send_email',
          actionConfig: {
            to: 'seller',
            subject: 'Welcome to Dispotree - {{address}}',
            template: `
              <h2>Welcome!</h2>
              <p>Hi,</p>
              <p>Thank you for listing your property at {{address}} with us.</p>
              <p>Our team is reviewing your listing and will match it with qualified buyers.</p>
              <p>You can expect to hear from us within 24-48 hours.</p>
              <p>Best regards,<br>The Dispotree Team</p>
            `,
          },
        },
        {
          stepNumber: 2,
          name: 'Status Update',
          delayDays: 2,
          delayHours: 0,
          actionType: 'notify_user',
          actionConfig: {
            subject: 'Review new deal - {{address}}',
            template: 'New deal has been in system for 2 days. Review matching status.',
          },
        },
        {
          stepNumber: 3,
          name: 'Follow-up if No Activity',
          delayDays: 5,
          delayHours: 0,
          actionType: 'create_task',
          actionConfig: {
            taskTitle: 'Check deal progress - {{address}}',
            taskDescription: 'Deal has been in system for 5 days. Check for buyer matches and next steps.',
            priority: 'medium',
          },
          conditions: {
            skipIf: [
              { field: 'deal.hasOffers', operator: '==', value: true },
            ],
          },
        },
      ] as FollowUpStep[],
      stopChainConditions: [
        { field: 'deal.status', operator: '==', value: 'under_contract' },
      ],
    },
  ];

  for (const chainData of chains) {
    try {
      const existing = await FollowUpChain.findOne({
        where: { name: chainData.name },
      });

      if (existing) {
        // Update existing chain
        await existing.update({
          description: chainData.description,
          triggerEvent: chainData.triggerEvent as any,
          priority: chainData.priority,
          steps: chainData.steps,
        });
        console.log(`   📝 Updated: ${chainData.name}`);
      } else {
        // Create new chain
        await FollowUpChain.create({
          name: chainData.name,
          description: chainData.description,
          triggerEvent: chainData.triggerEvent as any,
          priority: chainData.priority,
          steps: chainData.steps,
          isActive: true,
        });
        console.log(`   ✅ Created: ${chainData.name}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to seed ${chainData.name}:`, error);
    }
  }

  console.log('🌱 Follow-up chains seeding complete');
}

export default seedFollowUpChains;
