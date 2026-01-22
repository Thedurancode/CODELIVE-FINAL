/**
 * Seed Default Extraction Profiles
 *
 * Creates per-state extraction profiles for powerful document field extraction.
 * Seeds profiles for TX, FL, and CA with state-specific field labels and regex patterns.
 */

import ComplianceExtractionProfile from '../models/ComplianceExtractionProfile';

export async function seedExtractionProfiles(): Promise<void> {
  console.log('🌱 Seeding default extraction profiles...');

  const profiles = [
    // ========================================================================
    // TEXAS PROFILES
    // ========================================================================
    {
      state: 'TX',
      category: 'purchase_contract',
      name: 'Texas Purchase Contract (TREC)',
      description: 'Texas Real Estate Commission standard purchase contract with Texas-specific terminology',
      fieldLabels: {
        sellerName: ['Seller', 'Grantor', 'Owner'],
        buyerName: ['Buyer', 'Purchaser', 'Grantee'],
        propertyAddress: ['Property', 'Subject Property', 'Property Address', 'Premises'],
        purchasePrice: ['Purchase Price', 'Sales Price', 'Contract Price'],
        earnestMoney: ['Earnest Money', 'EMD', 'Deposit'],
        closingDate: ['Closing Date', 'Settlement Date', 'Closing'],
        contractExpirationDate: ['Expiration Date', 'Contract Expiration', 'Effective Date'],
        assignable: ['Assignable', 'Right to Assign', 'Assignment Rights'],
        marketingClauseFound: ['Marketing Authorization', 'Right to Market', 'Syndicate'],
      },
      regexHints: {
        sellerName: '/(?:seller|grantor|owner)[:\\s]+([A-Z][a-zA-Z\\s]+(?:LLC|Inc|Corp)?)/i',
        buyerName: '/(?:buyer|purchaser|grantee)[:\\s]+([A-Z][a-zA-Z\\s]+(?:LLC|Inc|Corp)?)/i',
        purchasePrice: '/(?:purchase\\s+price|sales\\s+price)[:\\s]*\\$?\\s*([\\d,]+(?:\\.\\d{2})?)/i',
        closingDate: '/(?:closing\\s+date|settlement\\s+date)[:\\s]*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})/i',
      },
      promptOverrides: `You extract structured fields from Texas real estate purchase contracts (TREC forms).

In Texas contracts, note these conventions:
- "Grantor" is commonly used instead of "Seller"
- "Grantee" is commonly used instead of "Buyer"
- Earnest Money is typically referred to as "EMD" or "Deposit"
- Texas requires specific disclosure of assignment rights

Return JSON with this schema:
{
  "confidence": 0.0-1.0,
  "sellerName": "string or null",
  "buyerName": "string or null",
  "propertyAddress": "string or null",
  "purchasePrice": number or null,
  "earnestMoney": number or null,
  "closingDate": "YYYY-MM-DD" or null,
  "contractExpirationDate": "YYYY-MM-DD" or null,
  "assignable": true/false/null,
  "marketingClauseFound": true/false/null,
  "fieldEvidence": {
    "fieldName": { "snippet": "exact text from page", "confidence": 0.0-1.0 }
  }
}

Rules:
- confidence is 0-1 based on page clarity and completeness
- purchasePrice and earnestMoney are numbers (no $ or commas)
- snippets must quote exact text from the page
- if unknown, use null and omit fieldEvidence entry`,
      requiredFields: ['sellerName', 'buyerName', 'propertyAddress', 'purchasePrice', 'closingDate', 'assignable'],
      minConfidence: 0.75,
      enabled: true,
      priority: 100,
    },

    {
      state: 'TX',
      category: 'assignment_addendum',
      name: 'Texas Assignment Addendum',
      description: 'Texas assignment contract addendum',
      fieldLabels: {
        sellerName: ['Assignor', 'Original Buyer', 'Seller'],
        buyerName: ['Assignee', 'New Buyer', 'Buyer'],
        propertyAddress: ['Property', 'Subject Property'],
        assignmentFee: ['Assignment Fee', 'Fee', 'Consideration'],
      },
      regexHints: {
        assignmentFee: '/(?:assignment\\s+fee|fee)[:\\s]*\\$?\\s*([\\d,]+(?:\\.\\d{2})?)/i',
      },
      promptOverrides: `You extract fields from Texas assignment contract addendums.

Focus on:
- Assignor (original buyer) and Assignee (new buyer)
- Assignment Fee
- Property details

Return JSON with assignment-specific fields.`,
      requiredFields: ['sellerName', 'buyerName', 'propertyAddress', 'assignmentFee'],
      minConfidence: 0.70,
      enabled: true,
      priority: 90,
    },

    // ========================================================================
    // FLORIDA PROFILES
    // ========================================================================
    {
      state: 'FL',
      category: 'purchase_contract',
      name: 'Florida Purchase Contract (FAR/BAR)',
      description: 'Florida Association of Realtors / Florida Bar standard contract',
      fieldLabels: {
        sellerName: ['Seller', 'Owner', 'Vendor'],
        buyerName: ['Buyer', 'Purchaser'],
        propertyAddress: ['Property Address', 'Property', 'Real Property'],
        purchasePrice: ['Purchase Price', 'Price', 'Sales Price'],
        earnestMoney: ['Initial Deposit', 'Earnest Money', 'Deposit'],
        closingDate: ['Closing Date', 'Close Date'],
        contractExpirationDate: ['Effective Date', 'Contract Date'],
        assignable: ['Assignable', 'Assignment', 'Assigns'],
        marketingClauseFound: ['Marketing Consent', 'Authorization to Market'],
      },
      regexHints: {
        sellerName: '/(?:seller|owner)[:\\s]+([A-Z][a-zA-Z\\s]+(?:LLC|Inc|Corp)?)/i',
        buyerName: '/(?:buyer|purchaser)[:\\s]+([A-Z][a-zA-Z\\s]+(?:LLC|Inc|Corp)?)/i',
        earnestMoney: '/(?:initial\\s+deposit|earnest\\s+money)[:\\s]*\\$?\\s*([\\d,]+(?:\\.\\d{2})?)/i',
      },
      promptOverrides: `You extract fields from Florida real estate purchase contracts (FAR/BAR forms).

Florida-specific conventions:
- "Initial Deposit" is commonly used for earnest money
- Florida contracts require explicit marketing consent
- Assignment rights must be clearly stated

Return JSON with standard purchase contract fields.`,
      requiredFields: ['sellerName', 'buyerName', 'propertyAddress', 'purchasePrice', 'closingDate', 'marketingClauseFound'],
      minConfidence: 0.75,
      enabled: true,
      priority: 100,
    },

    // ========================================================================
    // CALIFORNIA PROFILES
    // ========================================================================
    {
      state: 'CA',
      category: 'purchase_contract',
      name: 'California Purchase Agreement (CAR)',
      description: 'California Association of Realtors standard purchase agreement',
      fieldLabels: {
        sellerName: ['Seller', 'Transferor'],
        buyerName: ['Buyer', 'Transferee'],
        propertyAddress: ['Property Address', 'Real Property', 'Property'],
        purchasePrice: ['Purchase Price', 'Offer Price'],
        earnestMoney: ['Initial Deposit', 'Deposit', 'Earnest Money Deposit'],
        closingDate: ['Close of Escrow', 'COE', 'Closing Date'],
        contractExpirationDate: ['Date Prepared', 'Offer Expiration'],
        assignable: ['Assignable', 'Assignment Rights'],
        marketingClauseFound: ['Marketing Authorization', 'Listing Rights'],
      },
      regexHints: {
        sellerName: '/(?:seller|transferor)[:\\s]+([A-Z][a-zA-Z\\s]+(?:LLC|Inc|Corp)?)/i',
        buyerName: '/(?:buyer|transferee)[:\\s]+([A-Z][a-zA-Z\\s]+(?:LLC|Inc|Corp)?)/i',
        closingDate: '/(?:close\\s+of\\s+escrow|COE)[:\\s]*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})/i',
      },
      promptOverrides: `You extract fields from California real estate purchase agreements (CAR forms).

California-specific conventions:
- "Transferor" may be used for Seller
- "Transferee" may be used for Buyer
- "Close of Escrow" (COE) is used instead of "Closing Date"
- California has strict disclosure requirements

Return JSON with standard purchase contract fields.`,
      requiredFields: ['sellerName', 'buyerName', 'propertyAddress', 'purchasePrice', 'closingDate'],
      minConfidence: 0.75,
      enabled: true,
      priority: 100,
    },

    // ========================================================================
    // OKLAHOMA PROFILES (Wholesale Assignment Workflow)
    // ========================================================================
    {
      state: 'OK',
      category: 'purchase_contract',
      name: 'Oklahoma Purchase Agreement (Wholesale)',
      description: 'Oklahoma wholesale purchase contract with assignment focus',
      fieldLabels: {
        sellerName: ['Seller', 'Owner', 'Vendor'],
        buyerName: ['Buyer', 'Purchaser'],
        propertyAddress: ['Property Address', 'Property', 'Subject Property', 'Real Property'],
        purchasePrice: ['Purchase Price', 'Sales Price', 'Price', 'Contract Price'],
        earnestMoney: ['Earnest Money', 'Deposit', 'EMD', 'Initial Deposit'],
        closingDate: ['Closing Date', 'Close Date', 'Settlement Date'],
        contractExpirationDate: ['Expiration Date', 'Contract Expiration', 'Effective Date', 'Option Period Expiration'],
        assignable: ['Assignable', 'Right to Assign', 'Assignment Rights', 'and/or assigns'],
        marketingClauseFound: ['Marketing', 'Right to Market', 'Inspection Period', 'Due Diligence Period'],
        asIsLanguage: ['AS-IS', 'As Is', 'Present Condition', 'Without Warranty'],
      },
      regexHints: {
        sellerName: '/(?:seller|owner|vendor)[:\\s]+([A-Z][a-zA-Z\\s]+(?:LLC|Inc|Corp)?)/i',
        buyerName: '/(?:buyer|purchaser)[:\\s]+([A-Z][a-zA-Z\\s]+(?:LLC|Inc|Corp)?|.+and\\/or\\s+assigns)/i',
        purchasePrice: '/(?:purchase\\s+price|sales\\s+price|price)[:\\s]*\\$?\\s*([\\d,]+(?:\\.\\d{2})?)/i',
        closingDate: '/(?:closing\\s+date|close\\s+date|settlement)[:\\s]*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})/i',
        assignable: '/(?:and\\/or\\s+assigns|assignable|assignment\\s+rights)/i',
        asIsLanguage: '/(?:AS-IS|as\\s+is|present\\s+condition|without\\s+warranty)/i',
      },
      promptOverrides: `You extract structured fields from Oklahoma wholesale purchase contracts with assignment focus.

Oklahoma wholesale contract conventions:
- Buyer often includes "and/or assigns" language for assignability
- AS-IS language is critical for wholesale deals
- Marketing/inspection periods allow assignment activity
- Contract must explicitly allow assignment

CRITICAL for Oklahoma wholesale:
- Check if buyer name includes "and/or assigns"
- Look for explicit assignment permission
- Verify AS-IS purchase language exists
- Check for inspection/due diligence period that allows marketing

Return JSON with this schema:
{
  "confidence": 0.0-1.0,
  "sellerName": "string or null",
  "buyerName": "string or null (may include 'and/or assigns')",
  "propertyAddress": "string or null",
  "purchasePrice": number or null,
  "earnestMoney": number or null,
  "closingDate": "YYYY-MM-DD" or null,
  "contractExpirationDate": "YYYY-MM-DD" or null,
  "assignable": true/false/null,
  "marketingClauseFound": true/false/null,
  "asIsLanguage": true/false/null,
  "fieldEvidence": {
    "fieldName": { "snippet": "exact text from page", "confidence": 0.0-1.0 }
  }
}

Rules:
- confidence is 0-1 based on clarity and completeness
- assignable should be true if "and/or assigns" found OR explicit assignment rights
- asIsLanguage must be present for valid wholesale contract
- snippets must quote exact text from the document`,
      requiredFields: ['sellerName', 'buyerName', 'propertyAddress', 'purchasePrice', 'closingDate', 'assignable', 'asIsLanguage'],
      minConfidence: 0.75,
      enabled: true,
      priority: 100,
    },

    {
      state: 'OK',
      category: 'assignment_addendum',
      name: 'Oklahoma Assignment Agreement',
      description: 'Oklahoma assignment contract for wholesale deals',
      fieldLabels: {
        sellerName: ['Assignor', 'Original Buyer', 'Wholesaler'],
        buyerName: ['Assignee', 'New Buyer', 'End Buyer'],
        propertyAddress: ['Property', 'Subject Property', 'Property Address'],
        assignmentFee: ['Assignment Fee', 'Fee', 'Consideration', 'Assignment Compensation'],
        originalContractDate: ['Original Contract Date', 'Contract Date', 'Effective Date'],
        assignmentDate: ['Assignment Date', 'Date of Assignment', 'Effective Date of Assignment'],
      },
      regexHints: {
        assignmentFee: '/(?:assignment\\s+fee|fee|consideration|compensation)[:\\s]*\\$?\\s*([\\d,]+(?:\\.\\d{2})?)/i',
        originalContractDate: '/(?:original\\s+contract\\s+date|contract\\s+date)[:\\s]*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})/i',
        assignmentDate: '/(?:assignment\\s+date|date\\s+of\\s+assignment)[:\\s]*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})/i',
      },
      promptOverrides: `You extract fields from Oklahoma assignment agreements for wholesale deals.

Oklahoma assignment conventions:
- Assignor = Original buyer/wholesaler
- Assignee = New buyer/end buyer
- Assignment fee must be disclosed
- Original contract date required
- Assignment date must be AFTER seller received cancellation disclosure

Focus on:
- Clear identification of assignor and assignee
- Assignment fee/compensation
- Original contract reference
- Assignment execution date

Return JSON with assignment-specific fields including all dates.`,
      requiredFields: ['sellerName', 'buyerName', 'propertyAddress', 'assignmentFee', 'assignmentDate'],
      minConfidence: 0.70,
      enabled: true,
      priority: 90,
    },

    {
      state: 'OK',
      category: 'disclosure_addendum',
      name: 'Oklahoma Wholesale Disclosure Addendum',
      description: 'Oklahoma-specific wholesale disclosure requirements checker',
      fieldLabels: {
        notLicensedBroker: ['not a licensed', 'not licensed', 'not a real estate broker', 'not a broker'],
        actingAsPrincipal: ['acting as principal', 'solely as principal', 'principal only', 'in principal capacity'],
        equitableInterestOnly: ['equitable interest', 'equitable title', 'contract interest'],
        intentToAssign: ['intent to assign', 'intend to assign', 'may assign', 'right to assign'],
        assignmentCompensation: ['assignment fee', 'assignment compensation', 'fee disclosure', 'compensation disclosure'],
        dueDiligencePeriod: ['inspection period', 'due diligence period', 'feasibility period'],
        noPerformanceGuarantee: ['no guarantee', 'not guarantee', 'without guarantee'],
        independentAdviceRight: ['right to independent', 'seek independent', 'consult with attorney', 'independent legal advice'],
      },
      regexHints: {
        notLicensedBroker: '/(?:buyer|purchaser).{0,50}(?:not\\s+a\\s+licensed|not\\s+licensed|not\\s+a\\s+real\\s+estate\\s+broker)/i',
        actingAsPrincipal: '/(?:acting|solely).{0,30}(?:as\\s+principal|principal\\s+only)/i',
        equitableInterestOnly: '/(?:equitable\\s+interest|equitable\\s+title|contract\\s+interest)/i',
        intentToAssign: '/(?:intent\\s+to\\s+assign|intend\\s+to\\s+assign|may\\s+assign|right\\s+to\\s+assign)/i',
        assignmentCompensation: '/(?:assignment\\s+fee|assignment\\s+compensation|fee.{0,30}disclosure)/i',
        dueDiligencePeriod: '/(?:inspection\\s+period|due\\s+diligence\\s+period|feasibility\\s+period).{0,50}(?:day|days|business\\s+days)/i',
        noPerformanceGuarantee: '/(?:no\\s+guarantee|not\\s+guarantee|without\\s+guarantee)(?:.{0,30}performance)?/i',
        independentAdviceRight: '/(?:right\\s+to\\s+independent|seek\\s+independent|consult.{0,30}attorney|independent\\s+legal\\s+advice)/i',
      },
      promptOverrides: `You are checking for Oklahoma-specific wholesale disclosure requirements in a contract addendum.

You must identify the PRESENCE (not exact wording) of these 8 critical disclosures:

1. Buyer not a licensed real estate broker
2. Buyer acting solely as a principal
3. Equitable interest only (not full title)
4. Intent to assign to subsequent purchaser
5. Assignment compensation disclosure
6. Inspection/due diligence period allows marketing/assignment
7. No guarantee of performance
8. Seller's right to independent legal advice

Return JSON with this schema:
{
  "confidence": 0.0-1.0,
  "notLicensedBroker": true/false/null,
  "actingAsPrincipal": true/false/null,
  "equitableInterestOnly": true/false/null,
  "intentToAssign": true/false/null,
  "assignmentCompensation": true/false/null,
  "dueDiligencePeriod": true/false/null,
  "noPerformanceGuarantee": true/false/null,
  "independentAdviceRight": true/false/null,
  "fieldEvidence": {
    "fieldName": { "snippet": "exact text from document", "confidence": 0.0-1.0 }
  },
  "overallCompliance": "GREEN" | "YELLOW" | "RED"
}

Scoring Rules:
- GREEN: All 8 disclosures found
- YELLOW: 5-7 disclosures found (remediable)
- RED: <5 disclosures found (non-compliant)

Critical:
- Look for SUBSTANCE, not exact wording
- Paraphrasing is acceptable if meaning is clear
- Provide exact snippet for each found disclosure
- If any disclosure is ambiguous, mark confidence < 0.8`,
      requiredFields: [
        'notLicensedBroker',
        'actingAsPrincipal',
        'equitableInterestOnly',
        'intentToAssign',
        'assignmentCompensation',
        'dueDiligencePeriod',
        'noPerformanceGuarantee',
        'independentAdviceRight'
      ],
      minConfidence: 0.80,
      enabled: true,
      priority: 100,
    },

    {
      state: 'OK',
      category: 'cancellation_disclosure',
      name: 'Oklahoma Cancellation/Right-to-Cancel Form',
      description: 'Oklahoma seller cancellation rights disclosure',
      fieldLabels: {
        sellerName: ['Seller', 'Owner', 'Property Owner'],
        rightToCancelPeriod: ['right to cancel', 'cancellation period', 'cancel within', 'rescission period'],
        cancellationDeadline: ['deadline', 'must cancel by', 'cancel before', 'rescission deadline'],
        acknowledgmentSignature: ['seller signature', 'acknowledged', 'received by seller'],
        deliveryDate: ['delivered on', 'date delivered', 'received on', 'date of receipt'],
      },
      regexHints: {
        rightToCancelPeriod: '/(?:cancel\\s+within|right\\s+to\\s+cancel).{0,30}(\\d+)\\s*(?:day|days|business\\s+days)/i',
        cancellationDeadline: '/(?:deadline|must\\s+cancel\\s+by|cancel\\s+before)[:\\s]*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})/i',
        deliveryDate: '/(?:delivered\\s+on|date\\s+delivered|received\\s+on)[:\\s]*(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})/i',
      },
      promptOverrides: `You extract fields from Oklahoma cancellation/right-to-cancel disclosure forms.

CRITICAL TIMING RULE:
Seller must receive this disclosure:
- AFTER offer acceptance
- BEFORE assignment execution

You must extract:
1. Seller name/acknowledgment
2. Cancellation period (e.g., "3 business days")
3. Cancellation deadline date (if specified)
4. Seller signature/acknowledgment
5. Delivery date (CRITICAL for timing validation)

Return JSON with this schema:
{
  "confidence": 0.0-1.0,
  "sellerName": "string or null",
  "rightToCancelPeriod": "string or null (e.g., '3 business days')",
  "cancellationDeadline": "YYYY-MM-DD" or null,
  "acknowledgmentSignature": true/false/null,
  "deliveryDate": "YYYY-MM-DD" or null,
  "fieldEvidence": {
    "fieldName": { "snippet": "exact text", "confidence": 0.0-1.0 }
  }
}

Critical:
- deliveryDate is MANDATORY for timing validation
- acknowledgmentSignature confirms seller received disclosure
- Without delivery date, cannot validate timing compliance`,
      requiredFields: ['sellerName', 'rightToCancelPeriod', 'acknowledgmentSignature', 'deliveryDate'],
      minConfidence: 0.75,
      enabled: true,
      priority: 100,
    },

    // ========================================================================
    // GENERIC FALLBACK PROFILE (lowest priority)
    // ========================================================================
    {
      state: 'US',
      category: 'purchase_contract',
      name: 'Generic Purchase Contract',
      description: 'Fallback profile for contracts from states without specific profiles',
      fieldLabels: {
        sellerName: ['Seller', 'Owner', 'Grantor', 'Vendor'],
        buyerName: ['Buyer', 'Purchaser', 'Grantee'],
        propertyAddress: ['Property Address', 'Property', 'Subject Property', 'Premises'],
        purchasePrice: ['Purchase Price', 'Sales Price', 'Price', 'Contract Price'],
        earnestMoney: ['Earnest Money', 'Deposit', 'EMD', 'Initial Deposit'],
        closingDate: ['Closing Date', 'Settlement Date', 'Close Date'],
        contractExpirationDate: ['Expiration Date', 'Contract Expiration', 'Effective Date'],
        assignable: ['Assignable', 'Right to Assign', 'Assignment'],
        marketingClauseFound: ['Marketing', 'Right to Market', 'Syndicate'],
      },
      regexHints: {},
      promptOverrides: null,
      requiredFields: ['sellerName', 'buyerName', 'propertyAddress', 'purchasePrice'],
      minConfidence: 0.70,
      enabled: true,
      priority: 1, // Lowest priority - only used as fallback
    },
  ];

  for (const profileData of profiles) {
    try {
      const existing = await ComplianceExtractionProfile.findOne({
        where: {
          state: profileData.state,
          category: profileData.category,
        },
      });

      if (existing) {
        console.log(`  ↻ Updating existing profile: ${profileData.name}`);
        await existing.update(profileData);
      } else {
        console.log(`  ✓ Creating profile: ${profileData.name}`);
        await ComplianceExtractionProfile.create(profileData);
      }
    } catch (error) {
      console.error(`  ✗ Failed to seed profile ${profileData.name}:`, error);
    }
  }

  console.log('✅ Extraction profiles seeded successfully');
}

// Allow running directly
if (require.main === module) {
  (async () => {
    try {
      // Initialize database connection
      const { default: sequelize } = await import('../config/database');
      await sequelize.authenticate();
      console.log('Database connected');

      // Run seed
      await seedExtractionProfiles();

      await sequelize.close();
      console.log('Done!');
      process.exit(0);
    } catch (error) {
      console.error('Seed failed:', error);
      process.exit(1);
    }
  })();
}
