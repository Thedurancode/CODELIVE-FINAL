/**
 * FollowUpService
 *
 * Manages follow-up chains:
 * - Start chains based on triggers
 * - Execute chain steps
 * - Handle stop conditions
 * - Process due follow-ups
 */

import FollowUpChain, { FollowUpStep, FollowUpTriggerEvent, FollowUpActionType } from '../models/FollowUpChain';
import FollowUpExecution, { StepExecutionRecord } from '../models/FollowUpExecution';
import Property from '../models/Property';
import DealOffer from '../models/DealOffer';
import { notificationService } from './NotificationService';
import { Resend } from 'resend';
import Twilio from 'twilio';

// Initialize services
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const twilioClient = process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN
  ? Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

class FollowUpService {
  /**
   * Start a follow-up chain for a deal/offer
   */
  async startChain(
    chainId: string,
    options: {
      dealId?: string;
      offerId?: string;
      userId: string;
      context?: Record<string, any>;
    }
  ): Promise<FollowUpExecution> {
    const { dealId, offerId, userId, context = {} } = options;

    const chain = await FollowUpChain.findByPk(chainId);
    if (!chain) {
      throw new Error(`Follow-up chain ${chainId} not found`);
    }

    if (!chain.isActive) {
      throw new Error(`Follow-up chain ${chain.name} is not active`);
    }

    // Build execution context with deal/offer data
    const executionContext = await this.buildContext(dealId, offerId, context);

    // Calculate first step execution time
    const firstStep = chain.getStep(1);
    if (!firstStep) {
      throw new Error(`Chain ${chain.name} has no steps`);
    }

    const nextExecutionAt = this.calculateNextExecution(firstStep);

    // Create execution record
    const execution = await FollowUpExecution.create({
      chainId: chain.id,
      chainName: chain.name,
      dealId,
      offerId,
      userId,
      currentStep: 1,
      status: 'active',
      nextExecutionAt,
      stepHistory: [],
      context: executionContext,
      startedAt: new Date(),
    });

    console.log(`🔗 Started follow-up chain "${chain.name}" for ${dealId || offerId}`);

    return execution;
  }

  /**
   * Start chains matching a trigger event
   */
  async triggerChains(
    triggerEvent: FollowUpTriggerEvent,
    options: {
      dealId?: string;
      offerId?: string;
      userId: string;
      context?: Record<string, any>;
    }
  ): Promise<FollowUpExecution[]> {
    const chains = await FollowUpChain.findByTrigger(triggerEvent);
    const executions: FollowUpExecution[] = [];

    for (const chain of chains) {
      try {
        // Check if conditions match
        if (chain.triggerConditions) {
          const matches = await this.checkConditions(chain.triggerConditions, options);
          if (!matches) continue;
        }

        // Check if there's already an active execution for this chain/deal/offer
        const existing = await this.findExistingExecution(chain.id, options.dealId, options.offerId);
        if (existing) {
          console.log(`⏭️ Skipping chain "${chain.name}" - already active for this deal/offer`);
          continue;
        }

        const execution = await this.startChain(chain.id, options);
        executions.push(execution);
      } catch (error) {
        console.error(`Failed to start chain ${chain.name}:`, error);
      }
    }

    return executions;
  }

  /**
   * Cancel active chains for a deal/offer
   */
  async cancelChains(
    options: {
      dealId?: string;
      offerId?: string;
      reason: string;
    }
  ): Promise<number> {
    const { dealId, offerId, reason } = options;

    let cancelled = 0;
    if (dealId) {
      cancelled += await FollowUpExecution.cancelByDeal(dealId, reason);
    }
    if (offerId) {
      cancelled += await FollowUpExecution.cancelByOffer(offerId, reason);
    }

    if (cancelled > 0) {
      console.log(`🛑 Cancelled ${cancelled} follow-up execution(s): ${reason}`);
    }

    return cancelled;
  }

