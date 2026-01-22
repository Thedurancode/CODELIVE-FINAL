import { Request, Response } from 'express';
import {
  ComplianceAnalysisRequest,
  ComplianceAnalysisResponse,
  ComplianceStatus,
  ComplianceIssue,
  ExtractedContractData,
  AIAgentResponse
} from '../types/ai-agents';

/**
 * AI-Powered Contract Compliance Agent
 *
 * This controller implements the Contract Compliance Agent which:
 * - Analyzes contracts for assignability and marketing clauses
 * - Verifies seller identity against public records
 * - Validates buyer entity and authorized signers
 * - Detects daisy chain transactions
 * - Applies state-specific compliance rules
 */

// =====================================================
// Helper Functions
// =====================================================

/**
 * Analyze contract text for key clauses using pattern matching
 * In production, this would use OpenAI GPT-4 Vision or Anthropic Claude
 */
function analyzeContractText(contractText: string): ExtractedContractData {
  const extracted: ExtractedContractData = {};

  // Assignment clause detection
  const assignmentPatterns = [
    /assign/i,
    /assignable/i,
    /assignee/i,
    /right to assign/i,
    /may assign this contract/i
  ];
  extracted.assignable = assignmentPatterns.some(pattern => pattern.test(contractText));

  // Marketing clause detection
  const marketingPatterns = [
    /market/i,
    /advertise/i,
    /list for sale/i,
    /marketing authorization/i,
    /right to market/i,
    /syndicate/i
  ];
  extracted.marketingClauseFound = marketingPatterns.some(pattern => pattern.test(contractText));

  // Extract seller name (simplified pattern)
  const sellerMatch = contractText.match(/seller[:\s]+([A-Z][a-z]+\s[A-Z][a-z]+)/i);
  if (sellerMatch) {
    extracted.sellerName = sellerMatch[1];
  }

  // Extract buyer entity
  const buyerMatch = contractText.match(/buyer[:\s]+([A-Z][A-Z\s]+LLC|[A-Z][A-Z\s]+Inc)/i);
  if (buyerMatch) {
    extracted.buyerEntity = buyerMatch[1];
  }

  // Extract purchase price
  const priceMatch = contractText.match(/purchase price[:\s]+\$?([\d,]+)/i);
  if (priceMatch) {
    extracted.purchasePrice = parseInt(priceMatch[1].replace(/,/g, ''));
  }

  // Extract dates
  const datePattern = /\d{1,2}\/\d{1,2}\/\d{4}/g;
  const dates = contractText.match(datePattern);
  if (dates && dates.length > 0) {
    extracted.contractDate = dates[0];
  }

  return extracted;
}

/**
 * Verify seller name against public records
 * In production, this would query county assessor or title company APIs
 */
async function verifySellerOwnership(
  sellerName: string,
  propertyAddress: string
): Promise<{ match: boolean; publicRecordOwner?: string }> {
  // TODO: Integrate with county assessor API or title company API
  // For now, simulate verification

  // In production:
  // const publicRecords = await countyAssessorAPI.getOwner(propertyAddress);
  // return { match: publicRecords.owner === sellerName, publicRecordOwner: publicRecords.owner };

  return {
    match: true,
    publicRecordOwner: sellerName
  };
}

/**
 * Verify buyer entity against wholesaler profile
 * In production, this would check against user database
 */
async function verifyBuyerEntity(
  buyerEntity: string,
  wholesalerId: number
): Promise<{ match: boolean; registeredEntity?: string }> {
  // TODO: Query wholesaler profile from database
  // const wholesaler = await Wholesaler.findByPk(wholesalerId);
  // return { match: wholesaler.entity_name === buyerEntity, registeredEntity: wholesaler.entity_name };

  return {
    match: true,
    registeredEntity: buyerEntity
  };
}

/**
 * Check for daisy chain indicators
 */
function detectDaisyChain(
  sellerName: string,
  knownWholesalers: string[]
): boolean {
  // Check if seller is a known wholesaler entity
  const sellerLower = sellerName.toLowerCase();
  return knownWholesalers.some(wholesaler =>
    sellerLower.includes(wholesaler.toLowerCase())
  );
}

/**
 * Apply state-specific compliance rules
 */
