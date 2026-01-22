# Oklahoma Wholesale Deal - Compliance Requirements Matrix

This document defines **exactly what contacts, contracts, and rules** are required for each Oklahoma wholesale property deal.

---

## 📋 **REQUIRED CONTACTS PER PROPERTY**

### **Contact Category 1: Wholesaler/Submitter**

| Contact Type | Required? | When Collected | Validation Rule | Stored In |
|--------------|-----------|----------------|-----------------|-----------|
| **Wholesaler User** | ✅ REQUIRED | Account Creation | Must have verified email | `MarketplaceUser` |
| - First Name | ✅ REQUIRED | Account Creation | Not empty | `first_name` |
| - Last Name | ✅ REQUIRED | Account Creation | Not empty | `last_name` |
| - Email | ✅ REQUIRED | Account Creation | Valid email format | `email` |
| - Phone | ✅ REQUIRED | Account Creation | Valid US phone | `phone` |
| - Role | ✅ REQUIRED | Auto-set | Must be "wholesaler" | `role` |

### **Contact Category 2: LLC Entity** (HARD GATE - Phase 0)

| Contact Type | Required? | When Collected | Validation Rule | Stored In |
|--------------|-----------|----------------|-----------------|-----------|
| **LLC Profile** | ✅ REQUIRED | Before Submission | Must be complete | `LLCProfile` (new table) |
| - LLC Legal Name | ✅ REQUIRED | LLC Creation | Exact match on contract | `legal_name` |
| - EIN | ✅ REQUIRED | LLC Creation | Valid 9-digit EIN | `ein` |
| - State of Formation | ✅ REQUIRED | LLC Creation | Must match registration | `state_of_formation` |
| - Formation Date | ✅ REQUIRED | LLC Creation | Valid date | `formation_date` |
| - Business Address | ✅ REQUIRED | LLC Creation | Valid street address | `business_address` |
| **Authorized Signer** | ✅ REQUIRED | LLC Creation | Must match operating agreement | `LLCAuthorizedSigner` (new table) |
| - Signer Name | ✅ REQUIRED | LLC Creation | Exact match on contracts | `name` |
| - Title | ✅ REQUIRED | LLC Creation | (Manager, Member, President) | `title` |
| - SSN/EIN | ✅ REQUIRED | LLC Creation | For KYC/AML | `tax_id` (encrypted) |
| - Signing Authority | ✅ REQUIRED | LLC Creation | Upload operating agreement | `authority_document_url` |

**BLOCKING RULE:** Cannot submit deal without selecting an LLC with complete profile + executed CSA.

### **Contact Category 3: Property Seller**

| Contact Type | Required? | When Collected | Validation Rule | Stored In |
|--------------|-----------|----------------|-----------------|-----------|
| **Seller (Owner)** | ✅ REQUIRED | Contract Upload | Must match public records | `PropertyContact` |
| - Seller Full Name | ✅ REQUIRED | OCR Extraction | Must match deed | `name` |
| - Seller Entity Type | ✅ REQUIRED | Manual/OCR | (Individual, LLC, Trust, Estate) | `entity_type` |
| - Seller Address | ⚠️ RECOMMENDED | Manual Entry | For closing coordination | `address` |
| - Seller Phone | ⚠️ RECOMMENDED | Manual Entry | For communication | `phone` |
| - Seller Email | ⚠️ RECOMMENDED | Manual Entry | For doc delivery | `email` |
| - Seller Signature | ✅ REQUIRED | OCR Verification | Must be present on contract | `signature_verified` |

**VALIDATION RULE (Phase 3):** Extracted seller name must match property owner of record (public records verification).

### **Contact Category 4: End Buyer (Assignment)**

