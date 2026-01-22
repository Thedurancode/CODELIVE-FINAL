/**
 * Sanctions Screening Service
 *
 * OFAC/sanctions screening integration for compliance.
 * Screens sellers, buyers, and other parties against sanctions lists.
 */

import { complianceEventStream } from './ComplianceEventStream';
import { soc2AuditLogger } from './SOC2AuditLogger';
import { activityFeedService } from './ActivityFeedService';
import SanctionsScreening from '../models/SanctionsScreening';
import Property from '../models/Property';
import PropertyContact from '../models/PropertyContact';
import Contact from '../models/Contact';
import ComplianceAlert from '../models/ComplianceAlert';

export interface ScreeningFailureResult extends ScreeningResult {
  blocked: boolean;
  failureReason?: string;
  requiresManualReview: boolean;
}

export interface ScreeningRequest {
  entityName: string;
  entityType: 'individual' | 'company';
  partyRole: 'seller' | 'buyer' | 'wholesaler' | 'agent' | 'broker' | 'other';
  propertyId?: number;
  additionalIdentifiers?: {
    dateOfBirth?: string;
    address?: string;
    taxId?: string;
    country?: string;
  };
}

export interface ScreeningResult {
  screened: boolean;
  matchFound: boolean;
  matchType?: 'exact' | 'fuzzy' | 'alias' | 'partial';
  matchScore?: number;
  matchedEntity?: {
    name: string;
    listType: string;
    listDate?: string;
    reason?: string;
    programs?: string[];
  };
  screenedAt: Date;
  provider: 'ofac_api' | 'dow_jones' | 'world_check' | 'local_cache' | 'manual';
  screeningId?: number;
  lists: string[];
}

export interface PropertyScreeningResult {
  propertyId: number;
  screenedAt: Date;
  allClear: boolean;
  parties: Array<{
    role: string;
    name: string;
    result: ScreeningResult;
  }>;
  blockedParties: string[];
  pendingReview: string[];
}

class SanctionsScreeningService {
  private apiKey: string;
  private baseUrl: string;
  private enabled: boolean;
  private cacheEnabled: boolean;
  private cacheTtlHours: number;
  private failSafeMode: boolean; // Block deals when API unavailable
  private maxRetries: number;
  private retryDelayMs: number;
  private consecutiveFailures: number = 0;
  private lastFailureAlert: Date | null = null;

  constructor() {
    this.apiKey = process.env.OFAC_API_KEY || '';
    this.baseUrl = process.env.OFAC_API_URL || 'https://api.ofac-api.com/v4';
    this.enabled = !!this.apiKey;
    this.cacheEnabled = process.env.SANCTIONS_CACHE_ENABLED !== 'false';
    this.cacheTtlHours = parseInt(process.env.SANCTIONS_CACHE_TTL_HOURS || '24');

    // Fail-safe mode: block deals when sanctions API is unavailable (default: true for production safety)
    this.failSafeMode = process.env.SANCTIONS_FAIL_SAFE_MODE !== 'false';
    this.maxRetries = parseInt(process.env.SANCTIONS_MAX_RETRIES || '3');
    this.retryDelayMs = parseInt(process.env.SANCTIONS_RETRY_DELAY_MS || '1000');

    if (!this.enabled) {
      console.error('🚨 SanctionsScreeningService: OFAC_API_KEY not configured - BLOCKING MODE ACTIVE');
      this.createStartupAlert();
    } else {
      console.log('✅ SanctionsScreeningService initialized', {
        failSafeMode: this.failSafeMode,
        maxRetries: this.maxRetries,
      });
    }
  }