  /**
   * Process all due follow-ups
   */
  async processDueFollowUps(): Promise<{ processed: number; errors: number }> {
    const dueExecutions = await FollowUpExecution.findDue();
    let processed = 0;
    let errors = 0;

    for (const execution of dueExecutions) {
      try {
        await this.processExecution(execution);
        processed++;
      } catch (error) {
        console.error(`Error processing follow-up ${execution.id}:`, error);
        errors++;
      }
    }

    if (processed > 0 || errors > 0) {
      console.log(`📬 Follow-up processing: ${processed} processed, ${errors} errors`);
    }

    return { processed, errors };
  }

  /**
   * Process a single execution
   */
  private async processExecution(execution: FollowUpExecution): Promise<void> {
    const chain = await FollowUpChain.findByPk(execution.chainId);
    if (!chain) {
      await execution.markCancelled('Chain no longer exists');
      await execution.save();
      return;
    }

    const step = chain.getStep(execution.currentStep);
    if (!step) {
      await execution.markCompleted();
      await execution.save();
      return;
    }

    // Check stop conditions before executing
    if (step.stopChainIf) {
      const shouldStop = await this.checkStopConditions(execution, step.stopChainIf);
      if (shouldStop) {
        await execution.markCancelled('Stop condition met');
        await execution.save();
        console.log(`🛑 Chain stopped for ${execution.dealId || execution.offerId}: stop condition met`);
        return;
      }
    }

    // Check skip conditions
    let skipped = false;
    let skipReason: string | undefined;
    if (step.conditions?.skipIf) {
      const shouldSkip = await this.checkConditions({ conditions: step.conditions.skipIf }, {
        dealId: execution.dealId,
        offerId: execution.offerId,
        userId: execution.userId,
      });
      if (shouldSkip) {
        skipped = true;
        skipReason = 'Skip condition met';
      }
    }

    // Execute the step
    let success = false;
    let error: string | undefined;
    let result: any;

    if (!skipped) {
      try {
        result = await this.executeStep(step, execution);
        success = true;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        console.error(`Step ${step.stepNumber} failed for ${execution.id}:`, error);
      }
    }

    // Record step execution
    const record: StepExecutionRecord = {
      stepNumber: step.stepNumber,
      executedAt: new Date().toISOString(),
      success: skipped || success,
      error,
      result,
      skipped,
      skipReason,
    };
    execution.recordStepExecution(record);

    // Advance to next step or complete
    const nextStep = chain.getStep(execution.currentStep + 1);
    if (nextStep) {
      const nextExecutionAt = this.calculateNextExecution(nextStep);
      execution.advanceStep(execution.currentStep + 1, nextExecutionAt);
    } else {
      execution.markCompleted();
      console.log(`✅ Follow-up chain completed for ${execution.dealId || execution.offerId}`);
    }

    await execution.save();
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: FollowUpStep, execution: FollowUpExecution): Promise<any> {
    const config = step.actionConfig;
    const context = execution.context as Record<string, any>;

    switch (step.actionType) {
      case 'send_email':
        return this.executeEmailAction(config, context, execution);

      case 'send_sms':
        return this.executeSmsAction(config, context, execution);

      case 'create_task':
        return this.executeCreateTaskAction(config, context, execution);

      case 'update_status':
        return this.executeUpdateStatusAction(config, context, execution);

      case 'add_tag':
        return this.executeAddTagAction(config, context, execution);

      case 'archive':
        return this.executeArchiveAction(config, context, execution);

      case 'notify_user':
        return this.executeNotifyUserAction(config, context, execution);

      case 'webhook':
        return this.executeWebhookAction(config, context, execution);

      default:
        throw new Error(`Unknown action type: ${step.actionType}`);
    }
  }