| Contact Type | Required? | When Collected | Validation Rule | Stored In |
|--------------|-----------|----------------|-----------------|-----------|
| **Assignee** | ✅ REQUIRED | Assignment Execution | After Phase 10 timing gate | `AssignmentParty` (new table) |
| - Assignee Name | ✅ REQUIRED | Assignment Upload | Legal entity name | `name` |
| - Assignee Entity Type | ✅ REQUIRED | Manual Entry | (Individual, LLC, Fund) | `entity_type` |
| - Assignee Contact | ✅ REQUIRED | Manual Entry | Primary contact person | `contact_name` |
| - Assignee Email | ✅ REQUIRED | Manual Entry | For closing coordination | `email` |
| - Assignee Phone | ✅ REQUIRED | Manual Entry | For closing coordination | `phone` |

### **Contact Category 5: Broker/Reviewer (Internal)**

| Contact Type | Required? | When Collected | Validation Rule | Stored In |
|--------------|-----------|----------------|-----------------|-----------|
| **Jason (Broker)** | ✅ REQUIRED | Phase 8 Review | Must approve before distribution | `MarketplaceUser` (role: broker) |
| - Reviewer Name | ✅ REQUIRED | Auto-assigned | "Jason" | `reviewer_name` |
| - Review Date | ✅ REQUIRED | Phase 8 Approval | Timestamp of approval | `reviewed_at` |
| - Review Notes | ⚠️ OPTIONAL | Phase 8 | Any comments | `review_notes` |
| - Approval Status | ✅ REQUIRED | Phase 8 | (approved, rejected, needs_info) | `approval_status` |

---

## 📄 **REQUIRED CONTRACTS/DOCUMENTS PER PROPERTY**

### **Document Category 1: LLC Formation Documents** (Phase 0 - Hard Gate)

| Document Name | Required? | Phase | Validation | Stored In | Retention |
|---------------|-----------|-------|------------|-----------|-----------|
| **LLC Articles of Organization** | ✅ REQUIRED | Phase 0 | Must show LLC legal name | `PropertyDocument` | Permanent |
| **LLC Operating Agreement** | ✅ REQUIRED | Phase 0 | Must identify authorized signer | `PropertyDocument` | Permanent |
| **Client Services Agreement (CSA)** | ✅ REQUIRED | Phase 0 | Must be executed per LLC | `Agreement` table | Permanent |
| - CSA Version | ✅ REQUIRED | Phase 0 | Track version for audit | `agreement_version` | - |
| - CSA Execution Date | ✅ REQUIRED | Phase 0 | Must be before deal submission | `executed_at` | - |
| - CSA Signer | ✅ REQUIRED | Phase 0 | Must be authorized signer | `signed_by` | - |

**BLOCKING RULE:** Cannot proceed to Phase 2 without ALL Phase 0 documents uploaded and CSA executed.

### **Document Category 2: Purchase Contract** (Phase 2 - Initial Submission)

| Document Name | Required? | Phase | Validation | Stored In | Retention |
|---------------|-----------|-------|------------|-----------|-----------|
| **Oklahoma Purchase Agreement** | ✅ REQUIRED | Phase 2 | Must be assignable, AS-IS | `PropertyDocument` | 7 years |
| - Contract Signature Page | ✅ REQUIRED | Phase 2 | Seller + Buyer signatures | Extracted + verified | - |
| - Contract Expiration Date | ✅ REQUIRED | Phase 2 | Must not be expired | `contract_expiration_date` | - |
| - Property Address | ✅ REQUIRED | OCR | Must match legal description | `property_address` | - |
| - Purchase Price | ✅ REQUIRED | OCR | Numeric value | `purchase_price` | - |
| - Earnest Money | ✅ REQUIRED | OCR | Numeric value | `earnest_money` | - |
| - Closing Date | ✅ REQUIRED | OCR | Future date | `closing_date` | - |

### **Document Category 3: Oklahoma Wholesale Disclosures** (Phase 4)

