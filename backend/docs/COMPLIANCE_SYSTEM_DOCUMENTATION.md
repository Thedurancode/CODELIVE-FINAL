# Dispotree Compliance System Documentation

> **Complete Reference Guide for the Enterprise Compliance System**

This document provides comprehensive documentation for Dispotree's compliance system, covering all services, APIs, database models, and configuration options.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Core Services](#2-core-services)
   - [Compliance Service](#21-compliance-service)
   - [Fraud Detection Service](#22-fraud-detection-service)
   - [Sanctions Screening Service](#23-sanctions-screening-service)
   - [Property Verification Service](#24-property-verification-service)
   - [Title Verification Service](#25-title-verification-service)
   - [SOC 2 Audit Logger](#26-soc-2-audit-logger)
   - [Compliance Event Stream](#27-compliance-event-stream)
   - [Compliance OCR Service](#28-compliance-ocr-service)
   - [Compliance Watchdog Scheduler](#29-compliance-watchdog-scheduler)
   - [Escalation Service](#210-escalation-service)
3. [Database Models](#3-database-models)
4. [API Endpoints](#4-api-endpoints)
5. [Configuration Reference](#5-configuration-reference)
6. [Dead Letter Queue](#6-dead-letter-queue)
7. [Integration Flow](#7-integration-flow)
8. [Best Practices](#8-best-practices)

---

## 1. System Overview

### What is the Compliance System?

The Compliance System is a multi-layered framework that ensures all real estate wholesale deals meet regulatory requirements, detect fraud, and maintain complete audit trails. It runs automatically during deal processing and can also be triggered manually.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DEAL SUBMISSION                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      COMPLIANCE PIPELINE                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   FRAUD     │  │  SANCTIONS  │  │  PROPERTY   │  │    TITLE    │    │
│  │  DETECTION  │→ │  SCREENING  │→ │ VERIFICATION│→ │ VERIFICATION│    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │    STATE    │  │     OCR     │  │  WATCHDOG   │                     │
│  │ COMPLIANCE  │  │  DOCUMENT   │  │  SCHEDULER  │                     │
│  │   RULES     │  │ EXTRACTION  │  │             │                     │
│  └─────────────┘  └─────────────┘  └─────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │  GREEN   │   │  YELLOW  │   │   RED    │
              │  (Pass)  │   │ (Warning)│   │ (Blocked)│
              └──────────┘   └──────────┘   └──────────┘
                    │               │               │
                    ▼               ▼               ▼
              ┌──────────────────────────────────────────┐
              │           SOC 2 AUDIT LOGGER             │
              │    (Immutable Hash-Chained Records)      │
              └──────────────────────────────────────────┘
                                    │
                                    ▼
              ┌──────────────────────────────────────────┐
              │         COMPLIANCE EVENT STREAM          │
              │         (Webhooks & Alerting)            │
              └──────────────────────────────────────────┘
```

### Key Concepts

| Term | Definition |
|------|------------|
| **Compliance Check** | Evaluation of a property against all applicable rules |
| **Compliance Status** | Result of a check: Green (pass), Yellow (warning), Red (fail/blocked) |
| **Fail-Safe Mode** | Safety feature that blocks deals when external APIs are unavailable |
| **Dead Letter Queue** | Storage for failed automation actions requiring manual intervention |
| **Hash Chain** | Cryptographic linking of audit records to detect tampering |
| **Rule Snapshot** | Point-in-time copy of rules used during a compliance check |

---

## 2. Core Services

### 2.1 Compliance Service

**File Location:** `backend/src/services/ComplianceService.ts`

**What It Does:**
Evaluates properties against state-specific compliance rules stored in the database. This is the central orchestrator for rule-based compliance checking.

**Key Features:**
- State-specific rules (e.g., different rules for Texas vs California)
- Universal rules that apply to all states (state = "ALL")
- Contact-aware evaluation (checks broker, attorney, seller assignments)
- Auto-queues passing deals for broker approval
- Saves rule snapshots for audit reproducibility

#### How to Use

**Check a Single Property:**
```typescript
import { complianceService } from './services/ComplianceService';
import Property from './models/Property';

const property = await Property.findByPk(123);
const result = await complianceService.checkProperty(property);

console.log(result.status);      // 'Green', 'Yellow', or 'Red'
console.log(result.issues);      // Array of compliance issues
console.log(result.passedChecks); // Array of passed rule names
```

**Get Compliance Summary for Multiple Properties:**
```typescript
const summary = await complianceService.getComplianceSummary([1, 2, 3, 4, 5]);
// Returns: { total, green, yellow, red, byState: { TX: {...}, CA: {...} } }
```

**Verify Rules Haven't Changed Since a Check:**
```typescript
const verification = await complianceService.verifyRulesUnchanged(checkId);
// Returns: { unchanged: boolean, checkHash, currentHash }
```

#### Compliance Status Definitions

| Status | Meaning | System Behavior |
|--------|---------|-----------------|
| **Green** | All rules passed | Auto-queued for broker approval |
| **Yellow** | Warning-level violations only | Flagged for review, can proceed |
| **Red** | Critical violations present | Deal is BLOCKED |

#### Rule Operators

The system supports 12 different rule operators:

| Operator | Description | Example Use Case |
|----------|-------------|------------------|
| `required` | Field must have a non-empty value | "Seller name is required" |
| `equals` | Field must exactly match value | "State must equal 'TX'" |
| `not_equals` | Field must not match value | "Status cannot be 'rejected'" |
| `contains` | Field must contain substring (case-insensitive) | "Address contains 'Street'" |
| `min_value` | Numeric field >= value | "Price must be at least $50,000" |
| `max_value` | Numeric field <= value | "ARV cannot exceed $2,000,000" |
| `min_days_until` | Date must be at least N days away | "Closing date must be 14+ days out" |
| `max_days_until` | Date must be at most N days away | "Contract expires within 30 days" |
| `regex` | Field matches regular expression | "Zip code matches ^\d{5}$" |
| `in_list` | Field is one of comma-separated values | "Property type in 'SFR,Condo,Townhouse'" |
| `not_in_list` | Field is not in comma-separated values | "State not in 'AK,HI'" |
| `is_true` | Boolean field is true | "Broker license verified = true" |
| `is_false` | Boolean field is false | "Is foreclosure = false" |

#### Contact-Aware Fields

Rules can evaluate these contact-based fields (automatically populated from assigned contacts):

```
Broker Fields:
- brokerOnFile (boolean - is a broker assigned?)
- brokerLicenseNumber
- brokerCompany
- brokerEmail
- brokerPhone

Attorney Fields:
- hasAttorney / attorneyOnFile
- attorneyName
- attorneyEmail

Seller Fields:
- hasSellerContact / sellerOnFile
- sellerName
- sellerEmail

Agent Fields:
- agentLicenseNumber
- agentEmail
- agentName

Wholesaler Fields:
- wholesalerLlcName
- llcOwnerEmail
```

---

### 2.2 Fraud Detection Service

**File Location:** `backend/src/services/FraudDetectionService.ts`

**What It Does:**
Provides comprehensive fraud detection for real estate wholesale deals through multiple detection methods: velocity checks, pattern detection, identity verification, and network analysis.

**Key Features:**
- Velocity monitoring (submission frequency limits)
- Pattern detection (known fraudulent behaviors)
- Network analysis (connections to confirmed fraud)
- PII masking in logs for privacy
- Configurable blocking thresholds
- Risk scoring (0-100 scale)

#### How to Use

**Check a Deal for Fraud:**
```typescript
import { fraudDetectionService } from './services/FraudDetectionService';

const result = await fraudDetectionService.checkDeal({
  propertyId: 123,
  propertyAddress: '123 Main St',
  city: 'Dallas',
  state: 'TX',
  zip: '75001',
  sellerName: 'John Smith',
  sellerPhone: '555-123-4567',
  sellerEmail: 'john@example.com',
  wholesalerName: 'ABC Wholesale LLC',
  askingPrice: 150000,
  estimatedValue: 200000,
  submissionIp: '192.168.1.1'
});

console.log(result.passed);        // true/false
console.log(result.riskScore);     // 0-100
console.log(result.riskLevel);     // 'low', 'medium', 'high', 'critical'
console.log(result.blocked);       // true if auto-blocked
console.log(result.signals);       // Array of detected fraud signals
console.log(result.velocityFlags); // Velocity threshold violations
console.log(result.patternFlags);  // Detected fraud patterns
```

**Confirm an Entity as Fraud:**
```typescript
await fraudDetectionService.confirmFraud(
  'phone',           // entityType: 'seller', 'phone', 'email', etc.
  '555-123-4567',    // entityValue
  'user-123',        // userId who confirmed
  'Confirmed via title company report' // notes
);
```

**Clear a False Positive:**
```typescript
await fraudDetectionService.clearSignal(signalId, 'user-123', 'Verified legitimate seller');
```

#### Velocity Thresholds

Default thresholds (configurable via `FRAUD_VELOCITY_MULTIPLIER`):

| Entity Type | Time Window | Max Count | Purpose |
|-------------|-------------|-----------|---------|
| `seller` | 24 hours | 3 | Same seller can't submit too many deals |
| `phone` | 24 hours | 5 | Same phone number limit |
| `email` | 24 hours | 5 | Same email address limit |
| `address` | 7 days (168h) | 2 | Property can't be submitted repeatedly |
| `ip` | 1 hour | 10 | IP-based rate limiting |
| `wholesaler` | 24 hours | 20 | Wholesaler submission limit |

#### Fraud Patterns Detected

| Pattern ID | Name | Description | Severity |
|------------|------|-------------|----------|
| `daisy_chain` | Daisy Chain | Seller is a known wholesaler | high |
| `price_manipulation` | Price Manipulation | Asking >50% above estimated value | medium |
| `rapid_resubmission` | Rapid Resubmission | Same property submitted 3+ times | high |
| `entity_mismatch` | Entity Mismatch | Contact info tied to different person | critical |
| `known_fraud_network` | Known Fraud Network | Connected to confirmed fraud entity | critical |

#### Risk Levels

| Score Range | Risk Level | System Behavior |
|-------------|------------|-----------------|
| 0-39 | low | Passes normally |
| 40-59 | medium | Caution flag, additional verification recommended |
| 60-79 | high | Manual review required before proceeding |
| 80-100 | critical | Auto-blocked if `FRAUD_BLOCK_HIGH_RISK=true` |

---

### 2.3 Sanctions Screening Service

**File Location:** `backend/src/services/SanctionsScreeningService.ts`

**What It Does:**
Screens sellers, buyers, wholesalers, and other parties against OFAC sanctions lists and other watchlists to ensure compliance with federal regulations.

**Key Features:**
- OFAC API integration (primary provider)
- Fallback providers (Dow Jones, World-Check)
- Fail-safe mode (blocks deals when API unavailable)
- 24-hour caching to reduce API calls
- Match resolution workflow
- Retry logic with exponential backoff

#### How to Use

**Screen a Single Entity:**
```typescript
import { sanctionsScreeningService } from './services/SanctionsScreeningService';

const result = await sanctionsScreeningService.screenEntity({
  entityName: 'John Smith',
  entityType: 'individual',  // or 'company'
  partyRole: 'seller',       // 'seller', 'buyer', 'wholesaler', 'agent', 'broker', 'other'
  propertyId: 123,
  additionalIdentifiers: {
    dateOfBirth: '1980-01-15',
    address: '123 Main St, Dallas, TX',
    country: 'US'
  }
});

console.log(result.screened);      // true if screening completed
console.log(result.matchFound);    // true if sanctions match detected
console.log(result.matchType);     // 'exact', 'fuzzy', 'alias', 'partial'
console.log(result.matchScore);    // 0-100 confidence score
console.log(result.matchedEntity); // Details of matched sanctioned entity
```

**Screen All Parties for a Property:**
```typescript
const result = await sanctionsScreeningService.screenPropertyParties(propertyId);

console.log(result.allClear);       // true if no matches
console.log(result.parties);        // Array of all screened parties
console.log(result.blockedParties); // Parties with blocked status
console.log(result.pendingReview);  // Parties needing manual review
```

**Resolve a Match:**
```typescript
await sanctionsScreeningService.resolveMatch(
  screeningId,
  'user-123',
  'cleared',  // 'cleared', 'blocked', or 'escalated'
  'Verified different person with same name via passport'
);
```

#### Match Types

| Match Type | Score Range | Meaning |
|------------|-------------|---------|
| `exact` | 99-100 | Name matches exactly |
| `alias` | 90-98 | Matches a known alias |
| `partial` | 85-89 | Partial name match |
| `fuzzy` | <85 | Fuzzy/phonetic match |

#### Lists Checked

- SDN (Specially Designated Nationals)
- Consolidated Sanctions List
- EU Sanctions
- UN Sanctions
- OFSI (UK Office of Financial Sanctions)

---

### 2.4 Property Verification Service

**File Location:** `backend/src/services/PropertyVerificationService.ts`

**What It Does:**
Verifies property details against authoritative external data sources to confirm ownership, property characteristics, tax status, and valuation.

**Key Features:**
- ATTOM Data API integration (primary)
- CoreLogic API integration (fallback)
- Ownership verification with fuzzy name matching
- Property details validation (beds, baths, sqft)
- Tax status and delinquency detection
- AVM (Automated Valuation Model) integration
- Transaction history retrieval
- 24-hour caching
- Fail-safe mode

#### How to Use

**Verify a Property:**
```typescript
import { propertyVerificationService } from './services/PropertyVerificationService';

const result = await propertyVerificationService.verifyProperty({
  propertyAddress: '123 Main St',
  city: 'Dallas',
  state: 'TX',
  zip: '75001',
  expectedOwnerName: 'John Smith',
  expectedBedrooms: 3,
  expectedBathrooms: 2,
  expectedSqft: 1850,
  apn: '123-456-789'  // Optional: Assessor's Parcel Number
});

console.log(result.verified);             // true if no critical flags
console.log(result.confidence);           // 0-1 confidence score
console.log(result.ownershipVerification); // Owner details and match score
console.log(result.propertyDetails);      // Beds, baths, sqft, etc.
console.log(result.taxInfo);              // Tax status and amounts
console.log(result.valuationInfo);        // AVM valuation
console.log(result.transactionHistory);   // Past sales and transfers
console.log(result.flags);                // Verification warnings/errors
```

**Batch Verify Multiple Properties:**
```typescript
const results = await propertyVerificationService.batchVerify([
  { propertyAddress: '123 Main St', city: 'Dallas', state: 'TX', zip: '75001' },
  { propertyAddress: '456 Oak Ave', city: 'Houston', state: 'TX', zip: '77001' },
]);
// Returns Map<string, PropertyVerificationResult>
```

#### Verification Flags

| Code | Severity | Meaning |
|------|----------|---------|
| `PROPERTY_NOT_FOUND` | critical | Property not in database |
| `OWNER_MISMATCH` | critical | Seller doesn't match recorded owner |
| `TAX_DELINQUENT` | critical | Property has unpaid taxes |
| `VERIFICATION_API_FAILED` | critical | External API unavailable |
| `DEAL_BLOCKED` | critical | Deal blocked pending manual verification |
| `BEDROOM_MISMATCH` | warning | Bedroom count differs |
| `BATHROOM_MISMATCH` | warning | Bathroom count differs |
| `SQFT_MISMATCH` | warning/info | Square footage differs (>10% = warning) |
| `MOCK_DATA` | info | Using mock data (development mode) |

#### Data Returned

**Ownership Verification:**
```typescript
{
  currentOwner: string,
  ownershipType: 'individual' | 'joint' | 'trust' | 'llc' | 'corporation' | 'estate',
  vestingInfo: string,
  matchesExpected: boolean,
  matchScore: number,  // 0-1 fuzzy match score
  lastTransferDate: Date,
  lastTransferAmount: number,
  ownerMailingAddress: string
}
```

**Tax Info:**
```typescript
{
  taxYear: number,
  assessedValue: number,
  marketValue: number,
  taxAmount: number,
  taxStatus: 'current' | 'delinquent' | 'exempt' | 'unknown',
  delinquentAmount: number,
  lastPaymentDate: Date,
  exemptions: string[]
}
```

---

### 2.5 Title Verification Service

**File Location:** `backend/src/services/TitleVerificationService.ts`

**What It Does:**
Verifies title status, detects liens and encumbrances, and provides title insurance quotes through integration with title companies.

**Key Features:**
- First American VeriTitle integration (primary)
- Qualia API integration (fallback)
- Lien detection with payoff information
- Encumbrance identification
- Title exception reporting
- Insurance quote generation

#### How to Use

**Verify Title:**
```typescript
import { titleVerificationService } from './services/TitleVerificationService';

const result = await titleVerificationService.verifyTitle({
  propertyAddress: '123 Main St',
  city: 'Dallas',
  state: 'TX',
  zip: '75001',
  apn: '123-456-789',
  orderType: 'preliminary'  // 'ownership_only', 'preliminary', 'full_commitment'
});

console.log(result.verified);        // true if title is clear
console.log(result.liens);           // Array of detected liens
console.log(result.encumbrances);    // Easements, restrictions, etc.
console.log(result.exceptions);      // Title exceptions
console.log(result.insuranceQuotes); // Owner/lender policy quotes
```

#### Lien Types Detected

| Lien Type | Description |
|-----------|-------------|
| `mortgage` | Outstanding mortgage |
| `tax` | Property tax lien |
| `judgment` | Court judgment lien |
| `lis_pendens` | Pending litigation |
| `mechanics` | Contractor/mechanic's lien |
| `hoa` | HOA assessment lien |

---

### 2.6 SOC 2 Audit Logger

**File Location:** `backend/src/services/SOC2AuditLogger.ts`

**What It Does:**
Provides immutable, tamper-proof audit logging for SOC 2 Type II compliance. Every compliance decision, access event, and modification is recorded with cryptographic chaining.

**Key Features:**
- SHA-256 hash chaining (each entry linked to previous)
- HMAC signing when key configured
- Tamper detection via chain verification
- 7-year retention (configurable)
- Batched writes with immediate flush for critical events
- Export capabilities for auditors (JSON/CSV)
- Queryable by date, event type, actor, outcome

#### How to Use

**Log a Compliance Event:**
```typescript
import { soc2AuditLogger } from './services/SOC2AuditLogger';

// General log entry
soc2AuditLogger.log({
  eventType: 'compliance.check.completed',
  eventCategory: 'verification',  // 'access', 'modification', 'verification', 'decision', 'system', 'security'
  severity: 'info',               // 'debug', 'info', 'warning', 'error', 'critical'
  actor: {
    type: 'user',  // 'user', 'system', 'api', 'automation', 'external'
    id: 'user-123',
    name: 'John Doe',
    ip: '192.168.1.1'
  },
  resource: {
    type: 'property',
    id: '456',
    name: '123 Main St'
  },
  action: 'compliance_check',
  outcome: 'success',  // 'success', 'failure', 'partial', 'pending'
  details: {
    status: 'Green',
    ruleCount: 15
  },
  complianceContext: {
    propertyId: 456,
    checkId: 789,
    state: 'TX'
  }
});
```

**Convenience Methods:**
```typescript
// Log access event
soc2AuditLogger.logAccess(
  { type: 'property', id: '123' },
  { type: 'user', id: 'user-123' },
  'view_property',
  'success'
);

// Log modification
soc2AuditLogger.logModification(
  { type: 'rule', id: '456' },
  { type: 'user', id: 'admin-1' },
  'update_rule',
  'success',
  { before: { enabled: false }, after: { enabled: true } }
);

// Log verification
soc2AuditLogger.logVerification(
  { type: 'property', id: '123' },
  { type: 'system', name: 'ComplianceService' },
  'sanctions_screening',
  'success',
  { propertyId: 123, state: 'TX' }
);

// Log security event
soc2AuditLogger.logSecurityEvent(
  'login_failed',
  { type: 'user', id: 'user-123', ip: '192.168.1.1' },
  'authentication',
  'failure',
  { reason: 'invalid_password' }
);
```

**Query Audit Logs:**
```typescript
const result = await soc2AuditLogger.query({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  eventCategories: ['verification', 'decision'],
  severities: ['warning', 'error', 'critical'],
  actorId: 'user-123',
  resourceTypes: ['property'],
  outcomes: ['failure'],
  limit: 100,
  offset: 0
});

console.log(result.logs);    // Array of log entries
console.log(result.total);   // Total matching count
console.log(result.hasMore); // Pagination indicator
```

**Verify Chain Integrity:**
```typescript
const verification = await soc2AuditLogger.verifyChain();
// Optional: verify from specific sequence number
const verification = await soc2AuditLogger.verifyChain(1000);

console.log(verification.valid);          // true if chain intact
console.log(verification.entriesChecked); // Number verified
console.log(verification.errors);         // Any errors found
```

**Export for External Audit:**
```typescript
const exportData = await soc2AuditLogger.exportForAudit(
  new Date('2024-01-01'),
  new Date('2024-12-31'),
  {
    eventTypes: ['compliance.check.completed'],
    resourceTypes: ['property'],
    includeDetails: true,
    format: 'json'  // or 'csv'
  }
);

console.log(exportData.exportId);   // Unique export identifier
console.log(exportData.count);      // Number of entries
console.log(exportData.chainValid); // Chain integrity status
console.log(exportData.data);       // The exported data
```

#### Hash Chain Structure

Each audit log entry contains:
```
┌─────────────────────────────────────────────────────┐
│ Entry #1001                                          │
├─────────────────────────────────────────────────────┤
│ sequenceNumber: 1001                                 │
│ previousHash: "abc123..." (hash of entry #1000)     │
│ currentHash: "def456..." (hash of this entry)       │
│ signature: "ghi789..." (HMAC if key configured)     │
│ timestamp: 2024-01-15T10:30:00Z                     │
│ eventType: "compliance.check.completed"             │
│ ... other fields ...                                 │
└─────────────────────────────────────────────────────┘
                         │
                         ▼ previousHash points to
┌─────────────────────────────────────────────────────┐
│ Entry #1002                                          │
│ previousHash: "def456..." (hash of entry #1001)     │
│ ...                                                  │
└─────────────────────────────────────────────────────┘
```

---

### 2.7 Compliance Event Stream

**File Location:** `backend/src/services/ComplianceEventStream.ts`

**What It Does:**
Provides real-time event publishing for compliance events with webhook subscription support. Enables external systems to react to compliance decisions.

**Key Features:**
- In-memory event tracking
- Persistent database storage
- Webhook subscriptions with HMAC signing
- Event replay capability
- Event history tracking

#### How to Use

**Publish an Event:**
```typescript
import { complianceEventStream } from './services/ComplianceEventStream';

complianceEventStream.publish(
  'compliance.check.passed',  // Event type
  'property',                 // Resource type
  '123',                      // Resource ID
  {                           // Payload
    status: 'Green',
    state: 'TX',
    passedRules: 15
  },
  {                           // Options
    source: 'system',
    userId: 'user-123',
    metadata: { severity: 'info' }
  }
);
```

#### Event Types

| Event Type | When Triggered |
|------------|----------------|
| `compliance.check.passed` | Property passes all rules (Green) |
| `compliance.check.warning` | Property has warnings (Yellow) |
| `compliance.check.failed` | Property fails compliance (Red) |
| `compliance.sanctions.match_found` | Sanctions match detected |
| `compliance.sanctions.cleared` | Sanctions match cleared |
| `compliance.sanctions.api_failure` | Sanctions API failure |
| `compliance.fraud.high_risk_detected` | High-risk fraud detected |
| `compliance.verification.api_failure` | Property verification API failure |
| `compliance.escalation.triggered` | Escalation policy triggered |

---

### 2.8 Compliance OCR Service

**File Location:** `backend/src/services/ComplianceOCRService.ts`

**What It Does:**
Extracts structured data from documents (contracts, IDs, title documents) using OCR technology for automated compliance verification.

**Key Features:**
- Contract field extraction
- Seller ID verification
- Title document parsing
- Full compliance pipeline verification
- Audit hash generation

#### How to Use

**Extract Contract Fields:**
```typescript
import { complianceOCRService } from './services/ComplianceOCRService';

const result = await complianceOCRService.extractContractFields(documentBuffer);
// Returns: { parties, addresses, dates, prices, terms }
```

**Verify Seller ID:**
```typescript
const result = await complianceOCRService.verifySellerID(idDocumentBuffer, expectedSellerName);
// Returns: { matched: boolean, extractedName: string, confidence: number }
```

**Full Document Pipeline:**
```typescript
const result = await complianceOCRService.runFullVerification({
  contractDocument: contractBuffer,
  sellerIdDocument: idBuffer,
  titleDocument: titleBuffer,
  expectedSellerName: 'John Smith'
});
```

---

### 2.9 Compliance Watchdog Scheduler

**File Location:** `backend/src/services/ComplianceWatchdogScheduler.ts`

**What It Does:**
Proactively monitors for compliance issues on a scheduled basis, detecting problems before they become critical.

**Key Features:**
- Scheduled compliance checks
- Contract expiration monitoring
- License expiration alerts
- E&O insurance monitoring
- Stale deal detection
- Document expiration tracking
- MLS listing verification
- Alert management with acknowledgment workflow

#### Check Types

| Check Type | What It Monitors |
|------------|------------------|
| `contracts` | Contract expiration dates |
| `licenses` | Broker/agent license expirations |
| `eo_insurance` | E&O insurance policy expirations |
| `stale_deals` | Deals with no activity for N days |
| `documents` | Required document expirations |
| `compliance` | Properties needing re-check |
| `mls` | MLS listing status changes |

#### How to Use

**Check Status:**
```typescript
GET /api/compliance/watchdog/status
// Returns: { running: boolean, lastRun: Date, nextRun: Date }
```

**Run Specific Check:**
```typescript
POST /api/compliance/watchdog/run/contracts
POST /api/compliance/watchdog/run/licenses
POST /api/compliance/watchdog/run/stale_deals
```

**Get Active Alerts:**
```typescript
GET /api/compliance/watchdog/alerts
// Returns array of active compliance alerts
```

**Acknowledge Alert:**
```typescript
POST /api/compliance/watchdog/alerts/:alertId/acknowledge
```

---

### 2.10 Escalation Service

**File Location:** `backend/src/services/EscalationService.ts`

**What It Does:**
Manages configurable escalation policies that trigger actions when compliance conditions are met.

**Key Features:**
- Configurable trigger conditions
- Multiple action types
- Cooldown periods
- Rate limiting
- Execution history

#### How to Use

**Create Escalation Policy:**
```typescript
POST /api/compliance/escalation/policies
{
  "name": "High Risk Deal Alert",
  "triggerConditions": {
    "eventType": "compliance.fraud.high_risk_detected",
    "riskScoreMin": 80
  },
  "actions": [
    { "type": "email", "recipients": ["compliance@company.com"] },
    { "type": "webhook", "url": "https://slack.webhook.url" }
  ],
  "cooldownMinutes": 15,
  "maxAlertsPerHour": 10
}
```

---

## 3. Database Models

### Core Compliance Models

| Model | Table Name | Purpose |
|-------|------------|---------|
| `StateComplianceRule` | `state_compliance_rules` | Configurable compliance rules |
| `ComplianceCheck` | `compliance_checks` | Audit trail of compliance evaluations |
| `ComplianceAlert` | `compliance_alerts` | Active compliance alerts |
| `ComplianceEvent` | `compliance_events` | Persistent event log |
| `ComplianceAuditLog` | `compliance_audit_logs` | SOC 2 immutable audit chain |
| `ComplianceRuleVersion` | `compliance_rule_versions` | Rule change history |

### Fraud Detection Models

| Model | Table Name | Purpose |
|-------|------------|---------|
| `FraudSignal` | `fraud_signals` | Fraud indicators and signals |

### Sanctions Models

| Model | Table Name | Purpose |
|-------|------------|---------|
| `SanctionsScreening` | `sanctions_screenings` | Sanctions check results |

### Document Models

| Model | Table Name | Purpose |
|-------|------------|---------|
| `StateDocumentTemplate` | `state_document_templates` | Required documents by state |
| `StateKnowledge` | `state_knowledge` | State-specific knowledge base |

### Escalation Models

| Model | Table Name | Purpose |
|-------|------------|---------|
| `EscalationPolicy` | `escalation_policies` | Escalation rules |
| `ComplianceWebhook` | `compliance_webhooks` | Webhook subscriptions |

### Automation Models

| Model | Table Name | Purpose |
|-------|------------|---------|
| `DeadLetterQueue` | `dead_letter_queue` | Failed automation actions |

---

### StateComplianceRule Schema

```typescript
{
  id: number,
  state: string,           // 'TX', 'CA', 'ALL', etc.
  category: string,        // 'licensing', 'documentation', 'transaction', etc.
  name: string,            // Human-readable rule name
  field: string,           // Property field to evaluate (supports dot notation)
  operator: ComplianceOperator,  // 'required', 'equals', 'min_value', etc.
  value: string,           // Configuration value for operator
  severity: 'critical' | 'warning',
  message: string,         // Error message when rule fails
  enabled: boolean,        // Toggle rule on/off
  order: number,           // Execution sequence
  createdAt: Date,
  updatedAt: Date
}
```

### ComplianceCheck Schema

```typescript
{
  id: number,
  propertyId: number,
  status: 'Green' | 'Yellow' | 'Red',
  state: string,
  totalRules: number,
  passedRules: number,
  failedRules: number,
  issues: ComplianceIssue[],      // Array of failed checks
  passedChecks: string[],          // Names of passed rules
  checkedAt: Date,
  ruleSnapshot: RuleSnapshot[],    // Exact rules evaluated
  ruleVersionHash: string,         // SHA-256 of rule snapshot
  rulesEvaluated: number
}
```

### FraudSignal Schema

```typescript
{
  id: number,
  signalType: 'velocity' | 'pattern' | 'identity' | 'behavioral' | 'network',
  entityType: 'seller' | 'phone' | 'email' | 'address' | 'ip' | 'wholesaler',
  entityValue: string,             // The actual value (for lookup)
  entityValueHash: string,         // SHA-256 hash (for privacy)
  severity: 'low' | 'medium' | 'high' | 'critical',
  occurrenceCount: number,
  firstSeenAt: Date,
  lastSeenAt: Date,
  riskScore: number,               // 0-100
  status: 'active' | 'cleared' | 'confirmed_fraud' | 'under_review',
  propertyId: number,
  details: object,
  relatedSignals: number[],        // IDs of connected signals
  resolvedBy: string,
  resolvedAt: Date,
  resolutionNotes: string
}
```

---

## 4. API Endpoints

### Compliance Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/compliance/rules` | List all rules (with filters) |
| GET | `/api/compliance/rules/:id` | Get single rule |
| POST | `/api/compliance/rules` | Create new rule |
| PUT | `/api/compliance/rules/:id` | Update rule |
| DELETE | `/api/compliance/rules/:id` | Delete rule |
| POST | `/api/compliance/rules/ai-generate` | AI-powered rule generation |
| POST | `/api/compliance/rules/:id/test` | Test rule against property |
| GET | `/api/compliance/rules/:id/history` | Rule version history |

### Compliance Checks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compliance/check/:propertyId` | Check single property |
| POST | `/api/compliance/check/bulk` | Batch check (max 50) |
| GET | `/api/compliance/check/:propertyId/history` | Check history for property |

**Rate Limit:** 30 checks/minute per IP

### Fraud Detection

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compliance/fraud/check` | Run fraud check on deal |
| GET | `/api/compliance/fraud/signals` | List fraud signals |
| GET | `/api/compliance/fraud/property/:propertyId` | Signals for property |
| POST | `/api/compliance/fraud/signals/:signalId/resolve` | Resolve signal |
| POST | `/api/compliance/fraud/confirm` | Confirm entity as fraud |

### Sanctions Screening

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compliance/sanctions/screen` | Screen single entity |
| POST | `/api/compliance/sanctions/property/:propertyId` | Screen all property parties |
| GET | `/api/compliance/sanctions/pending` | Pending matches |
| POST | `/api/compliance/sanctions/:screeningId/resolve` | Resolve match |

### Property Verification

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compliance/property-verification/verify` | Verify property |
| POST | `/api/compliance/property-verification/batch` | Batch verify (max 25) |

### Title Verification

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compliance/title-verification/verify` | Full title verification |
| POST | `/api/compliance/title-verification/payoff-request` | Request payoff letters |

### SOC 2 Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/compliance/audit/logs` | Query audit logs |
| GET | `/api/compliance/audit/verify-chain` | Verify chain integrity |
| POST | `/api/compliance/audit/export` | Export for auditors |
| GET | `/api/compliance/audit/stats` | Audit statistics |

### Watchdog

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/compliance/watchdog/status` | Scheduler status |
| GET | `/api/compliance/watchdog/config` | Current configuration |
| POST | `/api/compliance/watchdog/run` | Manual trigger (all checks) |
| POST | `/api/compliance/watchdog/run/:checkType` | Run specific check |
| GET | `/api/compliance/watchdog/alerts` | Active alerts |
| POST | `/api/compliance/watchdog/alerts/:alertId/acknowledge` | Acknowledge alert |
| POST | `/api/compliance/watchdog/alerts/:alertId/resolve` | Resolve alert |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/compliance/webhooks` | List subscriptions |
| POST | `/api/compliance/webhooks` | Create subscription |
| PUT | `/api/compliance/webhooks/:id` | Update subscription |
| DELETE | `/api/compliance/webhooks/:id` | Delete subscription |
| POST | `/api/compliance/webhooks/:id/regenerate-secret` | Regenerate HMAC secret |
| POST | `/api/compliance/webhooks/:id/test` | Send test event |
| GET | `/api/compliance/webhooks/:id/logs` | Delivery logs |

### Dead Letter Queue

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dead-letters` | List dead letters |
| GET | `/api/dead-letters/stats` | Queue statistics |
| GET | `/api/dead-letters/:id` | Get single entry |
| POST | `/api/dead-letters/:id/retry` | Manual retry |
| PATCH | `/api/dead-letters/:id/resolve` | Mark resolved |
| PATCH | `/api/dead-letters/:id/abandon` | Mark abandoned |
| DELETE | `/api/dead-letters/:id` | Delete entry |
| POST | `/api/dead-letters/bulk-retry` | Retry multiple |
| POST | `/api/dead-letters/bulk-resolve` | Resolve multiple |
| POST | `/api/dead-letters/cleanup` | Cleanup old entries |

---

## 5. Configuration Reference

### Environment Variables

#### Fraud Detection

| Variable | Default | Description |
|----------|---------|-------------|
| `FRAUD_DETECTION_ENABLED` | `true` | Enable/disable fraud detection |
| `FRAUD_BLOCK_HIGH_RISK` | `true` | Auto-block high-risk deals |
| `FRAUD_BLOCK_THRESHOLD` | `80` | Risk score threshold for blocking (0-100) |
| `FRAUD_VELOCITY_MULTIPLIER` | `1.0` | Adjust velocity thresholds (2.0 = 2x tolerant) |

#### Sanctions Screening

| Variable | Default | Description |
|----------|---------|-------------|
| `OFAC_API_KEY` | - | OFAC API key (required for screening) |
| `OFAC_API_URL` | `https://api.ofac-api.com/v4` | OFAC API endpoint |
| `SANCTIONS_FAIL_SAFE_MODE` | `true` | Block deals when API unavailable |
| `SANCTIONS_CACHE_ENABLED` | `true` | Enable result caching |
| `SANCTIONS_CACHE_TTL_HOURS` | `24` | Cache expiration |
| `SANCTIONS_MAX_RETRIES` | `3` | API retry attempts |
| `SANCTIONS_RETRY_DELAY_MS` | `1000` | Initial retry delay |

#### Property Verification

| Variable | Default | Description |
|----------|---------|-------------|
| `ATTOM_API_KEY` | - | ATTOM Data API key |
| `CORELOGIC_API_KEY` | - | CoreLogic API key (fallback) |
| `PROPERTY_VERIFICATION_FAIL_SAFE` | `true` | Block when APIs unavailable |
| `PROPERTY_VERIFICATION_MAX_RETRIES` | `3` | API retry attempts |
| `PROPERTY_VERIFICATION_RETRY_DELAY_MS` | `1000` | Initial retry delay |

#### Title Verification

| Variable | Default | Description |
|----------|---------|-------------|
| `FIRST_AMERICAN_API_KEY` | - | First American VeriTitle API key |
| `QUALIA_API_KEY` | - | Qualia API key (fallback) |

#### SOC 2 Audit

| Variable | Default | Description |
|----------|---------|-------------|
| `AUDIT_SIGNING_KEY` | - | HMAC key for signing entries |
| `AUDIT_RETENTION_YEARS` | `7` | Log retention period |

---

## 6. Dead Letter Queue

### What Is It?

The Dead Letter Queue (DLQ) captures failed automation actions that have exhausted all retry attempts. It provides:
- **Visibility** into failures
- **Manual recovery** options
- **Audit trail** of failed actions

### Lifecycle

```
Action Fails → Retry 1 → Retry 2 → Retry 3 → DEAD LETTER QUEUE
                                                     │
                                    ┌────────────────┼────────────────┐
                                    ▼                ▼                ▼
                              Manual Retry      Resolved         Abandoned
                                    │                │                │
                                    ▼                ▼                ▼
                              Success/Fail     Marked Done     Given Up
```

### Statuses

| Status | Meaning | Next Actions |
|--------|---------|--------------|
| `pending_review` | Awaiting human intervention | Retry, Resolve, Abandon |
| `retrying` | Manual retry in progress | Wait for result |
| `resolved` | Successfully handled | Cleanup eligible |
| `abandoned` | Permanently given up | Cleanup eligible |

### Data Captured

```typescript
{
  id: string,
  automationId: string,      // Which automation failed
  automationName: string,    // Human-readable name
  actionId: string,          // Specific action that failed
  actionType: string,        // 'send_email', 'webhook', etc.
  actionConfig: object,      // Full config for replay
  context: object,           // Sanitized execution context
  error: string,             // Last error message
  attempts: number,          // Total retry count
  firstFailedAt: Date,
  lastFailedAt: Date,
  status: DeadLetterStatus,
  resolvedBy: string,
  resolvedAt: Date,
  resolutionNotes: string
}
```

---

## 7. Integration Flow

### Complete Deal Compliance Flow

```
1. DEAL SUBMITTED
   │
   ├─→ Fraud Detection (FraudDetectionService)
   │   ├─ Velocity checks
   │   ├─ Pattern detection
   │   ├─ Network analysis
   │   └─ Risk scoring
   │
   ├─→ Sanctions Screening (SanctionsScreeningService)
   │   ├─ Screen seller
   │   ├─ Screen wholesaler
   │   ├─ Screen all contacts
   │   └─ Check OFAC/SDN lists
   │
   ├─→ Property Verification (PropertyVerificationService)
   │   ├─ Verify ownership
   │   ├─ Validate characteristics
   │   ├─ Check tax status
   │   └─ Get AVM valuation
   │
   ├─→ Title Verification (TitleVerificationService)
   │   ├─ Check for liens
   │   ├─ Identify encumbrances
   │   └─ Get insurance quotes
   │
   └─→ State Compliance Rules (ComplianceService)
       ├─ Evaluate all applicable rules
       ├─ Check contact assignments
       └─ Calculate final status

2. RESULT DETERMINATION
   │
   ├─ GREEN: Auto-queue for broker approval
   ├─ YELLOW: Flag for review
   └─ RED: BLOCK deal

3. AUDIT & EVENTS
   │
   ├─→ SOC 2 Audit Logger (immutable record)
   ├─→ Compliance Event Stream (webhooks)
   └─→ Escalation Service (if triggered)

4. ONGOING MONITORING
   │
   └─→ Watchdog Scheduler
       ├─ Contract expirations
       ├─ License renewals
       └─ Stale deal detection
```

---

## 8. Best Practices

### Rule Configuration

1. **Start with universal rules** (`state: 'ALL'`) for common requirements
2. **Layer state-specific rules** for state variations
3. **Use `warning` severity** for issues that need attention but shouldn't block
4. **Use `critical` severity** only for deal-breaking violations
5. **Test rules** before enabling in production

### Fraud Detection

1. **Monitor velocity thresholds** - adjust `FRAUD_VELOCITY_MULTIPLIER` if too strict
2. **Review pending signals regularly** - don't let the queue grow
3. **Confirm fraud promptly** - improves network analysis accuracy
4. **Clear false positives** - prevents repeat flags

### Sanctions Screening

1. **Always use fail-safe mode in production** - never skip screening
2. **Review all matches** - even fuzzy matches need investigation
3. **Document resolutions** - notes are required for audit
4. **Monitor API failures** - alerts indicate configuration issues

### Audit Logging

1. **Never disable audit logging** - required for SOC 2 compliance
2. **Configure signing key** - enables tamper detection
3. **Regular chain verification** - detect issues early
4. **Export before retention expiry** - preserve critical records

### Dead Letter Queue

1. **Review daily** - don't let failures accumulate
2. **Investigate root causes** - fix systemic issues
3. **Use bulk operations** - efficient for large queues
4. **Clean up resolved entries** - maintain performance

---

## Appendix A: Error Codes

### Compliance Check Errors

| Code | Meaning |
|------|---------|
| `RULE_EVALUATION_FAILED` | Error evaluating rule |
| `PROPERTY_NOT_FOUND` | Property ID doesn't exist |
| `NO_RULES_CONFIGURED` | No rules for state |

### Fraud Detection Errors

| Code | Meaning |
|------|---------|
| `VELOCITY_EXCEEDED` | Too many submissions |
| `PATTERN_DETECTED` | Fraud pattern matched |
| `NETWORK_CONNECTION` | Connected to confirmed fraud |
| `CONFIRMED_FRAUD` | Entity previously confirmed |

### Verification Errors

| Code | Meaning |
|------|---------|
| `API_UNAVAILABLE` | External API not responding |
| `PROPERTY_NOT_FOUND` | Property not in database |
| `OWNER_MISMATCH` | Seller doesn't match owner |
| `TAX_DELINQUENT` | Unpaid property taxes |
| `VERIFICATION_FAILED` | General verification failure |

### Sanctions Errors

| Code | Meaning |
|------|---------|
| `SANCTIONS_MATCH` | Entity on sanctions list |
| `SCREENING_BLOCKED` | API unavailable, deal blocked |
| `API_FAILURE` | OFAC API error |

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **AVM** | Automated Valuation Model - algorithmic property value estimate |
| **DLQ** | Dead Letter Queue - storage for failed automation actions |
| **Fail-Safe Mode** | Safety feature that blocks deals when verification unavailable |
| **Hash Chain** | Cryptographic linking of records for tamper detection |
| **OFAC** | Office of Foreign Assets Control - US sanctions authority |
| **PII** | Personally Identifiable Information |
| **Rule Snapshot** | Point-in-time copy of rules used during a compliance check |
| **SDN** | Specially Designated Nationals - OFAC sanctions list |
| **SOC 2** | Service Organization Control 2 - security compliance standard |
| **Velocity Check** | Rate limiting based on submission frequency |

---

*Last Updated: January 2026*
*Version: 1.0*