function applyStateComplianceRules(
  state: string,
  extractedData: ExtractedContractData
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  // State-specific rules based on Knowledge.md
  const strictStates = ['OK', 'MD', 'ND', 'CT', 'IL', 'IN', 'OH'];

  if (strictStates.includes(state)) {
    if (!extractedData.marketingClauseFound) {
      issues.push({
        type: 'state_disclosure_required',
        severity: 'critical',
        message: `${state} requires explicit marketing authorization in contract`,
        suggestedFix: 'Add state-specific marketing authorization addendum'
      });
    }
  }

  // Oklahoma specific (effective 11/1/2025)
  if (state === 'OK') {
    issues.push({
      type: 'oklahoma_hb1089',
      severity: 'warning',
      message: 'Oklahoma HB 1089 requires written disclosure before marketing',
      suggestedFix: 'Ensure written disclosure is executed'
    });
  }

  // Maryland specific (effective 10/1/2025)
  if (state === 'MD') {
    issues.push({
      type: 'maryland_sb0205',
      severity: 'warning',
      message: 'Maryland requires wholesale disclosure at initial contact',
      suggestedFix: 'Execute Maryland wholesale disclosure form'
    });
  }

  return issues;
}

/**
 * Calculate overall compliance status
 */
function calculateComplianceStatus(issues: ComplianceIssue[]): ComplianceStatus {
  const hasCritical = issues.some(issue => issue.severity === 'critical');
  const hasWarning = issues.some(issue => issue.severity === 'warning');

  if (hasCritical) return 'Red';
  if (hasWarning) return 'Yellow';
  return 'Green';
}

/**
 * Generate recommendations based on issues
 */
function generateRecommendations(issues: ComplianceIssue[]): string[] {
  const recommendations: string[] = [];
  const issueTypes = new Set(issues.map(i => i.type));

  if (issueTypes.has('missing_assignment_clause')) {
    recommendations.push('Add Assignment of Contract clause or plan for double close');
  }

  if (issueTypes.has('missing_marketing_clause')) {
    recommendations.push('Execute Marketing Authorization Addendum before listing property');
  }

  if (issueTypes.has('seller_mismatch')) {
    recommendations.push('Verify seller identity with title company or county records');
  }

  if (issueTypes.has('entity_mismatch')) {
    recommendations.push('Ensure contract is signed by registered wholesaler entity');
  }

  if (issueTypes.has('daisy_chain_detected')) {
    recommendations.push('CRITICAL: Deal appears to be daisy chained. Only submit direct-to-seller contracts');
  }

  if (issueTypes.has('state_disclosure_required')) {
    recommendations.push('Execute required state-specific wholesale disclosure forms');
  }

  return recommendations;
}

// =====================================================
// Main Controller Functions
// =====================================================

/**
 * POST /api/ai/compliance/analyze
 * Analyze contract for compliance issues
 */
