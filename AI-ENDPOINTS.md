# AI Agent System - API Endpoints Documentation

## Overview

The Dispotree AI Agent System provides intelligent automation for contract compliance, property-to-fund matching, buyer communication, and compliance enforcement. This document details all available AI-powered endpoints.

**Base URL**: `http://localhost:3001/api/ai`

---

## 🤖 Available AI Agents

### 1. Contract Compliance Agent ✅ **IMPLEMENTED**
Analyzes contracts for assignability, marketing clauses, seller verification, and state-specific compliance.

### 2. Buy Box Matching Agent ✅ **IMPLEMENTED**
Intelligently matches properties to hedge fund investment criteria with weighted scoring.

### 3. Guardrail & Compliance Enforcement Agent ✅ **IMPLEMENTED**
Real-time content moderation to prevent circumvention and ensure regulatory compliance.

### 4. Deal Underwriting & Data Enrichment Agent 🚧 **COMING SOON**
Auto-enriches property data from Zillow, ATTOM, Rentometer, and other APIs.

### 5. Offer Ranking & Behavior Analysis Agent 🚧 **COMING SOON**
Ranks offers based on buyer behavior, historical closing rates, and engagement metrics.

### 6. Buyer Communication Agent 🚧 **COMING SOON**
AI-powered 24/7 buyer communication with neutral, compliant messaging.

---

## 📋 Contract Compliance Agent Endpoints

### POST `/api/ai/compliance/analyze`
Analyze contract for compliance issues

**Request Body:**
```json
{
  "propertyId": 123,
  "contractPDF": "base64_encoded_pdf_string",
  "wholesalerEntityName": "ABC Investments LLC",
  "expectedSellerName": "John Smith"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "Green",
    "issues": [
      {
        "type": "missing_marketing_clause",
        "severity": "warning",
        "message": "Marketing authorization clause not found",
        "field": "marketingClauseFound",
        "suggestedFix": "Request signed Marketing Authorization Addendum"
      }
    ],
    "extractedData": {
      "sellerName": "John Smith",
      "buyerEntity": "ABC Investments LLC",
      "assignable": true,
      "marketingClauseFound": false,
      "purchasePrice": 250000,
      "contractDate": "01/15/2025",
      "expirationDate": "02/15/2025"
    },
    "recommendations": [
      "Execute Marketing Authorization Addendum before listing property"
    ],
    "confidenceScore": 95,
    "needsHumanReview": false,
    "nextSteps": [
      "Execute recommended addendums",
      "Re-submit for compliance check"
    ]
  },
  "timestamp": "2025-01-15T10:30:00Z",
  "executionTimeMs": 342
}
```

**Compliance Status:**
- **Green**: Fully compliant, ready for marketing
- **Yellow**: Needs addendums or additional documentation
- **Red**: Critical issues, do not proceed

---

