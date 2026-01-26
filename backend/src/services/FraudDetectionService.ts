/**
 * Fraud Detection Service
 *
 * Provides comprehensive fraud detection for real estate wholesale deals:
 * - Velocity checks (same entity submitting too many deals)
 * - Pattern detection (known fraudulent patterns)
 * - Identity verification (seller/owner mismatches)
 * - Behavioral analysis (suspicious submission patterns)
 * - Network analysis (connected fraudulent entities)
 */

import * as crypto from 'crypto';
import FraudSignal from '../models/FraudSignal';
import Property from '../models/Property';
import { soc2AuditLogger } from './SOC2AuditLogger';
import { complianceEventStream } from './ComplianceEventStream';
import ComplianceAlert from '../models/ComplianceAlert';
import { Op, Sequelize } from 'sequelize';

export interface FraudCheckRequest {
  propertyId?: number;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  wholesalerName?: string;
  wholesalerPhone?: string;
  wholesalerEmail?: string;
  submissionIp?: string;
  askingPrice?: number;
  estimatedValue?: number;
}

export interface FraudCheckResult {
  passed: boolean;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
  signals: FraudSignalSummary[];
  velocityFlags: VelocityFlag[];
  patternFlags: PatternFlag[];
  recommendations: string[];
  requiresManualReview: boolean;
  checkedAt: Date;
}

export interface FraudSignalSummary {
  type: string;
  severity: string;
  entityType: string;
  entityValue: string;
  occurrences: number;
  riskScore: number;
  message: string;
}

export interface VelocityFlag {
  entityType: string;
  entityValue: string;
  count: number;
  windowHours: number;
  threshold: number;
  exceeded: boolean;
}

export interface PatternFlag {
  pattern: string;
  detected: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence?: Record<string, any>;
}

// Velocity thresholds per entity type
const VELOCITY_THRESHOLDS: Record<string, { windowHours: number; maxCount: number }> = {
  seller: { windowHours: 24, maxCount: 3 },      // Max 3 deals per seller per 24h
  phone: { windowHours: 24, maxCount: 5 },       // Max 5 deals per phone per 24h
  email: { windowHours: 24, maxCount: 5 },       // Max 5 deals per email per 24h
  address: { windowHours: 168, maxCount: 2 },    // Max 2 deals per property per week
  ip: { windowHours: 1, maxCount: 10 },          // Max 10 deals per IP per hour
  wholesaler: { windowHours: 24, maxCount: 20 }, // Max 20 deals per wholesaler per 24h
};

// Known fraudulent patterns
const FRAUD_PATTERNS = [
  {
    id: 'daisy_chain',
    name: 'Daisy Chain Detection',
    description: 'Seller appears to be a known wholesaler (potential daisy chain)',
    check: (data: FraudCheckRequest, context: any) => {
      return context.sellerIsWholesaler === true;
    },
    severity: 'high' as const,
  },
  {
    id: 'price_manipulation',
    name: 'Price Manipulation',
    description: 'Asking price significantly above estimated value (potential fraud)',
    check: (data: FraudCheckRequest) => {
      if (!data.askingPrice || !data.estimatedValue) return false;
      const markup = (data.askingPrice - data.estimatedValue) / data.estimatedValue;
      return markup > 0.5; // 50% above estimated value
    },
    severity: 'medium' as const,
  },
  {
    id: 'rapid_resubmission',
    name: 'Rapid Resubmission',
    description: 'Same property submitted multiple times in short period',
    check: (data: FraudCheckRequest, context: any) => {
      return context.propertySubmissionCount >= 3;
    },
    severity: 'high' as const,
  },
  {
    id: 'entity_mismatch',
    name: 'Entity Mismatch',
    description: 'Seller contact info matches different entity in database',
    check: (data: FraudCheckRequest, context: any) => {
      return context.contactMismatchDetected === true;
    },
    severity: 'critical' as const,
  },
  {
    id: 'known_fraud_network',
    name: 'Known Fraud Network',
    description: 'Entity connected to previously confirmed fraud',
    check: (data: FraudCheckRequest, context: any) => {
      return context.connectedToConfirmedFraud === true;
    },
    severity: 'critical' as const,
  },
];