export const analyzeCompliance = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const requestData: ComplianceAnalysisRequest = req.body;
    const { propertyId, contractPDF, wholesalerEntityName, expectedSellerName } = requestData;

    // Validate required fields
    if (!propertyId) {
      return res.status(400).json({
        success: false,
        error: 'propertyId is required',
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime
      });
    }

    // TODO: In production, use OCR + LLM to extract text from PDF
    // For now, simulate with mock contract text
    const mockContractText = `
      REAL ESTATE PURCHASE AND SALE AGREEMENT

      This agreement is made between John Smith (Seller) and
      ${wholesalerEntityName || 'ABC Investments LLC'} (Buyer).

      Property Address: 123 Main Street, Austin, TX 78701
      Purchase Price: $250,000

      The Buyer shall have the right to assign this contract to another party.
      The Buyer is authorized to market this property during the inspection period.

      Contract Date: 01/15/2025
      Expiration Date: 02/15/2025
    `;

    // Extract contract data
    const extractedData = analyzeContractText(mockContractText);
    const issues: ComplianceIssue[] = [];

    // 1. Check assignability
    if (!extractedData.assignable) {
      issues.push({
        type: 'missing_assignment_clause',
        severity: 'critical',
        message: 'Contract does not contain assignment clause',
        suggestedFix: 'Add assignment clause or use novation/double close'
      });
    }

    // 2. Check marketing clause
    if (!extractedData.marketingClauseFound) {
      issues.push({
        type: 'missing_marketing_clause',
        severity: 'warning',
        message: 'Marketing authorization clause not found',
        field: 'marketingClauseFound',
        suggestedFix: 'Request signed Marketing Authorization Addendum'
      });
    }

    // 3. Verify seller ownership
    if (extractedData.sellerName) {
      const sellerVerification = await verifySellerOwnership(
        extractedData.sellerName,
        '123 Main Street' // In production, get from property record
      );

      if (!sellerVerification.match) {
        issues.push({
          type: 'seller_mismatch',
          severity: 'critical',
          message: `Seller name "${extractedData.sellerName}" does not match public records "${sellerVerification.publicRecordOwner}"`,
          suggestedFix: 'Verify ownership with title company'
        });
      }
    }

    // 4. Verify buyer entity
    if (extractedData.buyerEntity && wholesalerEntityName) {
      const entityVerification = await verifyBuyerEntity(
        extractedData.buyerEntity,
        1 // In production, get wholesalerId from auth context
      );

      if (!entityVerification.match) {
        issues.push({
          type: 'entity_mismatch',
          severity: 'critical',
          message: 'Buyer entity does not match registered wholesaler entity',
          suggestedFix: 'Use registered entity name or update wholesaler profile'
        });
      }
    }

    // 5. Check for daisy chain
    const knownWholesalers = ['LLC', 'Investments', 'Properties', 'Holdings'];
    if (extractedData.sellerName && detectDaisyChain(extractedData.sellerName, knownWholesalers)) {
      issues.push({
        type: 'daisy_chain_detected',
        severity: 'critical',
        message: 'Potential daisy chain detected - seller appears to be another wholesaler',
        suggestedFix: 'Only submit contracts direct from property owner'
      });
    }

    // 6. Apply state-specific rules
    const stateIssues = applyStateComplianceRules('TX', extractedData);
    issues.push(...stateIssues);

    // Calculate overall status
    const status = calculateComplianceStatus(issues);
    const recommendations = generateRecommendations(issues);
    const confidenceScore = extractedData.assignable && extractedData.marketingClauseFound ? 95 : 70;
    const needsHumanReview = status === 'Red' || issues.length > 3;

    // Prepare response
    const response: ComplianceAnalysisResponse = {
      status,
      issues,
      extractedData,
      recommendations,
      confidenceScore,
      needsHumanReview,
      nextSteps: status === 'Green'
        ? ['Proceed to marketing distribution', 'Execute broker MSA if not already done']
        : status === 'Yellow'
        ? ['Execute recommended addendums', 'Re-submit for compliance check']
        : ['Do not proceed', 'Resolve critical issues', 'Contact compliance team']
    };

    // TODO: Save compliance check to database
    // await ComplianceCheck.create({ property_id: propertyId, ...response });

    // Log to audit trail
    // await AIAgentAuditLog.create({
    //   agent_type: 'compliance',
    //   action: 'analyze_contract',
    //   entity_type: 'property',
    //   entity_id: propertyId,
    //   input_data: requestData,
    //   output_data: response,
    //   success: true,
    //   execution_time_ms: Date.now() - startTime
    // });

    const apiResponse: AIAgentResponse<ComplianceAnalysisResponse> = {
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    };

    res.json(apiResponse);

  } catch (error) {
    console.error('Error in compliance analysis:', error);

    const apiResponse: AIAgentResponse<ComplianceAnalysisResponse> = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    };

    res.status(500).json(apiResponse);
  }
};

/**
 * GET /api/ai/compliance/history/:propertyId
 * Get compliance check history for a property
 */
export const getComplianceHistory = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { propertyId } = req.params;

    // TODO: Query from database
    // const checks = await ComplianceCheck.findAll({
    //   where: { property_id: propertyId },
    //   order: [['created_at', 'DESC']]
    // });

    const mockHistory = [
      {
        id: 1,
        property_id: parseInt(propertyId),
        check_type: 'contract_analysis',
        status: 'Green',
        issues: [],
        created_at: new Date()
      }
    ];

    res.json({
      success: true,
      data: mockHistory,
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error fetching compliance history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime
    });
  }
};