### GET `/api/ai/compliance/history/:propertyId`
Get compliance check history for a property

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "property_id": 123,
      "check_type": "contract_analysis",
      "status": "Green",
      "issues": [],
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "timestamp": "2025-01-15T11:00:00Z",
  "executionTimeMs": 45
}
```

---

## 💰 Buy Box Matching Agent Endpoints

### POST `/api/ai/buybox/match/:propertyId`
Match property to all active hedge fund buy boxes

**Request Body:**
```json
{
  "minScore": 50
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "propertyId": 123,
    "propertyAddress": "123 Main Street, Austin, TX",
    "matches": [
      {
        "fundId": 1,
        "fundName": "ABC Investments",
        "score": 92,
        "matchType": "strong",
        "reasons": [
          "✓ Property is in target state (TX)",
          "✓ Price $250,000 is within range ($50,000 - $300,000)",
          "✓ Bedrooms (3) match criteria",
          "✓ Bathrooms (2) match criteria",
          "✓ Property type (Single Family) is in target types"
        ],
        "criteriaMatched": ["state", "price", "bedrooms", "bathrooms", "propertyType"],
        "criteriaMissed": []
      },
      {
        "fundId": 3,
        "fundName": "Sunbelt Acquisitions",
        "score": 68,
        "matchType": "moderate",
        "reasons": [
          "✓ Property is in target state (TX)",
          "⚠ Price $250,000 is within 15% tolerance of range",
          "✓ Property type (Single Family) is in target types"
        ],
        "criteriaMatched": ["state", "propertyType"],
        "criteriaMissed": ["yearBuilt", "noHOA"]
      }
    ],
    "strongMatches": [
      {
        "fundId": 1,
        "fundName": "ABC Investments",
        "score": 92,
        "matchType": "strong"
      }
    ],
    "autoSubmitRecommendation": [1],
    "totalMatches": 2
  },
  "timestamp": "2025-01-15T10:30:00Z",
  "executionTimeMs": 123
}
```

**Match Scoring:**
- **Geographic Match** (30%): Must be in target states (hard requirement)
- **Price Range** (25%): Within fund's price criteria
- **Bedrooms** (10%): Meets bed count range
- **Bathrooms** (5%): Meets bath count range
- **Property Type** (15%): Matches target property types
- **Year Built** (10%): Meets minimum year requirement
- **Bonus Criteria** (5% each): Pool, HOA preference, Vacancy

**Match Types:**
- **Strong** (80-100): Highly recommended for submission
- **Moderate** (60-79): Consider for submission
- **Weak** (50-59): Low priority

---

### GET `/api/ai/buybox/list`
Get all active buy boxes

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "fund_name": "ABC Investments",
      "fund_type": "Institutional",
      "criteria": {
        "states": ["TX", "FL", "GA"],
        "minBeds": 2,
        "maxBeds": 4,
        "minBaths": 1,
        "maxBaths": 3,
        "minPrice": 50000,
        "maxPrice": 300000,
        "minYearBuilt": 1950,
        "propertyTypes": ["Single Family", "Townhouse"]
      },
      "contact_email": "acquisitions@abcinvestments.com",
      "contact_phone": "555-0123",
      "active": true,
      "priority": 1
    }
  ],
  "count": 3,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### POST `/api/ai/buybox/create`
Create new buy box

**Request Body:**
```json
{
  "fund_name": "New Fund LLC",
  "fund_type": "Family Office",
  "criteria": {
    "states": ["CA", "WA"],
    "minBeds": 3,
    "maxBeds": 5,
    "minBaths": 2,
    "maxBaths": 4,
    "minPrice": 200000,
    "maxPrice": 800000,
    "minYearBuilt": 1990,
    "propertyTypes": ["Single Family", "Condo"],
    "mustHavePool": false,
    "noHOA": false,
    "preferVacant": true
  },
  "contact_email": "deals@newfund.com",
  "contact_phone": "555-9999",
  "contact_name": "Jane Doe",
  "submission_method": "email"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 4,
    "fund_name": "New Fund LLC",
    "active": true,
    "created_at": "2025-01-15T10:30:00Z"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### PUT `/api/ai/buybox/:id`
Update existing buy box

**Request Body:** (partial update)
```json
{
  "criteria": {
    "maxPrice": 900000
  },
  "contact_email": "new-email@newfund.com"
}
```

---

### DELETE `/api/ai/buybox/:id`
Deactivate buy box (soft delete)

**Response:**
```json
{
  "success": true,
  "message": "Buy box deactivated successfully"
}
```

---

## 🛡️ Guardrail & Compliance Enforcement Endpoints

### POST `/api/ai/guardrail/check`
Check message for compliance violations

**Request Body:**
```json
{
  "message": "Call me at 555-1234 to discuss this deal",
  "buyerId": 456,
  "propertyId": 123
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "allowed": false,
    "violations": [
      {
        "type": "phone_number_sharing",
        "severity": "high",
        "action": "redact_and_warn",
        "matchedPattern": "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b",
        "context": "Phone number sharing detected"
      }
    ],
    "redactedMessage": "Call me at [PHONE REDACTED] to discuss this deal",
    "warningMessage": "For compliance and tracking purposes, please refrain from sharing contact information. All communication should go through this platform.",
    "escalateToHuman": true
  },
  "timestamp": "2025-01-15T10:30:00Z",
  "executionTimeMs": 56
}
```

**Violation Types:**
- `phone_number_sharing`: Phone numbers detected
- `email_sharing`: Email addresses detected
- `circumvention_attempt`: Attempts to bypass platform
- `unlicensed_brokerage`: Broker-like language without license
- `harassment`: Inappropriate or abusive language
- `fraud_attempt`: Potential misrepresentation

**Actions:**
- `allow`: Message is compliant
- `redact_and_warn`: Remove sensitive info and warn user
- `block_and_escalate`: Block message and alert human reviewer
- `escalate_to_human`: Requires human review

---

### GET `/api/ai/guardrail/flagged`
Get all flagged messages for review

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "property_id": 123,
      "buyer_id": 456,
      "message_content": "Call me at 555-1234",
      "flag_reason": "phone_number_sharing",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

---

## 🚧 Coming Soon Endpoints

### POST `/api/ai/underwriting/enrich/:propertyId`
AI-powered data enrichment from multiple sources

**Planned Features:**
- Auto-populate missing fields
- ARV calculation from Zillow + comps
- Rent estimates from Rentometer
- Neighborhood data from Google Maps
- Property history from ATTOM

---

### POST `/api/ai/offers/rank`
Rank offers based on buyer behavior

**Planned Features:**
- Buyer closing rate analysis
- Engagement metrics scoring
- Response time tracking
- Predictive offer acceptance modeling

---

### POST `/api/ai/chat/message`
AI-powered buyer communication

**Planned Features:**
- 24/7 instant responses
- Neutral, compliant messaging
- Question relay to sellers
- Proactive status updates
- Multi-language support

---

### GET `/api/ai/workflow/status/:propertyId`
Get workflow orchestrator status

**Planned Features:**
- Current workflow step
- Agent execution history
- Bottleneck detection
- Automated escalations

---

## 🔧 Integration Guide

### Example: Full Property Submission Workflow

```javascript
// 1. Create property
const property = await fetch('http://localhost:3001/api/listings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(propertyData)
});

const { id: propertyId } = await property.json();

// 2. Run compliance check
const compliance = await fetch(`http://localhost:3001/api/ai/compliance/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    propertyId,
    contractPDF: contractBase64,
    wholesalerEntityName: "ABC Investments LLC"
  })
});