| Document Name | Required? | Phase | Validation | Stored In | Retention |
|---------------|-----------|-------|------------|-----------|-----------|
| **Oklahoma Wholesale Disclosure Addendum** | ✅ REQUIRED | Phase 4 | Must contain all 8 disclosures | `PropertyDocument` | 7 years |
| - Disclosure 1: Not Licensed Broker | ✅ REQUIRED | OCR | Boolean - must be true | `disclosure_not_licensed` | - |
| - Disclosure 2: Acting as Principal | ✅ REQUIRED | OCR | Boolean - must be true | `disclosure_principal` | - |
| - Disclosure 3: Equitable Interest Only | ✅ REQUIRED | OCR | Boolean - must be true | `disclosure_equitable` | - |
| - Disclosure 4: Intent to Assign | ✅ REQUIRED | OCR | Boolean - must be true | `disclosure_intent_assign` | - |
| - Disclosure 5: Assignment Compensation | ✅ REQUIRED | OCR | Boolean - must be true | `disclosure_compensation` | - |
| - Disclosure 6: Due Diligence Period | ✅ REQUIRED | OCR | Boolean - must be true | `disclosure_due_diligence` | - |
| - Disclosure 7: No Performance Guarantee | ✅ REQUIRED | OCR | Boolean - must be true | `disclosure_no_guarantee` | - |
| - Disclosure 8: Independent Advice Right | ✅ REQUIRED | OCR | Boolean - must be true | `disclosure_independent_advice` | - |

**SCORING RULE:**
- GREEN: 8/8 disclosures = true
- YELLOW: 5-7/8 disclosures = true (allow remediation)
- RED: <5/8 disclosures = true (reject submission)

### **Document Category 4: Distribution Agreements** (Phase 7)

| Document Name | Required? | Phase | Validation | Stored In | Retention |
|---------------|-----------|-------|------------|-----------|-----------|
| **Marketing Services Agreement (MSA)** | ✅ REQUIRED IF | Phase 7 | If any distribution channel selected | `Agreement` | Permanent |
| - MSA Execution Date | ✅ REQUIRED | Phase 7 | Before distribution | `executed_at` | - |
| - MSA Signed By | ✅ REQUIRED | Phase 7 | Authorized signer | `signed_by` | - |
| **Auction Services Agreement (ASA)** | ✅ REQUIRED IF | Phase 7 | If "Auction Services" selected + cash deal | `Agreement` | Permanent |
| - ASA Execution Date | ✅ REQUIRED | Phase 7 | Before auction listing | `executed_at` | - |
| - ASA Type | ✅ REQUIRED | Phase 7 | "Hubzu Auction Services Agreement" | `agreement_type` | - |

**BLOCKING RULE:** Cannot distribute deal until required agreements executed.

### **Document Category 5: Cancellation Disclosure** (Phase 10 - CRITICAL)

| Document Name | Required? | Phase | Validation | Stored In | Retention |
|---------------|-----------|-------|------------|-----------|-----------|
| **Cancellation/Right-to-Cancel Form** | ✅ REQUIRED | Phase 10 | Before assignment execution | `PropertyDocument` | 7 years |
| - Seller Name | ✅ REQUIRED | OCR | Must match purchase contract | `seller_name` | - |
| - Cancellation Period | ✅ REQUIRED | OCR | (e.g., "3 business days") | `cancellation_period` | - |
| - **Delivery Date** | ✅ REQUIRED | OCR | **CRITICAL FOR TIMING** | `delivery_date` | - |
| - Seller Acknowledgment | ✅ REQUIRED | OCR | Signature or electronic confirmation | `seller_acknowledged` | - |

**TIMING RULE (CRITICAL):**
```
Contract Acceptance Date < Cancellation Delivery Date < Assignment Execution Date
```

**BLOCKING RULE:** Assignment execution is **LOCKED** until:
1. Cancellation form uploaded
2. Delivery date extracted
3. Delivery date > contract acceptance date
4. Seller acknowledgment confirmed

### **Document Category 6: Assignment Agreement** (Phase 11)