class FraudDetectionService {
  private initialized = false;
  private enabled: boolean;
  private blockOnHighRisk: boolean;
  private blockThreshold: number;
  private velocityMultiplier: number;

  constructor() {
    this.enabled = process.env.FRAUD_DETECTION_ENABLED !== 'false';
    this.blockOnHighRisk = process.env.FRAUD_BLOCK_HIGH_RISK !== 'false';
    this.blockThreshold = parseInt(process.env.FRAUD_BLOCK_THRESHOLD || '80');
    this.velocityMultiplier = parseFloat(process.env.FRAUD_VELOCITY_MULTIPLIER || '1.0');

    if (!this.enabled) {
      console.warn('[FraudDetection] Service disabled via FRAUD_DETECTION_ENABLED=false');
    } else {
      console.log('[FraudDetection] Service initialized', {
        blockOnHighRisk: this.blockOnHighRisk,
        blockThreshold: this.blockThreshold,
        velocityMultiplier: this.velocityMultiplier,
      });
    }

    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && this.enabled;
  }

  /**
   * Run comprehensive fraud check on a deal submission
   */
  async checkDeal(request: FraudCheckRequest): Promise<FraudCheckResult> {
    if (!this.enabled) {
      return this.createPassingResult();
    }

    const signals: FraudSignalSummary[] = [];
    const velocityFlags: VelocityFlag[] = [];
    const patternFlags: PatternFlag[] = [];
    const recommendations: string[] = [];
    let riskScore = 0;

    // Build context for pattern detection
    const context = await this.buildCheckContext(request);

    // 1. Velocity Checks
    const velocityResults = await this.runVelocityChecks(request);
    velocityFlags.push(...velocityResults.flags);
    riskScore += velocityResults.riskContribution;
    signals.push(...velocityResults.signals);

    // 2. Pattern Detection
    const patternResults = this.runPatternDetection(request, context);
    patternFlags.push(...patternResults.flags);
    riskScore += patternResults.riskContribution;

    // 3. Historical Signal Check
    const historicalResults = await this.checkHistoricalSignals(request);
    signals.push(...historicalResults.signals);
    riskScore += historicalResults.riskContribution;

    // 4. Network Analysis (check for connected fraud entities)
    const networkResults = await this.runNetworkAnalysis(request);
    riskScore += networkResults.riskContribution;
    if (networkResults.connectedToFraud) {
      signals.push({
        type: 'network',
        severity: 'critical',
        entityType: 'network',
        entityValue: 'Connected entities',
        occurrences: networkResults.connectedCount,
        riskScore: 95,
        message: `Connected to ${networkResults.connectedCount} known fraud entity(ies)`,
      });
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    // Determine risk level
    const riskLevel = this.determineRiskLevel(riskScore);

    // Generate recommendations
    if (riskLevel === 'critical') {
      recommendations.push('BLOCK: This deal has critical fraud indicators and should not proceed.');
    } else if (riskLevel === 'high') {
      recommendations.push('REVIEW: Manual review required before proceeding.');
      recommendations.push('Verify seller identity with government-issued ID.');
      recommendations.push('Confirm property ownership through title search.');
    } else if (riskLevel === 'medium') {
      recommendations.push('CAUTION: Additional verification recommended.');
      recommendations.push('Consider requesting proof of ownership.');
    }

    // Determine if deal should be blocked
    const blocked = this.blockOnHighRisk && riskScore >= this.blockThreshold;
    const requiresManualReview = riskLevel === 'high' || riskLevel === 'critical';

    // Log the check result
    await this.logFraudCheck(request, {
      riskScore,
      riskLevel,
      blocked,
      signalCount: signals.length,
      velocityFlagCount: velocityFlags.filter(v => v.exceeded).length,
      patternFlagCount: patternFlags.filter(p => p.detected).length,
    });

    // Create alert for high-risk deals
    if (riskLevel === 'high' || riskLevel === 'critical') {
      await this.createFraudAlert(request, riskScore, riskLevel, signals);
    }

    return {
      passed: !blocked && riskLevel !== 'critical',
      riskScore,
      riskLevel,
      blocked,
      signals,
      velocityFlags,
      patternFlags,
      recommendations,
      requiresManualReview,
      checkedAt: new Date(),
    };
  }

  /**
   * Build context for pattern detection
   */
  private async buildCheckContext(request: FraudCheckRequest): Promise<Record<string, any>> {
    const context: Record<string, any> = {};

    // Check if seller is a known wholesaler
    if (request.sellerName) {
      const wholesalerMatch = await Property.findOne({
        where: {
          wholesalerLlcName: {
            [Op.iLike]: `%${request.sellerName}%`,
          },
        },
      });
      context.sellerIsWholesaler = !!wholesalerMatch;
    }

    // Check property submission count
    const addressHash = crypto.createHash('sha256')
      .update(`${request.propertyAddress}${request.zip}`.toLowerCase())
      .digest('hex');

    const propertySignals = await FraudSignal.findAll({
      where: {
        entityType: 'address',
        entityValueHash: addressHash,
        status: { [Op.in]: ['active', 'under_review'] },
      },
    });
    context.propertySubmissionCount = propertySignals.reduce((sum, s) => sum + s.occurrenceCount, 0);

    // Check for contact mismatches
    if (request.sellerPhone || request.sellerEmail) {
      const contactMismatch = await this.checkContactMismatch(
        request.sellerName || '',
        request.sellerPhone || '',
        request.sellerEmail || ''
      );
      context.contactMismatchDetected = contactMismatch;
    }

    // Check for connections to confirmed fraud
    context.connectedToConfirmedFraud = await this.checkFraudNetworkConnection(request);

    return context;
  }

  /**
   * Run velocity checks on all entities
   */
  private async runVelocityChecks(request: FraudCheckRequest): Promise<{
    flags: VelocityFlag[];
    riskContribution: number;
    signals: FraudSignalSummary[];
  }> {
    const flags: VelocityFlag[] = [];
    const signals: FraudSignalSummary[] = [];
    let riskContribution = 0;

    const entitiesToCheck: Array<{ type: string; value: string | undefined }> = [
      { type: 'seller', value: request.sellerName },
      { type: 'phone', value: request.sellerPhone },
      { type: 'phone', value: request.wholesalerPhone },
      { type: 'email', value: request.sellerEmail },
      { type: 'email', value: request.wholesalerEmail },
      { type: 'address', value: `${request.propertyAddress} ${request.zip}` },
      { type: 'ip', value: request.submissionIp },
      { type: 'wholesaler', value: request.wholesalerName },
    ];

    for (const entity of entitiesToCheck) {
      if (!entity.value) continue;

      const threshold = VELOCITY_THRESHOLDS[entity.type] || { windowHours: 24, maxCount: 5 };
      const adjustedMax = Math.floor(threshold.maxCount * this.velocityMultiplier);

      const { count, signals: entitySignals } = await FraudSignal.checkVelocity(
        entity.type as any,
        entity.value,
        threshold.windowHours
      );

      const exceeded = count >= adjustedMax;

      flags.push({
        entityType: entity.type,
        entityValue: this.maskPII(entity.value, entity.type),
        count,
        windowHours: threshold.windowHours,
        threshold: adjustedMax,
        exceeded,
      });

      if (exceeded) {
        // Record signal
        await FraudSignal.recordSignal(
          'velocity',
          entity.type as any,
          entity.value,
          count >= adjustedMax * 2 ? 'critical' : 'high',
          {
            count,
            threshold: adjustedMax,
            windowHours: threshold.windowHours,
            propertyAddress: request.propertyAddress,
          },
          request.propertyId
        );

        signals.push({
          type: 'velocity',
          severity: count >= adjustedMax * 2 ? 'critical' : 'high',
          entityType: entity.type,
          entityValue: this.maskPII(entity.value, entity.type),
          occurrences: count,
          riskScore: Math.min(count * 10, 50),
          message: `${entity.type} "${this.maskPII(entity.value, entity.type)}" has ${count} submissions in ${threshold.windowHours}h (threshold: ${adjustedMax})`,
        });

        riskContribution += Math.min(count * 5, 30);
      }
    }

    return { flags, riskContribution, signals };
  }

  /**
   * Run pattern detection
   */
  private runPatternDetection(request: FraudCheckRequest, context: Record<string, any>): {
    flags: PatternFlag[];
    riskContribution: number;
  } {
    const flags: PatternFlag[] = [];
    let riskContribution = 0;

    for (const pattern of FRAUD_PATTERNS) {
      const detected = pattern.check(request, context);

      flags.push({
        pattern: pattern.id,
        detected,
        severity: pattern.severity,
        description: pattern.description,
        evidence: detected ? { context } : undefined,
      });

      if (detected) {
        const severityScore = {
          low: 5,
          medium: 15,
          high: 25,
          critical: 40,
        };
        riskContribution += severityScore[pattern.severity];
      }
    }

    return { flags, riskContribution };
  }

  /**
   * Check historical fraud signals
   */
  private async checkHistoricalSignals(request: FraudCheckRequest): Promise<{
    signals: FraudSignalSummary[];
    riskContribution: number;
  }> {
    const signals: FraudSignalSummary[] = [];
    let riskContribution = 0;

    const entitiesToCheck = [
      { type: 'seller', value: request.sellerName },
      { type: 'phone', value: request.sellerPhone },
      { type: 'email', value: request.sellerEmail },
      { type: 'wholesaler', value: request.wholesalerName },
    ];

    for (const entity of entitiesToCheck) {
      if (!entity.value) continue;

      const existingSignals = await FraudSignal.getActiveSignals(entity.type, entity.value);

      for (const signal of existingSignals) {
        if (signal.status === 'confirmed_fraud') {
          signals.push({
            type: signal.signalType,
            severity: 'critical',
            entityType: signal.entityType,
            entityValue: this.maskPII(signal.entityValue, signal.entityType),
            occurrences: signal.occurrenceCount,
            riskScore: 100,
            message: `CONFIRMED FRAUD: ${entity.type} has been flagged as confirmed fraud`,
          });
          riskContribution += 50;
        } else if (signal.riskScore >= 70) {
          signals.push({
            type: signal.signalType,
            severity: signal.severity,
            entityType: signal.entityType,
            entityValue: this.maskPII(signal.entityValue, signal.entityType),
            occurrences: signal.occurrenceCount,
            riskScore: signal.riskScore,
            message: `Historical fraud signal: ${signal.signalType} (${signal.occurrenceCount} occurrences)`,
          });
          riskContribution += Math.floor(signal.riskScore / 5);
        }
      }
    }

    return { signals, riskContribution };
  }

  /**
   * Run network analysis to find connected fraud entities
   */
  private async runNetworkAnalysis(request: FraudCheckRequest): Promise<{
    connectedToFraud: boolean;
    connectedCount: number;
    riskContribution: number;
  }> {
    // Check if any entity is connected to confirmed fraud through shared signals
    const confirmedFraud = await FraudSignal.findAll({
      where: {
        status: 'confirmed_fraud',
      },
      limit: 100,
    });

    let connectedCount = 0;

    for (const fraudSignal of confirmedFraud) {
      // Check if current request shares any identifiers
      const identifiers = [
        request.sellerPhone,
        request.sellerEmail,
        request.wholesalerPhone,
        request.wholesalerEmail,
      ].filter(Boolean);

      for (const id of identifiers) {
        const hash = crypto.createHash('sha256').update(id!.toLowerCase().trim()).digest('hex');
        if (fraudSignal.entityValueHash === hash) {
          connectedCount++;
        }
      }

      // Check related signals
      if (fraudSignal.relatedSignals?.length) {
        // Could expand network analysis here
      }
    }

    return {
      connectedToFraud: connectedCount > 0,
      connectedCount,
      riskContribution: connectedCount > 0 ? 40 : 0,
    };
  }

  /**
   * Check if contact info is mismatched with known entities
   */
  private async checkContactMismatch(
    name: string,
    phone: string,
    email: string
  ): Promise<boolean> {
    if (!phone && !email) return false;

    // Check if this phone/email is associated with a different name
    const signals = await FraudSignal.findAll({
      where: {
        entityType: { [Op.in]: ['phone', 'email'] },
        entityValue: { [Op.in]: [phone, email].filter(Boolean) },
      },
    });

    for (const signal of signals) {
      const details = signal.details as any;
      if (details.associatedName && details.associatedName.toLowerCase() !== name.toLowerCase()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check connection to fraud network
   */
  private async checkFraudNetworkConnection(request: FraudCheckRequest): Promise<boolean> {
    const result = await this.runNetworkAnalysis(request);
    return result.connectedToFraud;
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Mask PII for logging/display
   */
  private maskPII(value: string, type: string): string {
    if (!value) return '';

    switch (type) {
      case 'phone':
        return value.length > 4 ? `***-***-${value.slice(-4)}` : '***';
      case 'email':
        const [local, domain] = value.split('@');
        return local ? `${local[0]}***@${domain || '***'}` : '***';
      case 'seller':
      case 'wholesaler':
        const parts = value.split(' ');
        return parts.map((p, i) => i === 0 ? p : `${p[0]}***`).join(' ');
      default:
        return value.length > 10 ? `${value.slice(0, 5)}...${value.slice(-3)}` : value;
    }
  }

  /**
   * Log fraud check to audit trail
   */
  private async logFraudCheck(request: FraudCheckRequest, result: Record<string, any>): Promise<void> {
    soc2AuditLogger.log({
      eventType: 'fraud.check_completed',
      eventCategory: 'verification',
      severity: result.riskLevel === 'critical' ? 'critical' : result.riskLevel === 'high' ? 'warning' : 'info',
      actor: { type: 'system', name: 'FraudDetectionService' },
      resource: {
        type: 'property',
        id: request.propertyId?.toString(),
        name: request.propertyAddress,
      },
      action: 'fraud_check',
      outcome: result.blocked ? 'failure' : 'success',
      details: {
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        blocked: result.blocked,
        signalCount: result.signalCount,
        velocityFlagCount: result.velocityFlagCount,
        patternFlagCount: result.patternFlagCount,
      },
    });
  }

  /**
   * Create alert for high-risk deals
   */
  private async createFraudAlert(
    request: FraudCheckRequest,
    riskScore: number,
    riskLevel: string,
    signals: FraudSignalSummary[]
  ): Promise<void> {
    try {
      const resourceId = request.propertyId?.toString() || request.propertyAddress;
      await ComplianceAlert.upsertAlert({
        alertKey: `fraud-detection-${resourceId}`,
        type: 'fraud_detection',
        severity: riskLevel === 'critical' ? 'critical' : 'high',
        title: `High-Risk Deal Detected (Score: ${riskScore})`,
        message: `Deal for ${request.propertyAddress} has ${signals.length} fraud signals. Risk level: ${riskLevel.toUpperCase()}.`,
        resourceType: 'property',
        resourceId,
        metadata: {
          riskScore,
          riskLevel,
          signalCount: signals.length,
          signals: signals.map(s => ({
            type: s.type,
            severity: s.severity,
            message: s.message,
          })),
          propertyAddress: request.propertyAddress,
          timestamp: new Date().toISOString(),
        },
      });

      // Emit event
      complianceEventStream.publish(
        'compliance.fraud.high_risk_detected',
        'property',
        request.propertyId?.toString() || 'unknown',
        {
          riskScore,
          riskLevel,
          signalCount: signals.length,
          propertyAddress: request.propertyAddress,
        },
        {
          source: 'system',
          metadata: { severity: riskLevel },
        }
      );
    } catch (error) {
      console.error('[FraudDetection] Failed to create alert:', error);
    }
  }

  /**
   * Create a passing result when service is disabled
   */
  private createPassingResult(): FraudCheckResult {
    return {
      passed: true,
      riskScore: 0,
      riskLevel: 'low',
      blocked: false,
      signals: [],
      velocityFlags: [],
      patternFlags: [],
      recommendations: ['Fraud detection is disabled. Enable via FRAUD_DETECTION_ENABLED=true.'],
      requiresManualReview: false,
      checkedAt: new Date(),
    };
  }

  /**
   * Mark an entity as confirmed fraud
   */
  async confirmFraud(
    entityType: FraudSignal['entityType'],
    entityValue: string,
    userId: string,
    notes?: string
  ): Promise<void> {
    const signals = await FraudSignal.getActiveSignals(entityType, entityValue);

    for (const signal of signals) {
      signal.status = 'confirmed_fraud';
      signal.resolvedBy = userId;
      signal.resolvedAt = new Date();
      signal.resolutionNotes = notes;
      signal.riskScore = 100;
      await signal.save();
    }

    // Create a permanent record if no signal exists
    if (signals.length === 0) {
      await FraudSignal.recordSignal(
        'pattern',
        entityType,
        entityValue,
        'critical',
        {
          confirmedBy: userId,
          confirmedAt: new Date().toISOString(),
          notes,
        }
      );

      const newSignal = await FraudSignal.getActiveSignals(entityType, entityValue);
      if (newSignal[0]) {
        newSignal[0].status = 'confirmed_fraud';
        newSignal[0].resolvedBy = userId;
        newSignal[0].resolvedAt = new Date();
        newSignal[0].riskScore = 100;
        await newSignal[0].save();
      }
    }

    soc2AuditLogger.log({
      eventType: 'fraud.confirmed',
      eventCategory: 'decision',
      severity: 'critical',
      actor: { type: 'user', id: userId },
      resource: { type: entityType, name: entityValue },
      action: 'confirm_fraud',
      outcome: 'success',
      details: { notes, signalCount: signals.length },
    });
  }

  /**
   * Clear a fraud signal (false positive)
   */
  async clearSignal(signalId: number, userId: string, notes?: string): Promise<void> {
    const signal = await FraudSignal.findByPk(signalId);
    if (!signal) {
      throw new Error(`Signal ${signalId} not found`);
    }

    signal.status = 'cleared';
    signal.resolvedBy = userId;
    signal.resolvedAt = new Date();
    signal.resolutionNotes = notes;
    await signal.save();

    soc2AuditLogger.log({
      eventType: 'fraud.cleared',
      eventCategory: 'decision',
      severity: 'info',
      actor: { type: 'user', id: userId },
      resource: { type: 'fraud_signal', id: signalId.toString() },
      action: 'clear_signal',
      outcome: 'success',
      details: { notes, entityType: signal.entityType },
    });
  }

  /**
   * Get fraud statistics
   */
  async getStats(options?: { since?: Date }): Promise<ReturnType<typeof FraudSignal.getStats>> {
    return FraudSignal.getStats(options);
  }
}

export const fraudDetectionService = new FraudDetectionService();
export default fraudDetectionService;