const { data: complianceResult } = await compliance.json();

if (complianceResult.status === 'Red') {
  console.error('Compliance failed:', complianceResult.issues);
  return;
}

// 3. Match to buy boxes
const matches = await fetch(`http://localhost:3001/api/ai/buybox/match/${propertyId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ minScore: 70 })
});

const { data: matchResult } = await matches.json();

console.log(`Property matched to ${matchResult.totalMatches} funds`);
console.log('Strong matches:', matchResult.strongMatches);

// 4. Auto-submit to strong matches
for (const fundId of matchResult.autoSubmitRecommendation) {
  await submitToFund(propertyId, fundId);
}
```

---

## 📊 Response Format

All AI agent endpoints return responses in this format:

```json
{
  "success": true | false,
  "data": { ... },
  "error": "Error message if success=false",
  "timestamp": "ISO 8601 timestamp",
  "executionTimeMs": 123
}
```

---

## 🔐 Security & Compliance

1. **Data Privacy**: All contract data is processed securely and not stored permanently
2. **Audit Logging**: All AI agent actions are logged for compliance tracking
3. **Human Oversight**: Critical violations escalate to human reviewers
4. **State Compliance**: Follows 50-state wholesale regulations (see `/ai-agent-knowledgebase/Knowledge.md`)

---

## 💡 Best Practices

1. **Always check compliance before marketing** - Run compliance analysis on every new contract
2. **Use auto-submit for strong matches** - Properties scoring 80+ are high-confidence matches
3. **Monitor flagged messages** - Review guardrail violations regularly
4. **Keep buy boxes updated** - Adjust criteria based on fund feedback
5. **Track execution times** - Monitor API performance via `executionTimeMs`

---

## 📞 Support

For issues or questions about AI agent endpoints:
- API Documentation: `GET /api/ai`
- AI Agent Knowledge Base: `/ai-agent-knowledgebase/`
- Issue Tracker: https://github.com/yourusername/Dispotree/issues

---

**Version**: 1.0.0
**Last Updated**: January 2025