| Document Name | Required? | Phase | Validation | Stored In | Retention |
|---------------|-----------|-------|------------|-----------|-----------|
| **Assignment of Purchase Agreement** | ✅ REQUIRED | Phase 11 | After Phase 10 gate passes | `PropertyDocument` | 7 years |
| - Assignor Name | ✅ REQUIRED | OCR | Must match LLC name | `assignor_name` | - |
| - Assignee Name | ✅ REQUIRED | OCR | End buyer name | `assignee_name` | - |
| - Assignment Fee | ✅ REQUIRED | OCR | Numeric value | `assignment_fee` | - |
| - Original Contract Date | ✅ REQUIRED | OCR | Must match purchase contract | `original_contract_date` | - |
| - **Assignment Execution Date** | ✅ REQUIRED | OCR | Must be after cancellation delivery | `assignment_date` | - |
| - Both Party Signatures | ✅ REQUIRED | OCR | Assignor + Assignee | `signatures_verified` | - |

---

## 🚨 **COMPLIANCE RULES BY PHASE**

### **PHASE 0: LLC Hard Gate Rules**

| Rule ID | Rule Description | Enforcement | Blocking? | Audit Logged? |
|---------|------------------|-------------|-----------|---------------|
| OK-P0-R1 | User must select an LLC before submission | Frontend + Backend | ✅ YES | ✅ YES |
| OK-P0-R2 | LLC profile must be complete (all required fields) | Backend validation | ✅ YES | ✅ YES |
| OK-P0-R3 | LLC must have Articles of Organization uploaded | Database check | ✅ YES | ✅ YES |
| OK-P0-R4 | LLC must have Operating Agreement uploaded | Database check | ✅ YES | ✅ YES |
| OK-P0-R5 | Authorized signer must be identified in Operating Agreement | Manual verification | ✅ YES | ✅ YES |
| OK-P0-R6 | CSA must be executed for selected LLC | Database check | ✅ YES | ✅ YES |
| OK-P0-R7 | CSA must be signed by authorized signer | Signature verification | ✅ YES | ✅ YES |

**Implementation:**
```typescript
// Before allowing deal submission
const llc = await LLCProfile.findByPk(selectedLLCId, {
  include: [
    { model: LLCDocument, where: { type: 'articles_of_organization' } },
    { model: LLCDocument, where: { type: 'operating_agreement' } },
    { model: LLCAuthorizedSigner },
    { model: Agreement, where: { type: 'CSA', status: 'executed' } }
  ]
});

if (!llc) {
  throw new Error('LLC profile incomplete');
}

if (!llc.LLCDocuments.length >= 2) {
  throw new Error('Missing LLC formation documents');
}

if (!llc.LLCAuthorizedSigner) {
  throw new Error('No authorized signer identified');
}

if (!llc.Agreements.length > 0) {
  throw new Error('CSA not executed for this LLC');
}
```

### **PHASE 2-3: Contract Submission Rules**

| Rule ID | Rule Description | Enforcement | Blocking? | Audit Logged? |
|---------|------------------|-------------|-----------|---------------|
| OK-P3-R1 | Buyer name must match selected LLC | OCR extraction + comparison | ✅ YES | ✅ YES |
| OK-P3-R2 | Seller name must match property owner of record | OCR + public records API | ⚠️ WARNING | ✅ YES |
| OK-P3-R3 | Authorized signer must have signed as Buyer | OCR signature detection | ✅ YES | ✅ YES |
| OK-P3-R4 | Seller signature must be present | OCR signature detection | ✅ YES | ✅ YES |
| OK-P3-R5 | Assignment language must be present ("and/or assigns") | OCR + regex | ✅ YES | ✅ YES |
| OK-P3-R6 | Marketing/assignment must be permitted | OCR disclosure check | ✅ YES | ✅ YES |
| OK-P3-R7 | Contract expiration date must be in future | Date comparison | ✅ YES | ✅ YES |
| OK-P3-R8 | AS-IS purchase language must be present | OCR keyword detection | ✅ YES | ✅ YES |
| OK-P3-R9 | No warranties language must be present | OCR keyword detection | ⚠️ WARNING | ✅ YES |

**Status Scoring:**
- 🟢 **GREEN**: All required checks pass
- 🟡 **YELLOW**: Required checks pass, warnings present (allow remediation)
- 🔴 **RED**: Any required check fails (reject submission)

### **PHASE 4: Oklahoma Disclosure Rules**

