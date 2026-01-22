# Broker-Mediated Compliance Flow - Implementation Documentation

**Version:** 1.0
**Date:** 2025-01-15
**Status:** Backend Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Account Types](#account-types)
3. [Database Models](#database-models)
4. [Services](#services)
5. [API Endpoints](#api-endpoints)
6. [Middleware](#middleware)
7. [Workflow Automation](#workflow-automation)
8. [Database Schema](#database-schema)
9. [File Structure](#file-structure)
10. [Integration Points](#integration-points)
11. [Pending Implementation](#pending-implementation)

---

## Overview

The broker-mediated compliance system ensures all deal communications flow through licensed brokers with full audit trails, fee tracking, and MSA generation. This is a **regulatory compliance system** that positions DispoTree as neutral infrastructure rather than a facilitator of wholesaling.

### Core Principles

- **Brokers observe, don't represent** - passive visibility, no negotiation authority
- **MSAs exist on every deal, every state** - regardless of statutory requirement
- **State jurisdiction controls visibility** - brokers see only states they service
- **Funds live in admin space only** - no direct login for institutional buyers
- **AI supports compliance — humans retain control** - AI flags, suggests, never decides

---

## Account Types

### Role Enumeration

```typescript
type UserRole =
  | 'buyer'                  // Individual investor
  | 'investor'               // Reserved
  | 'wholesaler'             // Deal submitter
  | 'agent'                 // External agent (no MSA signing)
  | 'broker'                // State-scoped oversight
  | 'broker_assistant'       // Broker support role
  | 'transaction_coordinator' // Post-acceptance role
  | 'admin'                 // Standard admin
  | 'super_admin';          // System-level authority
```

### Account Type Matrix

| # | Account Type | Role Value | Submit Deals | Sign MSA | See Offers | Accept Offers | State-Scoped |
|---|--------------|------------|--------------|----------|------------|---------------|--------------|
| 1 | Wholesaler | `wholesaler` | ✅ | ✅ | ✅ (all) | ✅ | ❌ |
| 2 | Real Estate Agent | `agent` | ✅ | ❌ | ✅ (all) | ✅ | ❌ |
| 3 | Investor Buyer | `buyer` | ❌ | ❌ | ✅ (competing) | ❌ | ❌ |
| 4 | Broker | `broker` | ❌ | ✅ | ✅ (all) | ❌ | ✅ |
| 5 | Broker Assistant | `broker_assistant` | ❌ | ❌ | ✅ (assigned) | ❌ | ✅ |
| 6 | Transaction Coordinator | `transaction_coordinator` | ❌ | ❌ | ✅ (accepted) | ❌ | ✅ |
| 7A | Standard Admin | `admin` | ✅ | ❌ | ✅ (all) | ✅ | ❌ |
| 7B | Super Admin | `super_admin` | ✅ | ❌ | ✅ (all) | ✅ | ❌ |
| 8 | Fund/Institutional | Fund model (no login) | N/A | N/A | N/A | N/A | N/A |
| 9 | AI Assistant | System-only | N/A | N/A | N/A | N/A | N/A |

### Key Access Rules

**Wholesalers & Agents:**
- Can see all offers on their deals (including competing offers)
- Can accept, reject, and cancel deals
- Can communicate with buyers, broker, and TC
- Cannot bypass broker visibility
- Cannot modify pricing/terms after offer acceptance

**Buyers:**
- Can see competing offers on deals
- Can submit offers and counter-offers
- Cannot accept offers (wholesaler only)
- Cannot edit deal data

**Brokers:**
- See deals in states they service (state-scoped)
- See all communications on assigned deals
- Can add notes, upload disclosures
- Cannot accept/reject offers
- Cannot negotiate without wholesaler feedback/action
- Cannot block deal progression

**Broker Assistants:**
- See broker-assigned deals only
- Can assist with documents, post internal notes
- Cannot change deal status, accept offers, or modify terms

**Transaction Coordinators:**
- Activated only after offer acceptance
- See accepted deals only
- Update escrow sub-statuses, coordinate closing
- Cannot accept offers, cancel deals, or change pricing

---

## Database Models

### BrokerProfile

**File:** `src/models/BrokerProfile.ts`

Stores broker licensing information, approval status, and profile data.

```typescript
interface BrokerProfileAttributes {
  id: string;                    // UUID
  userId: string;                // FK to MarketplaceUser
  licenseNumber: string;
  licenseState: string;          // 2-char state code
  licenseExpirationDate: Date;
  brokerageCompany: string;
  brokerageAddress?: string;
  brokeragePhone?: string;
  brokerageEmail?: string;
  eoInsurancePolicy?: string;
  eoExpirationDate?: Date;
  status: BrokerStatus;          // 'pending' | 'approved' | 'suspended' | 'rejected'
  approvedAt?: Date;
  approvedBy?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  suspendedAt?: Date;
  suspendedBy?: string;
  suspensionReason?: string;
  notes?: string;
  totalDealsSupervised: number;
  activeDeals: number;
  metadata?: Record<string, any>;
}

// Instance Methods
isActive(): boolean                    // Check if broker is active
isLicenseExpiringSoon(): boolean        // Expiring within 30 days
daysUntilLicenseExpiration(): number    // Days until expiration
```

### BrokerAssistant

**File:** `src/models/BrokerAssistant.ts`

Support role under a broker with scoped permissions.

```typescript
type AssistantPermission =
  | 'view_deals'
  | 'view_communications'
  | 'manage_documents'
  | 'post_notes'
  | 'support_compliance';

interface BrokerAssistantAttributes {
  id: string;
  userId: string;                // FK to MarketplaceUser
  brokerId: string;              // FK to BrokerProfile
  permissions: AssistantPermission[];
  assignedBy: string;            // User ID who assigned
  active: boolean;
  notes?: string;
  metadata?: Record<string, any>;
}

// Instance Methods
hasPermission(permission: AssistantPermission): boolean
canPerformAction(action: 'view' | 'edit' | 'create' | 'delete', resource: string): boolean

// Static Methods
getBrokerAssistants(brokerId: string): Promise<BrokerAssistant[]>
assignAssistant(data: AssignData): Promise<BrokerAssistant>
getDefaultPermissions(): AssistantPermission[]
```

### TransactionCoordinator

**File:** `src/models/TransactionCoordinator.ts`

Post-acceptance execution role.

```typescript
type TCStatus = 'active' | 'inactive' | 'suspended';

interface TransactionCoordinatorAttributes {
  id: string;
  userId: string;                // FK to MarketplaceUser
  licenseNumber?: string;
  licenseStates: string[];       // States they can operate in
  status: TCStatus;
  company?: string;
  phone?: string;
  email?: string;
  activeDeals: number;
  totalDealsCoordinated: number;
  notes?: string;
  metadata?: Record<string, any>;
}

// Instance Methods
canOperateIn(state: string): boolean
isActive(): boolean
assignToDeal(dealId: string): Promise<void>
completeDeal(dealId: string): Promise<void>
suspend(reason: string): Promise<void>
reactivate(): Promise<void>

// Static Methods
getAvailableTCs(state: string): Promise<TransactionCoordinator[]>
```

### DealBrokerMSA

**File:** `src/models/DealBrokerMSA.ts`

Tracks the Master Service Agreement between Wholesaler, Broker, and DispoTree.

```typescript
type MSAStatus = 'draft' | 'pending_signatures' | 'active' | 'completed' | 'terminated' | 'expired';

interface FeeStructure {
  brokerFee: number;             // Default: 100
  tcFee: number;                 // Default: 700
  wholesalerAssignmentFee: number; // Default: 0
  currency: string;              // Default: "USD"
}

interface MSAClauses {
  brokerMarketingAuthority: boolean;
  aiAssistantAuthorization: boolean;
  brokerSupervision: boolean;
  feeDisclosure: boolean;
  recordkeeping: boolean;
  communicationRouting: boolean;
  stateSpecificClauses?: string[];
}

interface DealBrokerMSAAttributes {
  id: string;                    // UUID
  propertyId: number;            // FK to Property
  dealId: string;
  wholesalerId: string;          // FK to MarketplaceUser
  brokerId: string;              // FK to BrokerProfile
  status: MSAStatus;
  docuSealSubmissionId?: number;
  docuSealTemplateId?: number;
  msaDocumentUrl?: string;
  clauses: MSAClauses;
  feeStructure: FeeStructure;
  effectiveDate?: Date;
  expirationDate?: Date;
  signedByWholesaler: boolean;
  signedByWholesalerAt?: Date;
  wholesalerSignatureId?: string;
  signedByBroker: boolean;
  signedByBrokerAt?: Date;
  brokerSignatureId?: string;
  signedByDispotree: boolean;
  signedByDispotreeAt?: Date;
  dispotreeSignatureId?: string;
  terminatedAt?: Date;
  terminatedBy?: string;
  terminationReason?: string;
  notes?: string;
}

// Instance Methods
isFullySigned(): boolean              // All 3 parties signed
isActive(): boolean                    // Active and not expired
getTotalFees(): number                 // Sum of all fees
getPendingSignatures(): string[]       // Returns ['wholesaler', 'broker', etc.]
recordSignature(signerType, signatureId?): Promise<void>
terminate(terminatedBy, reason): Promise<void>

// Static Methods
getDefaultFeeStructure(): FeeStructure
getDefaultClauses(): MSAClauses
createBrokerFee(...): Promise<DealFeeTracking>
createTCFee(...): Promise<DealFeeTracking>
createAssignmentFee(...): Promise<DealFeeTracking>
getFeesForDeal(dealId): Promise<DealFeeTracking[]>
getTotalPendingFees(dealId): Promise<number>
```

### DealCommunication

**File:** `src/models/DealCommunication.ts`

Audit trail for all deal communications routed through the broker-mediated system.

```typescript
type PartyType = 'buyer' | 'wholesaler' | 'broker' | 'ai_assistant';
type MessageType = 'inquiry' | 'response' | 'offer' | 'counter_offer' | 'negotiation' | 'system' | 'notification';
type CommunicationStatus = 'pending' | 'processing' | 'sent' | 'delivered' | 'read' | 'blocked' | 'failed';
type CommunicationDirection = 'inbound' | 'outbound';

interface DealCommunicationAttributes {
  id: string;
  dealId: string;
  msaId: string;                 // FK to DealBrokerMSA
  propertyId: number;
  direction: CommunicationDirection;
  fromType: PartyType;
  fromUserId: string;
  fromName?: string;
  fromEmail?: string;
  toType: PartyType;
  toUserId: string;
  toName?: string;
  toEmail?: string;
  messageType: MessageType;
  subject?: string;
  content: string;

  // AI Processing
  aiProcessed: boolean;
  aiProcessedAt?: Date;
  aiResponse?: string;
  aiConfidenceScore?: number;
  aiSuggestedAction?: string;

  // Broker Oversight
  brokerReviewed: boolean;
  brokerReviewedAt?: Date;
  brokerReviewedBy?: string;
  brokerApproved?: boolean;
  brokerNotes?: string;

  // Override handling
  brokerOverridden: boolean;
  brokerOverriddenAt?: Date;
  brokerOverrideReason?: string;
  originalContent?: string;

  // Status tracking
  status: CommunicationStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  blockedAt?: Date;
  blockedBy?: string;
  blockReason?: string;

  // Thread tracking
  threadId?: string;
  parentMessageId?: string;

  channel?: string;
  metadata?: Record<string, any>;
}

// Instance Methods
markReviewed(brokerId, approved, notes?): Promise<void>
override(brokerId, newContent, reason): Promise<void>
block(brokerId, reason): Promise<void>
markSent(): Promise<void>
markDelivered(): Promise<void>
markRead(): Promise<void>
recordAIProcessing(response, confidence?, suggestedAction?): Promise<void>
needsBrokerReview(): boolean
getSummary(): {...}

// Static Methods
getThread(threadId): Promise<DealCommunication[]>
getUnreviewed(brokerId, dealId?): Promise<DealCommunication[]>
```

### DealFeeTracking

**File:** `src/models/DealFeeTracking.ts`

Tracks all fees associated with a deal for closing statement integration.

```typescript
type FeeType = 'broker' | 'tc' | 'wholesaler_assignment';
type RecipientType = 'broker' | 'dispotree' | 'wholesaler';
type FeeStatus = 'pending' | 'due_at_closing' | 'invoiced' | 'collected' | 'waived' | 'refunded';

interface DealFeeTrackingAttributes {
  id: string;
  dealId: string;
  msaId: string;                 // FK to DealBrokerMSA
  propertyId: number;
  feeType: FeeType;
  feeName: string;
  description?: string;
  amount: number;                // DECIMAL(12,2)
  currency: string;
  recipientType: RecipientType;
  recipientId: string;
  recipientName?: string;
  recipientEmail?: string;
  status: FeeStatus;

  // Closing details
  closingDate?: Date;
  closingStatementRef?: string;

  // Collection tracking
  invoicedAt?: Date;
  invoiceNumber?: string;
  collectedAt?: Date;
  collectedAmount?: number;
  collectionMethod?: string;
  collectionReference?: string;

  // Waiver/Refund
  waivedAt?: Date;
  waivedBy?: string;
  waiverReason?: string;
  refundedAt?: Date;
  refundedBy?: string;
  refundAmount?: number;
  refundReason?: string;

  notes?: string;
  metadata?: Record<string, any>;
}

// Instance Methods
markDueAtClosing(closingDate): Promise<void>
markInvoiced(invoiceNumber): Promise<void>
markCollected(amount, method, reference?): Promise<void>
waive(waivedBy, reason): Promise<void>
refund(refundedBy, amount, reason): Promise<void>
isPending(): boolean
getSummary(): {...}

// Static Methods
createBrokerFee(...): Promise<DealFeeTracking>
createTCFee(...): Promise<DealFeeTracking>
createAssignmentFee(...): Promise<DealFeeTracking>
getFeesForDeal(dealId): Promise<DealFeeTracking[]>
getTotalPendingFees(dealId): Promise<number>
getFeesByRecipient(recipientId, status?): Promise<DealFeeTracking[]>
```

### MarketplaceUser (Updated)

**File:** `src/models/MarketplaceUser.ts`

Updated role enumeration:

```typescript
// Before
role: 'buyer' | 'investor' | 'wholesaler' | 'agent' | 'broker' | 'admin'

// After
role: 'buyer' | 'investor' | 'wholesaler' | 'agent' | 'broker' |
      'broker_assistant' | 'transaction_coordinator' | 'admin' | 'super_admin'
```

---

## Services

### BrokerService

**File:** `src/services/BrokerService.ts`

Handles broker application, approval, assignment, and management.

```typescript
// Application Management
applyAsBroker(applicationData: BrokerApplicationData): Promise<BrokerProfile>
getApplication(applicationId: string): Promise<BrokerProfile | null>
getPendingApplications(): Promise<BrokerProfile[]>

// Approval Actions
approveApplication(applicationId: string, adminUserId: string): Promise<BrokerProfile>
rejectApplication(applicationId: string, adminUserId: string, reason: string): Promise<BrokerProfile>
suspendBroker(brokerId: string, adminUserId: string, reason: string): Promise<BrokerProfile>
reinstateBroker(brokerId: string, adminUserId: string): Promise<BrokerProfile>

// Broker Lookup
getBrokerByUserId(userId: string): Promise<BrokerProfile | null>
getBrokersByState(state: string): Promise<BrokerProfile[]>
getAvailableBroker(state: string): Promise<BrokerAssignmentResult>
getAllApprovedBrokers(): Promise<BrokerProfile[]>

// Deal Assignment
assignBrokerToDeal(brokerId: string): Promise<BrokerProfile>
completeDeal(brokerId: string): Promise<BrokerProfile>

// Compliance Monitoring
getBrokersWithExpiringLicenses(): Promise<BrokerProfile[]>
updateLicense(brokerId, string, string, Date): Promise<BrokerProfile>
getBrokerStats(brokerId: string): Promise<BrokerStats>
```

### BrokerMSAService

**File:** `src/services/BrokerMSAService.ts`

Handles MSA generation, DocuSeal signing, and fee tracking.

```typescript
// MSA Generation
generateMSA(options: MSAGenerationOptions): Promise<DealBrokerMSA>
  - Auto-assigns broker by state if not provided
  - Creates fee tracking records
  - Increments broker's active deals

// Signature Management
sendForSignature(request: MSASignatureRequest): Promise<DealBrokerMSA>
  - Builds DocuSeal submitters for all 3 parties
  - Pre-fills property and fee information
  - Returns submission tracking ID

handleSignatureWebhook(submissionId, signerEmail, event): Promise<DealBrokerMSA | null>
  - Processes DocuSeal signature webhooks
  - Records signatures by party
  - Auto-activates MSA when all signed

// MSA Queries
getMSAWithDetails(msaId: string): Promise<MSAWithDetails | null>
getMSAByDealId(dealId: string): Promise<DealBrokerMSA | null>
getSignatureStatus(msaId: string): Promise<SignatureStatusData>
getMSAsForBroker(brokerId, status?): Promise<DealBrokerMSA[]>
getMSAsForWholesaler(wholesalerId, status?): Promise<DealBrokerMSA[]>

// Fee Management
getMSAFees(msaId: string): Promise<DealFeeTracking[]>
updateFeeStatus(feeId, status, details?): Promise<DealFeeTracking>
markFeesDueAtClosing(msaId, closingDate): Promise<DealFeeTracking[]>
getFeesSummaryForClosing(msaId: string): Promise<ClosingFeeSummary>

// Fee Structure Updates
updateFeeStructure(msaId, feeStructure): Promise<DealBrokerMSA>

// MSA Lifecycle
terminateMSA(msaId, terminatedBy, reason): Promise<DealBrokerMSA>
completeMSA(msaId): Promise<DealBrokerMSA>
```

### BrokerCommunicationService

**File:** `src/services/BrokerCommunicationService.ts`

Handles AI-mediated communication routing.

```typescript
// Message Routing
routeMessage(options: SendMessageOptions): Promise<DealCommunication>
  - Validates MSA is active
  - Creates communication record with thread tracking
  - Processes with AI for compliance checking
  - Auto-sends unless blocked

// AI Processing
processWithAI(communication, property?): Promise<AIProcessingResult>
  - Runs compliance checks (PII, circumvention, etc.)
  - Returns confidence score and suggested action
  - Auto-sends or blocks based on rules

generateAIResponse(dealId, inquiryId): Promise<DealCommunication>

// Broker Review Actions
reviewCommunication(communicationId, brokerId, approved, notes?): Promise<DealCommunication>
overrideCommunication(communicationId, brokerId, newContent, reason): Promise<DealCommunication>
blockCommunication(communicationId, brokerId, reason): Promise<DealCommunication>

// Broker Dashboard Data
getBrokerReviewQueue(brokerId): Promise<DealCommunication[]>
getDealCommunications(dealId): Promise<DealCommunication[]>
getThread(threadId): Promise<DealCommunication[]>
getAuditLog(dealId): Promise<CommunicationAuditEntry[]>
getBrokerSupervisionSummary(brokerId): Promise<SupervisionSummary>
```

---

## API Endpoints

### Broker Routes (`/api/broker`)

#### Public/Authenticated Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/apply` | User | Submit broker application |
| `GET` | `/application/:id` | User | Get application status |

**POST /api/broker/apply**
```json
// Request
{
  "licenseNumber": "BR123456",
  "licenseState": "TX",
  "licenseExpirationDate": "2025-12-31",
  "brokerageCompany": "ABC Realty",
  "brokerageAddress": "123 Main St",
  "brokeragePhone": "555-1234",
  "eoInsurancePolicy": "EOI-789"
}

// Response
{
  "success": true,
  "data": { /* BrokerProfile */ },
  "message": "Broker application submitted successfully"
}
```

#### Broker-Only Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/profile` | Get broker profile + stats |
| `GET` | `/deals` | Get assigned deals (MSAs) |
| `GET` | `/deals/:dealId` | Get deal details with communications & fees |
| `GET` | `/deals/:dealId/audit` | Get deal audit log |
| `GET` | `/communications` | Get communication review queue |
| `PUT` | `/communications/:id/review` | Mark communication as reviewed |
| `PUT` | `/communications/:id/override` | Override message content |
| `PUT` | `/communications/:id/block` | Block a communication |
| `GET` | `/supervision/summary` | Get supervision dashboard metrics |

**GET /api/broker/supervision/summary**
```json
// Response
{
  "success": true,
  "data": {
    "totalDeals": 15,
    "pendingReviews": 3,
    "reviewedToday": 12,
    "overriddenThisWeek": 1,
    "blockedThisWeek": 0
  }
}
```

#### Admin-Only Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/applications` | Get pending broker applications |
| `PUT` | `/admin/applications/:id/approve` | Approve application |
| `PUT` | `/admin/applications/:id/reject` | Reject application |
| `GET` | `/admin/brokers` | Get all approved brokers |
| `PUT` | `/admin/brokers/:id/suspend` | Suspend a broker |
| `GET` | `/admin/expiring-licenses` | Get brokers with expiring licenses |

### MSA Routes (`/api/msa`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/generate` | User | Generate MSA for a deal |
| `GET` | `/:id` | User | Get MSA details |
| `GET` | `/deal/:dealId` | User | Get MSA by deal ID |
| `POST` | `/:id/send` | User | Send for DocuSeal signatures |
| `GET` | `/:id/status` | User | Get signature status |
| `GET` | `/:id/fees` | User | Get MSA fees |
| `GET` | `/:id/fees/summary` | User | Get fee summary for closing |
| `PUT` | `/fees/:feeId` | User | Update fee status |
| `POST` | `/:id/fees/closing` | User | Mark all fees due at closing |
| `PUT` | `/:id/fee-structure` | User | Update fee structure (draft only) |
| `POST` | `/:id/terminate` | User | Terminate MSA |
| `POST` | `/:id/complete` | User | Mark MSA complete |
| `GET` | `/wholesaler` | Wholesaler | Get MSAs for current wholesaler |

**POST /api/msa/generate**
```json
// Request
{
  "propertyId": 123,
  "dealId": "deal-456",
  "wholesalerId": "user-uuid",
  "brokerId": "broker-uuid",  // Optional - auto-assigns
  "feeStructure": {           // Optional
    "brokerFee": 100,
    "tcFee": 700,
    "wholesalerAssignmentFee": 5000
  }
}

// Response
{
  "success": true,
  "data": {
    "id": "msa-uuid",
    "status": "draft",
    "feeStructure": { "brokerFee": 100, "tcFee": 700 },
    "signedByWholesaler": false,
    "signedByBroker": false,
    "signedByDispotree": false
  }
}
```

**GET /api/msa/:id/status**
```json
// Response
{
  "success": true,
  "data": {
    "status": "pending_signatures",
    "pendingSignatures": ["dispotree"],
    "signatures": {
      "wholesaler": { "signed": true, "signedAt": "2025-01-15T10:00:00Z" },
      "broker": { "signed": true, "signedAt": "2025-01-15T11:00:00Z" },
      "dispotree": { "signed": false }
    }
  }
}
```

**GET /api/msa/:id/fees/summary**
```json
// Response - For closing statement
{
  "success": true,
  "data": {
    "brokerFee": { "amount": 100, "status": "due_at_closing", "recipient": "John Broker" },
    "tcFee": { "amount": 700, "status": "due_at_closing", "recipient": "DispoTree" },
    "assignmentFee": { "amount": 5000, "status": "due_at_closing", "recipient": "Jane Wholesaler" },
    "totalFees": 5800,
    "pendingFees": 5800
  }
}
```

---

## Middleware

### Authentication (`src/middleware/auth.ts`)

Updated with role-based access controls:

```typescript
// New Middleware Functions
requireAdmin(req, res, next): void
  - Allows: 'admin' OR 'super_admin'
  - Blocks: All other roles

requireSuperAdmin(req, res, next): void
  - Allows: 'super_admin' ONLY
  - Blocks: All other roles including 'admin'

// Updated Middleware
authorizeOwner(getOwnerId): (req, res, next) => Promise<void>
  - Now allows both 'admin' AND 'super_admin' to access any resource
  - Original owner can still access their own resources
```

**Usage Example:**
```typescript
import { requireAdmin, requireSuperAdmin } from '../middleware/auth';

// Standard or super admin can access
router.put('/admin/applications/:id/approve', requireAdmin, async (req, res) => {
  // ...
});

// Only super admin can access
router.put('/system/config', requireSuperAdmin, async (req, res) => {
  // ...
});
```

---

## Workflow Automation

### 1. Broker Application Workflow

```
User submits application
       ↓
BrokerProfile created (status='pending')
       ↓
Admin reviews
       ↓
    ┌────┴────┐
    │           │
Approved    Rejected
    │           │
status=      status=
'approved'   'rejected'
    ↓
Notify broker
```

### 2. Deal MSA Generation Workflow

```
Property created/contract uploaded
       ↓
Auto-assign broker (by state, round-robin)
       ↓
Create DealBrokerMSA (status='draft')
       ↓
Create DealFeeTracking records (x3)
       ↓
Increment broker.activeDeals
```

### 3. MSA Signature Workflow

```
POST /msa/:id/send
       ↓
Create DocuSeal submission (3 submitters)
       ↓
Emails sent to: wholesaler, broker, DispoTree
       ↓
DocuSeal webhook on signature
       ↓
Record signature by party
       ↓
IF all signed → status='active', effectiveDate=now
```

### 4. Communication Routing Workflow

```
Buyer sends inquiry
       ↓
Create DealCommunication (direction='inbound')
       ↓
AI compliance check
    ┌────┴────┐
    │           │
Clean      Flagged
    │           │
auto-send   hold/block
    ↓
status='sent'
    ↓
Broker can review/override/block
```

### 5. Fee Tracking Workflow

```
MSA generated
       ↓
Create fee records (status='pending')
       ↓
Deal closing → POST /:id/fees/closing
       ↓
All fees → status='due_at_closing'
       ↓
GET /:id/fees/summary → Closing statement data
```

---

## Database Schema

### New Tables

```sql
-- broker_profiles
CREATE TABLE broker_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES marketplace_users(id),
  license_number VARCHAR(255) NOT NULL,
  license_state VARCHAR(2) NOT NULL,
  license_expiration_date DATE NOT NULL,
  brokerage_company VARCHAR(255) NOT NULL,
  brokerage_address TEXT,
  brokerage_phone VARCHAR(50),
  brokerage_email VARCHAR(255),
  eo_insurance_policy VARCHAR(255),
  eo_expiration_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'suspended', 'rejected')),
  approved_at TIMESTAMP,
  approved_by UUID,
  rejected_at TIMESTAMP,
  rejected_by UUID,
  rejection_reason TEXT,
  suspended_at TIMESTAMP,
  suspended_by UUID,
  suspension_reason TEXT,
  notes TEXT,
  total_deals_supervised INTEGER DEFAULT 0,
  active_deals INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id)
);

-- broker_assistants
CREATE TABLE broker_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES marketplace_users(id),
  broker_id UUID NOT NULL REFERENCES broker_profiles(id),
  permissions TEXT[] DEFAULT ARRAY[
    'view_deals', 'view_communications', 'manage_documents', 'post_notes'
  ],
  assigned_by UUID NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id)
);

-- transaction_coordinators
CREATE TABLE transaction_coordinators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES marketplace_users(id),
  license_number VARCHAR(255),
  license_states VARCHAR(2)[] DEFAULT ARRAY[]::VARCHAR(2)[],
  status VARCHAR(20) DEFAULT 'inactive'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  company VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  active_deals INTEGER DEFAULT 0,
  total_deals_coordinated INTEGER DEFAULT 0,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id)
);

-- deal_broker_msas
CREATE TABLE deal_broker_msas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  deal_id VARCHAR(255) NOT NULL,
  wholesaler_id UUID NOT NULL REFERENCES marketplace_users(id),
  broker_id UUID NOT NULL REFERENCES broker_profiles(id),
  status VARCHAR(30) DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'pending_signatures', 'active', 'completed', 'terminated', 'expired'
    )),
  docuseal_submission_id INTEGER,
  docuseal_template_id INTEGER,
  msa_document_url VARCHAR(500),
  clauses JSONB NOT NULL,
  fee_structure JSONB NOT NULL,
  effective_date TIMESTAMP,
  expiration_date TIMESTAMP,
  signed_by_wholesaler BOOLEAN DEFAULT FALSE,
  signed_by_wholesaler_at TIMESTAMP,
  wholesaler_signature_id VARCHAR(255),
  signed_by_broker BOOLEAN DEFAULT FALSE,
  signed_by_broker_at TIMESTAMP,
  broker_signature_id VARCHAR(255),
  signed_by_dispotree BOOLEAN DEFAULT FALSE,
  signed_by_dispotree_at TIMESTAMP,
  dispotree_signature_id VARCHAR(255),
  terminated_at TIMESTAMP,
  terminated_by UUID,
  termination_reason TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- deal_communications
CREATE TABLE deal_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id VARCHAR(255) NOT NULL,
  msa_id UUID NOT NULL REFERENCES deal_broker_msas(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_type VARCHAR(20) NOT NULL CHECK (from_type IN (
    'buyer', 'wholesaler', 'broker', 'ai_assistant'
  )),
  from_user_id VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  from_email VARCHAR(255),
  to_type VARCHAR(20) NOT NULL CHECK (to_type IN (
    'buyer', 'wholesaler', 'broker', 'ai_assistant'
  )),
  to_user_id VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),
  to_email VARCHAR(255),
  message_type VARCHAR(30) NOT NULL CHECK (message_type IN (
    'inquiry', 'response', 'offer', 'counter_offer', 'negotiation', 'system', 'notification'
  )),
  subject VARCHAR(500),
  content TEXT NOT NULL,
  ai_processed BOOLEAN DEFAULT FALSE,
  ai_processed_at TIMESTAMP,
  ai_response TEXT,
  ai_confidence_score FLOAT,
  ai_suggested_action VARCHAR(50),
  broker_reviewed BOOLEAN DEFAULT FALSE,
  broker_reviewed_at TIMESTAMP,
  broker_reviewed_by UUID,
  broker_approved BOOLEAN,
  broker_notes TEXT,
  broker_overridden BOOLEAN DEFAULT FALSE,
  broker_overridden_at TIMESTAMP,
  broker_override_reason TEXT,
  original_content TEXT,
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'sent', 'delivered', 'read', 'blocked', 'failed'
  )),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  blocked_at TIMESTAMP,
  blocked_by UUID,
  block_reason TEXT,
  thread_id UUID,
  parent_message_id UUID,
  channel VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- deal_fee_tracking
CREATE TABLE deal_fee_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id VARCHAR(255) NOT NULL,
  msa_id UUID NOT NULL REFERENCES deal_broker_msas(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  fee_type VARCHAR(30) NOT NULL CHECK (fee_type IN (
    'broker', 'tc', 'wholesaler_assignment'
  )),
  fee_name VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN (
    'broker', 'dispotree', 'wholesaler'
  )),
  recipient_id VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  recipient_email VARCHAR(255),
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
    'pending', 'due_at_closing', 'invoiced', 'collected', 'waived', 'refunded'
  )),
  closing_date DATE,
  closing_statement_ref VARCHAR(255),
  invoiced_at TIMESTAMP,
  invoice_number VARCHAR(255),
  collected_at TIMESTAMP,
  collected_amount DECIMAL(12,2),
  collection_method VARCHAR(50),
  collection_reference VARCHAR(255),
  waived_at TIMESTAMP,
  waived_by UUID,
  waiver_reason TEXT,
  refunded_at TIMESTAMP,
  refunded_by UUID,
  refund_amount DECIMAL(12,2),
  refund_reason TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## File Structure

```
backend/src/
├── models/
│   ├── MarketplaceUser.ts         ✅ UPDATED (role enum)
│   ├── BrokerProfile.ts            ✅ NEW
│   ├── BrokerAssistant.ts          ✅ NEW
│   ├── TransactionCoordinator.ts   ✅ NEW
│   ├── DealBrokerMSA.ts            ✅ NEW
│   ├── DealCommunication.ts        ✅ NEW
│   └── DealFeeTracking.ts          ✅ NEW
│
├── services/
│   ├── BrokerService.ts            ✅ NEW
│   ├── BrokerMSAService.ts         ✅ NEW
│   └── BrokerCommunicationService.ts ✅ NEW
│
├── routes/
│   ├── brokerRoutes.ts             ✅ NEW
│   └── brokerMSARoutes.ts          ✅ NEW
│
├── middleware/
│   └── auth.ts                      ✅ UPDATED (requireAdmin, requireSuperAdmin)
│
└── index.ts                         ✅ UPDATED
    - Imports new models
    - Adds model associations
    - Registers new routes
    - Initializes new services
```

---

## Integration Points

### Property Creation → MSA Generation

```typescript
// In PropertyController or PropertyService
import { brokerMSAService } from '../services/BrokerMSAService';

// After property creation:
if (property.wholesalerId) {
  await brokerMSAService.generateMSA({
    propertyId: property.id,
    dealId: property.propertyId,
    wholesalerId: property.wholesalerId,
    // brokerId will be auto-assigned by state
  });
}
```

### DocuSeal Webhook Handler

```typescript
// In webhook handler
import { brokerMSAService } from '../services/BrokerMSAService';

app.post('/webhooks/docuseal', async (req, res) => {
  const { event_type, data } = req.body;

  if (event_type === 'form.completed' || event_type === 'submission.completed') {
    const submitter = await docuSealService.getSubmitter(data.submitter_id);
    await brokerMSAService.handleSignatureWebhook(
      data.submission_id,
      submitter.email,
      'completed'
    );
  }

  res.json({ success: true });
});
```

### Agent Service AI Tool

```typescript
// In agentService.ts
// Add broker-mediated communication tool
{
  name: 'send_broker_mediated_message',
  description: 'Send message through broker-mediated compliance system',
  schema: {
    dealId: 'string',
    toType: 'buyer | wholesaler',
    content: 'string',
    messageType: 'inquiry | response | offer | counter_offer'
  },
  func: async (params) => {
    return brokerCommunicationService.routeMessage({
      dealId: params.dealId,
      fromType: 'ai_assistant',
      fromUserId: 'ai_assistant',
      toType: params.toType,
      content: params.content,
      messageType: params.messageType
    });
  };
}
```

---

## Pending Implementation

### Red/Yellow/Green Compliance Flags

**Status:** Not Built

A separate compliance checking system that categorizes deals into:
- **RED** - Authority/fraud issues (blocks everything)
- **YELLOW** - Missing documents (curable gaps)
- **GREEN** - Complete and market-ready

This requires:
1. `ComplianceCheck` model extensions
2. State-specific rule engine
3. Document upload workflow
4. Yellow → Green transition logic

### Frontend Implementation

**Status:** Not Built

Required pages:
- Broker portal dashboard
- Deal management pages
- Communication review interface
- Admin broker approval pages
- MSA status tracking
- Fee management interface

### AI Agent Prompt Constraints

**Status:** Language Provided, Not Integrated

The AI agent prompt constraints for document handling need to be added to:
- `backend/src/services/agentService.ts`
- System prompt configuration
- Guardrails against legal advice

---

## Appendix

### Fee Structure Defaults

| Fee Type | Default Amount | Recipient |
|----------|---------------|-----------|
| Broker Supervision | $100 | Broker |
| Transaction Coordination | $700 | DispoTree |
| Wholesaler Assignment | Variable | Wholesaler |

### MSA Default Clauses

```javascript
{
  brokerMarketingAuthority: true,
  aiAssistantAuthorization: true,
  brokerSupervision: true,
  feeDisclosure: true,
  recordkeeping: true,
  communicationRouting: true
}
```

### State Assignment Logic

```typescript
// Brokers are assigned by property state
// Round-robin based on activeDeals count
// Preference: Fewer active deals → higher priority
```

---

**Document Version:** 1.0
**Last Updated:** 2025-01-15
**Authors:** Claude Code Implementation Team