  /**
   * Execute email action
   */
  private async executeEmailAction(
    config: FollowUpStep['actionConfig'],
    context: Record<string, any>,
    execution: FollowUpExecution
  ): Promise<any> {
    if (!resend) {
      throw new Error('Email service not configured');
    }

    const to = this.resolveRecipient(config.to, context);
    const subject = this.interpolateTemplate(config.subject || 'Follow-up', context);
    const html = this.interpolateTemplate(config.template || '', context);

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@dispotree.com',
      to,
      subject,
      html,
    });

    if (error) throw new Error(error.message);
    return { emailId: data?.id, to, subject };
  }

  /**
   * Execute SMS action
   */
  private async executeSmsAction(
    config: FollowUpStep['actionConfig'],
    context: Record<string, any>,
    execution: FollowUpExecution
  ): Promise<any> {
    if (!twilioClient) {
      throw new Error('SMS service not configured');
    }

    const to = config.phone || context.sellerPhone || context.buyerPhone;
    if (!to) {
      throw new Error('No phone number available');
    }

    const body = this.interpolateTemplate(config.message || '', context);

    const message = await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });

    return { messageSid: message.sid, to };
  }

  /**
   * Execute create task action
   */
  private async executeCreateTaskAction(
    config: FollowUpStep['actionConfig'],
    context: Record<string, any>,
    execution: FollowUpExecution
  ): Promise<any> {
    // Create a follow-up task (could integrate with task management system)
    const task = {
      title: this.interpolateTemplate(config.taskTitle || 'Follow-up task', context),
      description: this.interpolateTemplate(config.taskDescription || '', context),
      priority: config.priority || 'medium',
      assignTo: config.assignTo || execution.userId,
      dealId: execution.dealId,
      offerId: execution.offerId,
      createdAt: new Date().toISOString(),
    };

    // Send notification about the task
    notificationService.sendToUser(task.assignTo, {
      type: 'system',
      title: 'New Follow-up Task',
      message: task.title,
      priority: task.priority === 'high' ? 'high' : 'normal',
      data: task,
    });

    return task;
  }

  /**
   * Execute update status action
   */
  private async executeUpdateStatusAction(
    config: FollowUpStep['actionConfig'],
    context: Record<string, any>,
    execution: FollowUpExecution
  ): Promise<any> {
    if (execution.offerId && config.newStatus) {
      const offer = await DealOffer.findByPk(execution.offerId);
      if (offer) {
        offer.status = config.newStatus as any;
        await offer.save();
        return { updated: 'offer', newStatus: config.newStatus };
      }
    }

    if (execution.dealId && config.newStatus) {
      const property = await Property.findByPk(execution.dealId);
      if (property) {
        // Cast to any for custom status values used in follow-up automation
        (property as any).status = config.newStatus;
        await property.save();
        return { updated: 'deal', newStatus: config.newStatus };
      }
    }

    return { updated: false };
  }

  /**
   * Execute add tag action
   */
  private async executeAddTagAction(
    config: FollowUpStep['actionConfig'],
    context: Record<string, any>,
    execution: FollowUpExecution
  ): Promise<any> {
    if (execution.dealId && config.tag) {
      const property = await Property.findByPk(execution.dealId);
      if (property) {
        const tags = property.tags || [];
        if (!tags.includes(config.tag)) {
          property.tags = [...tags, config.tag];
          await property.save();
        }
        return { tagAdded: config.tag };
      }
    }
    return { tagAdded: false };
  }

  /**
   * Execute archive action
   */
  private async executeArchiveAction(
    config: FollowUpStep['actionConfig'],
    context: Record<string, any>,
    execution: FollowUpExecution
  ): Promise<any> {
    if (execution.offerId) {
      const offer = await DealOffer.findByPk(execution.offerId);
      if (offer && offer.status === 'pending') {
        offer.status = 'expired';
        await offer.save();
        return { archived: 'offer', reason: config.reason };
      }
    }

    if (execution.dealId) {
      const property = await Property.findByPk(execution.dealId);
      if (property) {
        // Cast to any for custom status values used in follow-up automation
        (property as any).status = 'archived';
        await property.save();
        return { archived: 'deal', reason: config.reason };
      }
    }

    return { archived: false };
  }

  /**
   * Execute notify user action
   */
  private async executeNotifyUserAction(
    config: FollowUpStep['actionConfig'],
    context: Record<string, any>,
    execution: FollowUpExecution
  ): Promise<any> {
    notificationService.sendToUser(execution.userId, {
      type: 'system',
      title: this.interpolateTemplate(config.subject || 'Follow-up Reminder', context),
      message: this.interpolateTemplate(config.template || '', context),
      priority: 'normal',
      data: {
        dealId: execution.dealId,
        offerId: execution.offerId,
        chainName: execution.chainName,
      },
    });

    return { notified: execution.userId };
  }

  /**
   * Execute webhook action
   */
  private async executeWebhookAction(
    config: FollowUpStep['actionConfig'],
    context: Record<string, any>,
    execution: FollowUpExecution
  ): Promise<any> {
    if (!config.url) {
      throw new Error('Webhook URL not configured');
    }

    const payload = {
      ...config.payload,
      execution: {
        id: execution.id,
        chainName: execution.chainName,
        dealId: execution.dealId,
        offerId: execution.offerId,
        step: execution.currentStep,
      },
      context,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    return { status: response.status };
  }

  // Helper methods

  private async buildContext(
    dealId?: string,
    offerId?: string,
    additionalContext: Record<string, any> = {}
  ): Promise<Record<string, any>> {
    const context: Record<string, any> = { ...additionalContext };

    if (dealId) {
      const property = await Property.findByPk(dealId);
      if (property) {
        context.deal = property.toJSON();
        context.address = property.address;
        context.price = property.reservePrice || property.purchaseContractPrice || property.mlsListingPrice;
        context.sellerPhone = property.ownerPhones?.[0] || property.agentPhoneNumber;
        context.sellerEmail = property.ownerEmails?.[0] || property.agentEmail;
      }
    }

    if (offerId) {
      const offer = await DealOffer.findByPk(offerId);
      if (offer) {
        context.offer = offer.toJSON();
        context.offerAmount = offer.offerAmount;
      }
    }

    return context;
  }

  private calculateNextExecution(step: FollowUpStep): Date {
    const now = new Date();
    const delayMs = (step.delayDays * 24 * 60 * 60 * 1000) + (step.delayHours * 60 * 60 * 1000);
    return new Date(now.getTime() + delayMs);
  }

  private async checkConditions(
    conditions: any,
    options: { dealId?: string; offerId?: string; userId: string }
  ): Promise<boolean> {
    // Simple condition checking - can be extended
    return true;
  }

  private async checkStopConditions(
    execution: FollowUpExecution,
    stopConditions: { field: string; operator: string; value: any }[]
  ): Promise<boolean> {
    // Refresh context and check if stop conditions are met
    const context = await this.buildContext(execution.dealId, execution.offerId);

    for (const condition of stopConditions) {
      const fieldValue = this.getNestedValue(context, condition.field);
      const matches = this.evaluateCondition(fieldValue, condition.operator, condition.value);
      if (matches) return true;
    }

    return false;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  private evaluateCondition(fieldValue: any, operator: string, conditionValue: any): boolean {
    switch (operator) {
      case '==': return fieldValue === conditionValue;
      case '!=': return fieldValue !== conditionValue;
      case '>': return fieldValue > conditionValue;
      case '<': return fieldValue < conditionValue;
      case 'contains': return String(fieldValue).includes(conditionValue);
      case 'not_contains': return !String(fieldValue).includes(conditionValue);
      default: return false;
    }
  }

  private async findExistingExecution(
    chainId: string,
    dealId?: string,
    offerId?: string
  ): Promise<FollowUpExecution | null> {
    const where: any = {
      chainId,
      status: 'active',
    };

    if (dealId) where.dealId = dealId;
    if (offerId) where.offerId = offerId;

    return FollowUpExecution.findOne({ where });
  }

  private resolveRecipient(recipient: string | undefined, context: Record<string, any>): string {
    if (!recipient) {
      return context.sellerEmail || context.buyerEmail || '';
    }

    switch (recipient) {
      case 'seller': return context.sellerEmail || '';
      case 'buyer': return context.buyerEmail || '';
      case 'agent': return context.agentEmail || '';
      default: return recipient;
    }
  }

  private interpolateTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Get execution statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    paused: number;
    completed: number;
    cancelled: number;
    dueNow: number;
  }> {
    return FollowUpExecution.getStats();
  }

  /**
   * Get active chains
   */
  async getActiveChains(): Promise<FollowUpChain[]> {
    return FollowUpChain.findAll({
      where: { isActive: true },
      order: [['priority', 'ASC']],
    });
  }
}

export const followUpService = new FollowUpService();
export default followUpService;