| Rule ID | Rule Description | Enforcement | Blocking? | Audit Logged? |
|---------|------------------|-------------|-----------|---------------|
| OK-P4-R1 | Disclosure 1: Buyer not licensed broker | OCR extraction | ✅ YES | ✅ YES |
| OK-P4-R2 | Disclosure 2: Acting as principal | OCR extraction | ✅ YES | ✅ YES |
| OK-P4-R3 | Disclosure 3: Equitable interest only | OCR extraction | ✅ YES | ✅ YES |
| OK-P4-R4 | Disclosure 4: Intent to assign | OCR extraction | ✅ YES | ✅ YES |
| OK-P4-R5 | Disclosure 5: Assignment compensation | OCR extraction | ✅ YES | ✅ YES |
| OK-P4-R6 | Disclosure 6: Due diligence period | OCR extraction | ✅ YES | ✅ YES |
| OK-P4-R7 | Disclosure 7: No performance guarantee | OCR extraction | ✅ YES | ✅ YES |
| OK-P4-R8 | Disclosure 8: Independent advice right | OCR extraction | ✅ YES | ✅ YES |

**Compliance Scoring:**
```
GREEN: 8/8 disclosures found → Deal can proceed
YELLOW: 5-7/8 disclosures found → Allow upload of corrected addendum (1 remediation attempt)
RED: <5/8 disclosures found → Reject deal, flag for manual review
```

### **PHASE 6: Distribution Channel Rules**

| Rule ID | Rule Description | Enforcement | Blocking? | Audit Logged? |
|---------|------------------|-------------|-----------|---------------|
| OK-P6-R1 | Channel selection only allowed if status = GREEN | Backend check | ✅ YES | ✅ YES |
| OK-P6-R2 | Must select at least one channel | Frontend validation | ✅ YES | ✅ YES |
| OK-P6-R3 | If "Auction Services" selected, deal must be cash | Business logic check | ✅ YES | ✅ YES |

### **PHASE 7: Agreement Trigger Rules**

| Rule ID | Rule Description | Enforcement | Blocking? | Audit Logged? |
|---------|------------------|-------------|-----------|---------------|
| OK-P7-R1 | MSA required if any channel selected | Backend check | ✅ YES | ✅ YES |
| OK-P7-R2 | MSA must be executed before distribution | Database check | ✅ YES | ✅ YES |
| OK-P7-R3 | ASA required if "Auction Services" + cash deal | Business logic | ✅ YES | ✅ YES |
| OK-P7-R4 | ASA must be Hubzu Auction Services Agreement | Document type check | ✅ YES | ✅ YES |
| OK-P7-R5 | ASA must be executed before auction listing | Database check | ✅ YES | ✅ YES |

### **PHASE 8: Broker Review Rules**

| Rule ID | Rule Description | Enforcement | Blocking? | Audit Logged? |
|---------|------------------|-------------|-----------|---------------|
| OK-P8-R1 | Jason (broker) must review before distribution | Workflow state check | ✅ YES | ✅ YES |
| OK-P8-R2 | Review must include compliance summary | Frontend display | ⚠️ NO | ✅ YES |
| OK-P8-R3 | Jason must explicitly approve or reject | Action required | ✅ YES | ✅ YES |
| OK-P8-R4 | Rejection reason must be provided if rejected | Form validation | ✅ YES | ✅ YES |

### **PHASE 10: Cancellation Timing Rules (CRITICAL)**

| Rule ID | Rule Description | Enforcement | Blocking? | Audit Logged? |
|---------|------------------|-------------|-----------|---------------|
| OK-P10-R1 | Cancellation form must be uploaded | Database check | ✅ YES | ✅ YES |
| OK-P10-R2 | Delivery date must be extracted from form | OCR extraction | ✅ YES | ✅ YES |
| OK-P10-R3 | **Delivery date > Contract acceptance date** | **Date validation** | **✅ YES** | **✅ YES** |
| OK-P10-R4 | Seller acknowledgment must be present | OCR signature/checkbox | ✅ YES | ✅ YES |
| OK-P10-R5 | Cancellation period must be disclosed | OCR extraction | ⚠️ WARNING | ✅ YES |