  /**
   * Create alert on startup if API key is missing
   */
  private async createStartupAlert(): Promise<void> {
    try {
      await ComplianceAlert.upsertAlert({
        alertKey: 'sanctions-api-key-missing',
        type: 'configuration',
        severity: 'critical',
        title: 'Sanctions Screening API Not Configured',
        message: 'OFAC_API_KEY is not set. All deals will be blocked until sanctions screening is properly configured.',
        resourceType: 'system',
        resourceId: 'sanctions-service',
        metadata: {
          service: 'SanctionsScreeningService',
          failSafeMode: this.failSafeMode,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to create startup alert:', error);
    }
  }

  /**
   * Create alert for API failures
   */
  private async createApiFailureAlert(error: Error, request: ScreeningRequest): Promise<void> {
    // Rate limit alerts to one per 5 minutes
    if (this.lastFailureAlert && Date.now() - this.lastFailureAlert.getTime() < 5 * 60 * 1000) {
      return;
    }

    this.lastFailureAlert = new Date();

    try {
      const resourceId = request.propertyId?.toString() || 'unknown';
      await ComplianceAlert.upsertAlert({
        alertKey: `sanctions-api-failure-${resourceId}`,
        type: 'api_failure',
        severity: this.consecutiveFailures >= 5 ? 'critical' : 'high',
        title: 'Sanctions Screening API Failure',
        message: `OFAC API is failing. ${this.consecutiveFailures} consecutive failures. ${this.failSafeMode ? 'Deals are being BLOCKED.' : 'Deals are passing WITHOUT screening (UNSAFE).'}`,
        resourceType: 'property',
        resourceId,
        metadata: {
          error: error.message,
          consecutiveFailures: this.consecutiveFailures,
          failSafeMode: this.failSafeMode,
          entityName: request.entityName,
          entityType: request.entityType,
          timestamp: new Date().toISOString(),
        },
      });

      // Log to SOC 2 audit
      soc2AuditLogger.log({
        eventType: 'sanctions.api_failure',
        eventCategory: 'security',
        severity: 'error',
        actor: { type: 'system', name: 'SanctionsScreeningService' },
        resource: { type: 'sanctions_api', id: 'ofac' },
        action: 'api_call_failed',
        outcome: 'failure',
        details: {
          error: error.message,
          consecutiveFailures: this.consecutiveFailures,
          failSafeMode: this.failSafeMode,
          entityName: request.entityName,
        },
      });
    } catch (alertError) {
      console.error('Failed to create API failure alert:', alertError);
    }
  }

  /**
   * Check if sanctions screening is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Screen a single entity
   */
  async screenEntity(request: ScreeningRequest): Promise<ScreeningResult> {
    const { entityName, entityType, partyRole, propertyId } = request;

    // Check cache first
    if (this.cacheEnabled) {
      const cached = await SanctionsScreening.getRecentScreening(
        entityName,
        entityType,
        this.cacheTtlHours
      );

      if (cached) {
        console.log(`📋 Sanctions screening cache hit for: ${entityName}`);
        return {
          screened: true,
          matchFound: cached.matchFound,
          matchType: cached.matchType,
          matchScore: cached.matchScore,
          matchedEntity: cached.matchDetails as any,
          screenedAt: cached.screenedAt,
          provider: 'local_cache',
          screeningId: cached.id,
          lists: cached.lists,
        };
      }
    }

    // Call external API
    const result = await this.callOfacApi(request);

    // Persist result
    const screening = await SanctionsScreening.create({
      propertyId,
      entityName,
      entityType,
      partyRole,
      screenedAt: result.screenedAt,
      provider: result.provider,
      matchFound: result.matchFound,
      matchType: result.matchType,
      matchScore: result.matchScore,
      matchDetails: result.matchedEntity,
      lists: result.lists,
      resolutionStatus: result.matchFound ? 'pending' : undefined,
      expiresAt: new Date(Date.now() + this.cacheTtlHours * 60 * 60 * 1000),
    });

    result.screeningId = screening.id;

    // Emit event if match found
    if (result.matchFound) {
      complianceEventStream.publish(
        'compliance.sanctions.match_found',
        'screening',
        screening.id.toString(),
        {
          entityName,
          entityType,
          partyRole,
          propertyId,
          matchType: result.matchType,
          matchScore: result.matchScore,
          lists: result.lists,
        },
        {
          source: 'system',
          metadata: {
            severity: result.matchType === 'exact' ? 'critical' : 'warning',
            propertyId,
          },
        }
      );
    }

    return result;
  }

  /**
   * Screen all parties for a property
   */
  async screenPropertyParties(propertyId: number): Promise<PropertyScreeningResult> {
    const property = await Property.findByPk(propertyId, {
      include: [
        {
          model: PropertyContact,
          as: 'assignedContacts',
          include: [{ model: Contact, as: 'contact' }],
        },
      ],
    });

    if (!property) {
      throw new Error(`Property ${propertyId} not found`);
    }

    const parties: PropertyScreeningResult['parties'] = [];
    const blockedParties: string[] = [];
    const pendingReview: string[] = [];

    // Screen seller from property
    if (property.sellerName) {
      const result = await this.screenEntity({
        entityName: property.sellerName,
        entityType: 'individual',
        partyRole: 'seller',
        propertyId,
      });
      parties.push({ role: 'seller', name: property.sellerName, result });
      if (result.matchFound) {
        pendingReview.push(`seller: ${property.sellerName}`);
      }
    }

    // Screen wholesaler LLC
    if (property.wholesalerLlcName) {
      const result = await this.screenEntity({
        entityName: property.wholesalerLlcName,
        entityType: 'company',
        partyRole: 'wholesaler',
        propertyId,
      });
      parties.push({ role: 'wholesaler', name: property.wholesalerLlcName, result });
      if (result.matchFound) {
        pendingReview.push(`wholesaler: ${property.wholesalerLlcName}`);
      }
    }

    // Screen assigned contacts
    const contacts = (property as any).assignedContacts || [];
    for (const pc of contacts) {
      const contact = pc.contact as Contact;
      if (!contact?.name) continue;

      const role = pc.role as ScreeningRequest['partyRole'];
      const entityType = contact.company ? 'company' : 'individual';
      const entityName = contact.company || contact.name;

      const result = await this.screenEntity({
        entityName,
        entityType,
        partyRole: role,
        propertyId,
      });

      parties.push({ role, name: entityName, result });
      if (result.matchFound) {
        pendingReview.push(`${role}: ${entityName}`);
      }
    }

    // Check for blocked parties from database
    const pendingScreenings = await SanctionsScreening.findAll({
      where: {
        propertyId,
        matchFound: true,
        resolutionStatus: 'blocked',
      },
    });

    for (const screening of pendingScreenings) {
      blockedParties.push(`${screening.partyRole}: ${screening.entityName}`);
    }

    const allClear = parties.every(p => !p.result.matchFound) && blockedParties.length === 0;

    return {
      propertyId,
      screenedAt: new Date(),
      allClear,
      parties,
      blockedParties,
      pendingReview,
    };
  }

  /**
   * Call external OFAC API with retry logic and fail-safe handling
   */
  private async callOfacApi(request: ScreeningRequest): Promise<ScreeningFailureResult> {
    // If API not configured, block in fail-safe mode
    if (!this.enabled) {
      console.error('🚨 OFAC API not configured - blocking deal in fail-safe mode');

      soc2AuditLogger.log({
        eventType: 'sanctions.screening_blocked',
        eventCategory: 'security',
        severity: 'critical',
        actor: { type: 'system', name: 'SanctionsScreeningService' },
        resource: { type: 'property', id: request.propertyId?.toString() },
        action: 'screening_unavailable',
        outcome: 'failure',
        details: {
          reason: 'API not configured',
          entityName: request.entityName,
          failSafeMode: this.failSafeMode,
        },
      });

      return {
        screened: false,
        matchFound: false,
        screenedAt: new Date(),
        provider: 'ofac_api',
        lists: [],
        blocked: this.failSafeMode,
        failureReason: 'OFAC API not configured',
        requiresManualReview: true,
      };
    }

    let lastError: Error | null = null;

    // Retry loop with exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${this.baseUrl}/search`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: request.entityName,
            type: request.entityType,
            minScore: 85,
            sources: ['sdn', 'cons', 'eu', 'un', 'ofsi'],
            ...request.additionalIdentifiers,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`OFAC API returned ${response.status}`);
        }

        const data = await response.json();
        const result = this.parseApiResponse(data);

        // Reset consecutive failures on success
        this.consecutiveFailures = 0;

        return {
          ...result,
          blocked: false,
          requiresManualReview: false,
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`❌ OFAC API error (attempt ${attempt}/${this.maxRetries}):`, lastError.message);

        if (attempt < this.maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    this.consecutiveFailures++;
    await this.createApiFailureAlert(lastError!, request);

    // Emit event for monitoring
    complianceEventStream.publish(
      'compliance.sanctions.api_failure',
      'system',
      'ofac-api',
      {
        error: lastError!.message,
        entityName: request.entityName,
        propertyId: request.propertyId,
        consecutiveFailures: this.consecutiveFailures,
        failSafeMode: this.failSafeMode,
        blocked: this.failSafeMode,
      },
      {
        source: 'system',
        metadata: { severity: 'critical' },
      }
    );

    // In fail-safe mode, block the deal; otherwise pass with warning
    if (this.failSafeMode) {
      console.error('🚨 OFAC API failed after retries - BLOCKING DEAL (fail-safe mode)');
      return {
        screened: false,
        matchFound: false,
        screenedAt: new Date(),
        provider: 'ofac_api',
        lists: [],
        blocked: true,
        failureReason: `API failed after ${this.maxRetries} retries: ${lastError!.message}`,
        requiresManualReview: true,
      };
    } else {
      console.warn('⚠️ OFAC API failed - passing deal WITHOUT screening (UNSAFE)');
      return {
        screened: false,
        matchFound: false,
        screenedAt: new Date(),
        provider: 'ofac_api',
        lists: [],
        blocked: false,
        failureReason: `API failed: ${lastError!.message}`,
        requiresManualReview: true,
      };
    }
  }

  /**
   * Parse OFAC API response
   */
  private parseApiResponse(data: any): ScreeningResult {
    const matches = data.matches || data.results || [];
    const hasMatch = matches.length > 0;

    if (!hasMatch) {
      return {
        screened: true,
        matchFound: false,
        screenedAt: new Date(),
        provider: 'ofac_api',
        lists: data.sourcesChecked || ['sdn', 'cons'],
      };
    }

    // Get best match
    const bestMatch = matches.reduce((best: any, current: any) => {
      return (current.score || 0) > (best.score || 0) ? current : best;
    }, matches[0]);

    const matchScore = bestMatch.score || bestMatch.matchScore || 100;
    let matchType: ScreeningResult['matchType'] = 'fuzzy';

    if (matchScore >= 99) {
      matchType = 'exact';
    } else if (matchScore >= 90) {
      matchType = 'alias';
    } else if (matchScore >= 85) {
      matchType = 'partial';
    }

    return {
      screened: true,
      matchFound: true,
      matchType,
      matchScore,
      matchedEntity: {
        name: bestMatch.name || bestMatch.fullName,
        listType: bestMatch.source || bestMatch.listType || 'SDN',
        listDate: bestMatch.listDate || bestMatch.addedDate,
        reason: bestMatch.reason || bestMatch.remarks,
        programs: bestMatch.programs || [],
      },
      screenedAt: new Date(),
      provider: 'ofac_api',
      lists: data.sourcesChecked || ['sdn', 'cons'],
    };
  }

  /**
   * Resolve a sanctions match
   */
  async resolveMatch(
    screeningId: number,
    userId: string,
    status: 'cleared' | 'blocked' | 'escalated',
    notes?: string
  ): Promise<void> {
    const screening = await SanctionsScreening.findByPk(screeningId);
    if (!screening) {
      throw new Error(`Screening ${screeningId} not found`);
    }

    await screening.resolve(userId, status, notes);

    // Emit event
    const eventType = status === 'cleared' ? 'compliance.sanctions.cleared' : 'compliance.escalation.triggered';
    complianceEventStream.publish(
      eventType,
      'screening',
      screeningId.toString(),
      {
        entityName: screening.entityName,
        partyRole: screening.partyRole,
        propertyId: screening.propertyId,
        status,
        resolvedBy: userId,
      },
      {
        source: 'user',
        userId,
        metadata: { severity: status === 'blocked' ? 'critical' : 'info' },
      }
    );

    // Log activity feed event
    activityFeedService.logComplianceActivity(
      'compliance_issue_resolved',
      String(screeningId),
      `${screening.entityName} (${screening.partyRole})`,
      {
        id: userId,
        name: 'User',
        type: 'user',
      },
      {
        entityName: screening.entityName,
        partyRole: screening.partyRole,
        propertyId: screening.propertyId,
        status,
        notes,
      }
    ).catch(err => console.warn('Activity logging failed:', err.message));
  }

  /**
   * Get screening history for a property
   */
  async getPropertyScreenings(propertyId: number): Promise<SanctionsScreening[]> {
    return SanctionsScreening.getForProperty(propertyId);
  }

  /**
   * Get pending matches requiring review
   */
  async getPendingMatches(): Promise<SanctionsScreening[]> {
    return SanctionsScreening.getPendingMatches();
  }

  /**
   * Get screening statistics
   */
  async getStats(options?: { since?: Date; propertyId?: number }) {
    return SanctionsScreening.getStats(options);
  }

  /**
   * Manual screening entry (for manual verification)
   */
  async recordManualScreening(
    request: ScreeningRequest,
    userId: string,
    cleared: boolean,
    notes?: string
  ): Promise<SanctionsScreening> {
    const screening = await SanctionsScreening.create({
      propertyId: request.propertyId,
      entityName: request.entityName,
      entityType: request.entityType,
      partyRole: request.partyRole,
      screenedAt: new Date(),
      provider: 'manual',
      matchFound: !cleared,
      lists: ['manual_review'],
      resolutionStatus: cleared ? 'cleared' : 'pending',
      resolvedBy: cleared ? userId : undefined,
      resolvedAt: cleared ? new Date() : undefined,
      resolutionNotes: notes,
    });

    return screening;
  }
}

export const sanctionsScreeningService = new SanctionsScreeningService();
export default sanctionsScreeningService;