**Critical Timing Validation:**
```typescript
// BLOCKING RULE for Assignment Execution
const contractDate = new Date(deal.contractAcceptanceDate);
const cancellationDelivered = new Date(deal.cancellationDeliveryDate);
const assignmentDate = new Date(); // Current attempt

if (!deal.cancellationDeliveryDate) {
  throw new Error('BLOCKED: Cancellation form not uploaded');
}

if (cancellationDelivered <= contractDate) {
  throw new Error('BLOCKED: Cancellation disclosure delivered BEFORE contract acceptance');
}

if (assignmentDate <= cancellationDelivered) {
  throw new Error('BLOCKED: Cannot execute assignment until seller receives cancellation disclosure');
}

// SUCCESS - Allow assignment execution
```

### **PHASE 11: Assignment Execution Rules**

| Rule ID | Rule Description | Enforcement | Blocking? | Audit Logged? |
|---------|------------------|-------------|-----------|---------------|
| OK-P11-R1 | Phase 10 timing validation must pass | Gate check | ✅ YES | ✅ YES |
| OK-P11-R2 | Assignment agreement must be uploaded | Database check | ✅ YES | ✅ YES |
| OK-P11-R3 | Assignor must match selected LLC | OCR validation | ✅ YES | ✅ YES |
| OK-P11-R4 | Assignment fee must be disclosed | OCR extraction | ✅ YES | ✅ YES |
| OK-P11-R5 | Assignment date must be extracted | OCR extraction | ✅ YES | ✅ YES |
| OK-P11-R6 | **Assignment date > Cancellation delivery date** | **Date validation** | **✅ YES** | **✅ YES** |
| OK-P11-R7 | Both parties must have signed | OCR signature detection | ✅ YES | ✅ YES |

---

## 📊 **DATA MODEL REQUIREMENTS**

### **New Tables Needed**

#### **1. `llc_profiles` Table**
```sql
CREATE TABLE llc_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES marketplace_users(id),
  legal_name VARCHAR(255) NOT NULL,
  ein VARCHAR(9) NOT NULL,
  state_of_formation VARCHAR(2) NOT NULL,
  formation_date DATE NOT NULL,
  business_address TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'incomplete', -- incomplete, complete, verified
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **2. `llc_authorized_signers` Table**
```sql
CREATE TABLE llc_authorized_signers (
  id SERIAL PRIMARY KEY,
  llc_id INTEGER NOT NULL REFERENCES llc_profiles(id),
  name VARCHAR(255) NOT NULL,
  title VARCHAR(100) NOT NULL, -- Manager, Member, President
  tax_id_encrypted TEXT NOT NULL, -- Encrypted SSN/EIN
  authority_document_url TEXT, -- Operating agreement page
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### **3. `llc_documents` Table**
```sql
CREATE TABLE llc_documents (
  id SERIAL PRIMARY KEY,
  llc_id INTEGER NOT NULL REFERENCES llc_profiles(id),
  document_type VARCHAR(100) NOT NULL, -- articles_of_organization, operating_agreement
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  verified BOOLEAN DEFAULT false
);
```

#### **4. `agreements` Table**
```sql
CREATE TABLE agreements (
  id SERIAL PRIMARY KEY,
  llc_id INTEGER REFERENCES llc_profiles(id),
  user_id INTEGER REFERENCES marketplace_users(id),
  deal_id INTEGER REFERENCES properties(id),
  agreement_type VARCHAR(100) NOT NULL, -- CSA, MSA, ASA
  agreement_version VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, executed, expired
  signed_by VARCHAR(255),
  executed_at TIMESTAMP,
  document_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### **5. `oklahoma_deal_compliance` Table**
```sql
CREATE TABLE oklahoma_deal_compliance (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES properties(id),
  llc_id INTEGER NOT NULL REFERENCES llc_profiles(id),

  -- Phase 3 Results
  phase3_status VARCHAR(10), -- GREEN, YELLOW, RED
  buyer_matches_llc BOOLEAN,
  seller_matches_records BOOLEAN,
  contract_assignable BOOLEAN,
  as_is_language BOOLEAN,
  contract_not_expired BOOLEAN,

  -- Phase 4 Results
  phase4_status VARCHAR(10), -- GREEN, YELLOW, RED
  disclosure_not_licensed_broker BOOLEAN,
  disclosure_acting_principal BOOLEAN,
  disclosure_equitable_interest BOOLEAN,
  disclosure_intent_assign BOOLEAN,
  disclosure_compensation BOOLEAN,
  disclosure_due_diligence BOOLEAN,
  disclosure_no_guarantee BOOLEAN,
  disclosure_independent_advice BOOLEAN,

  -- Phase 5 Overall
  overall_compliance_status VARCHAR(10), -- GREEN, YELLOW, RED

  -- Phase 10 Timing
  contract_acceptance_date DATE,
  cancellation_delivery_date DATE,
  cancellation_acknowledged BOOLEAN,
  timing_valid BOOLEAN,

  -- Phase 11 Assignment
  assignment_execution_date DATE,
  assignment_fee DECIMAL(12,2),
  assignee_name VARCHAR(255),

  -- Permissions
  can_distribute BOOLEAN DEFAULT false,
  can_execute_assignment BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **6. `oklahoma_workflow_state` Table**
```sql
CREATE TABLE oklahoma_workflow_state (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES properties(id),
  current_phase INTEGER NOT NULL, -- 0-11
  phase0_complete BOOLEAN DEFAULT false,
  phase2_complete BOOLEAN DEFAULT false,
  phase3_complete BOOLEAN DEFAULT false,
  phase4_complete BOOLEAN DEFAULT false,
  phase5_complete BOOLEAN DEFAULT false,
  phase6_complete BOOLEAN DEFAULT false,
  phase7_complete BOOLEAN DEFAULT false,
  phase8_complete BOOLEAN DEFAULT false,
  phase9_complete BOOLEAN DEFAULT false,
  phase10_complete BOOLEAN DEFAULT false,
  phase11_complete BOOLEAN DEFAULT false,

  blocked BOOLEAN DEFAULT false,
  blocked_reason TEXT,

  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Extensions to Existing Tables**

#### **`properties` Table - Add Oklahoma Fields**
```sql
ALTER TABLE properties ADD COLUMN state VARCHAR(2);
ALTER TABLE properties ADD COLUMN deal_type VARCHAR(50); -- wholesale, novation
ALTER TABLE properties ADD COLUMN submitter_role VARCHAR(50); -- wholesaler, agent, owner
ALTER TABLE properties ADD COLUMN selected_llc_id INTEGER REFERENCES llc_profiles(id);
ALTER TABLE properties ADD COLUMN contract_acceptance_date DATE;
ALTER TABLE properties ADD COLUMN as_is_language BOOLEAN;
ALTER TABLE properties ADD COLUMN oklahoma_compliant BOOLEAN DEFAULT false;
```

#### **`property_documents` Table - Add Document Categories**
```sql
ALTER TABLE property_documents ADD COLUMN category VARCHAR(100);
-- Categories: purchase_contract, disclosure_addendum, cancellation_form, assignment_agreement

ALTER TABLE property_documents ADD COLUMN extraction_confidence DECIMAL(3,2);
ALTER TABLE property_documents ADD COLUMN extraction_data JSONB; -- Store all extracted fields
```

---

## 🎯 **COMPLIANCE ENFORCEMENT SUMMARY**

### **Blocking Gates (Cannot Proceed)**

| Gate | Description | Phase | Impact |
|------|-------------|-------|--------|
| **LLC Hard Gate** | No LLC or incomplete LLC profile | Phase 0 | Cannot submit deal |
| **CSA Gate** | CSA not executed for selected LLC | Phase 0 | Cannot submit deal |
| **RED Status Gate** | Contract or disclosures fail critical checks | Phase 5 | Cannot distribute |
| **Agreement Gate** | Required agreements not executed | Phase 7 | Cannot distribute |
| **Broker Review Gate** | Jason has not approved | Phase 8 | Cannot distribute |
| **Cancellation Timing Gate** | Timing validation fails | Phase 10 | Cannot execute assignment |

### **Warning Gates (Can Proceed with Remediation)**

| Warning | Description | Phase | Action Required |
|---------|-------------|-------|-----------------|
| **YELLOW Status** | 5-7 disclosures found | Phase 4 | Upload corrected addendum |
| **Seller Mismatch** | Seller doesn't match public records | Phase 3 | Verify ownership, may proceed |
| **Missing Cancellation** | Form not uploaded yet | Phase 10 | Upload before assignment |

### **Audit Requirements (Always Log)**

| Event | Log Location | Required Fields | Retention |
|-------|--------------|-----------------|-----------|
| LLC Creation | `ComplianceAuditLog` | user_id, llc_id, timestamp | Permanent |
| CSA Execution | `ComplianceAuditLog` | llc_id, agreement_id, signed_by, timestamp | Permanent |
| Deal Submission | `ComplianceAuditLog` | deal_id, llc_id, user_id, timestamp | 7 years |
| Phase 3 Validation | `ComplianceCheck` | deal_id, status, issues, timestamp | 7 years |
| Phase 4 Validation | `ComplianceCheck` | deal_id, disclosures, status, timestamp | 7 years |
| Broker Review | `ComplianceAuditLog` | deal_id, reviewer_id, decision, timestamp | 7 years |
| Distribution Approval | `ComplianceAuditLog` | deal_id, channels, timestamp | 7 years |
| Cancellation Upload | `ComplianceAuditLog` | deal_id, delivery_date, timestamp | 7 years |
| Assignment Execution | `ComplianceAuditLog` | deal_id, assignee, fee, timestamp | 7 years |

---

## ✅ **IMPLEMENTATION CHECKLIST**

### **Database Schema**
- [ ] Create `llc_profiles` table
- [ ] Create `llc_authorized_signers` table
- [ ] Create `llc_documents` table
- [ ] Create `agreements` table
- [ ] Create `oklahoma_deal_compliance` table
- [ ] Create `oklahoma_workflow_state` table
- [ ] Add Oklahoma fields to `properties` table
- [ ] Add extraction fields to `property_documents` table

### **Contact Management**
- [ ] Build LLC creation form (Phase 0)
- [ ] Add authorized signer management
- [ ] Add property seller contact extraction
- [ ] Add assignee contact form (Phase 11)
- [ ] Link contacts to deals

### **Document Management**
- [ ] Upload flow for LLC documents
- [ ] Upload flow for purchase contract
- [ ] Upload flow for disclosure addendum
- [ ] Upload flow for cancellation form
- [ ] Upload flow for assignment agreement
- [ ] OCR extraction for each document type
- [ ] Store extraction results in `extraction_data` JSONB

### **Compliance Rules Engine**
- [ ] Phase 0: LLC hard gate validation
- [ ] Phase 3: Universal contract checks
- [ ] Phase 4: 8-disclosure checker
- [ ] Phase 5: GREEN/YELLOW/RED scoring
- [ ] Phase 7: Agreement trigger logic
- [ ] Phase 8: Broker review workflow
- [ ] Phase 10: Timing validation (CRITICAL)
- [ ] Phase 11: Assignment execution gate

### **Audit Logging**
- [ ] Log all document uploads
- [ ] Log all OCR extractions
- [ ] Log all compliance checks
- [ ] Log all status changes
- [ ] Log all approval/rejection events
- [ ] Log all agreement executions
- [ ] Log assignment execution events

---

**Total Contacts Required per Deal:** 5-6 types
**Total Documents Required per Deal:** 7-8 documents
**Total Compliance Rules:** 47 rules across 11 phases
**Total Blocking Gates:** 6 hard gates
**Database Tables to Create:** 6 new tables

---

*Last Updated: January 2026*
*Oklahoma Compliance Matrix v1.0*
