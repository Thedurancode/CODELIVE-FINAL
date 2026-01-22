# Master Deal Checklist - Contacts, Contracts & Responsibilities

**Print this checklist for every deal to ensure nothing is missed.**

---

## 📋 **QUICK REFERENCE CARD**

| Item | Required? | Who Provides | When | Blocks Deal? |
|------|-----------|--------------|------|--------------|
| **LLC Profile** | ✅ YES | Wholesaler | Before submission | ✅ YES |
| **CSA (Agreement)** | ✅ YES | Platform + LLC | Before submission | ✅ YES |
| **Purchase Contract** | ✅ YES | Wholesaler | Deal submission (Phase 2) | ✅ YES |
| **Disclosure Addendum** | ✅ YES | Wholesaler | Deal submission (Phase 4) | ✅ YES |
| **Seller Contact Info** | ⚠️ RECOMMENDED | Wholesaler | Deal submission | ❌ NO |
| **MSA (Agreement)** | ✅ IF DISTRIBUTING | Platform + Wholesaler | Before distribution (Phase 7) | ✅ YES |
| **ASA (Agreement)** | ✅ IF AUCTION | Platform + Wholesaler | Before auction (Phase 7) | ✅ YES |
| **Cancellation Form** | ✅ YES | Wholesaler | Before assignment (Phase 10) | ✅ YES |
| **Assignment Agreement** | ✅ YES | Wholesaler + End Buyer | Assignment execution (Phase 11) | ✅ YES |

---

## 👥 **PART 1: CONTACTS NEEDED PER DEAL**

### **Contact #1: Wholesaler/Submitter** ✅ REQUIRED
**Who:** The person/company submitting the deal to the platform
**When Collected:** Account creation
**Blocks Deal?:** YES - Cannot create account without this

**Required Information:**
- [ ] First Name
- [ ] Last Name
- [ ] Email Address
- [ ] Phone Number
- [ ] Role: Wholesaler

**Who Fills This In:** Wholesaler (self-registration)

**Where It's Stored:** `marketplace_users` table

---

### **Contact #2: LLC Entity** ✅ REQUIRED (HARD GATE)
**Who:** The legal entity submitting deals (liability protection)
**When Collected:** Before first deal submission (Phase 0)
**Blocks Deal?:** YES - Cannot submit without complete LLC + executed CSA

**Required Information:**
- [ ] LLC Legal Name (exact, from Articles)
- [ ] EIN (9 digits)
- [ ] State of Formation (e.g., OK, TX, FL)
- [ ] Formation Date
- [ ] Business Address
- [ ] Articles of Organization (PDF upload)
- [ ] Operating Agreement (PDF upload)

**Who Fills This In:** Wholesaler (LLC owner)

**Where It's Stored:** `llc_profiles` table

**Why Required:** Provides liability protection and professional credibility

---

### **Contact #3: Authorized Signer** ✅ REQUIRED
**Who:** Person authorized to sign contracts on behalf of the LLC
**When Collected:** With LLC profile (Phase 0)
**Blocks Deal?:** YES - Must be identified from Operating Agreement

**Required Information:**
- [ ] Full Legal Name
- [ ] Title (Manager, Member, President)
- [ ] SSN or EIN (encrypted)
- [ ] Proof of Authority (Operating Agreement page showing signing rights)

**Who Fills This In:** Wholesaler (LLC owner)

**Where It's Stored:** `llc_authorized_signers` table

**Why Required:** Validates contracts are legally binding

---

### **Contact #4: Property Seller** ✅ REQUIRED
**Who:** Current owner of the property
**When Collected:** From purchase contract (OCR extraction) - Phase 2
**Blocks Deal?:** YES - Must match public records

**Required Information:**
- [ ] Full Legal Name (individual or entity)
- [ ] Entity Type (Individual, LLC, Trust, Estate)
- [ ] Address (recommended)
- [ ] Phone (recommended)
- [ ] Email (recommended)
- [ ] Signature Verification (on contract)

**Who Fills This In:**
- Name/Signature: Auto-extracted from contract via OCR
- Contact info: Wholesaler enters manually

**Where It's Stored:** `property_contacts` table

**Why Required:** Validates ownership and consent to sell

**Validation Rule:** Extracted seller name must match property deed/public records

---

### **Contact #5: End Buyer (Assignee)** ✅ REQUIRED (PHASE 11)
**Who:** The party buying the assigned contract
**When Collected:** Assignment execution (Phase 11)
**Blocks Deal?:** YES - Cannot execute assignment without this

**Required Information:**
- [ ] Full Legal Name (individual or entity)
- [ ] Entity Type (Individual, LLC, Fund)
- [ ] Primary Contact Person
- [ ] Email Address
- [ ] Phone Number

**Who Fills This In:** Wholesaler (provides end buyer details)

**Where It's Stored:** `assignment_parties` or `oklahoma_deal_compliance.assignee_name`

**Why Required:** Completes the assignment chain

---

### **Contact #6: Broker/Reviewer (Internal)** ✅ REQUIRED
**Who:** Internal platform reviewer (e.g., Jason)
**When Collected:** Auto-assigned for deal review (Phase 8)
**Blocks Deal?:** YES - Must approve before distribution

**Required Information:**
- [ ] Reviewer Name (e.g., "Jason")
- [ ] Review Date (timestamp)
- [ ] Approval Decision (approved/rejected/needs_info)
- [ ] Review Notes (optional)

**Who Fills This In:** Broker (Jason) via platform review interface

**Where It's Stored:** `compliance_audit_log` or `deal_reviews` table

**Why Required:** Internal quality control gate

---

### **Contact #7: Title Company** ⚠️ OPTIONAL/RECOMMENDED
**Who:** Title company handling the closing
**When Collected:** During closing coordination
**Blocks Deal?:** NO - But needed for closing

**Required Information:**
- [ ] Company Name
- [ ] Contact Person
- [ ] Email
- [ ] Phone
- [ ] Fax (if required)

**Who Fills This In:** Wholesaler or assigned transaction coordinator

**Where It's Stored:** `property_contacts` or separate `title_companies` table

**Why Required:** Coordinates closing and title insurance

---

### **Contact #8: Attorney** ⚠️ STATE-DEPENDENT
**Who:** Real estate attorney (required in some states)
**When Collected:** If state law requires attorney review
**Blocks Deal?:** YES (if required by state)

**Required Information:**
- [ ] Attorney Name
- [ ] Law Firm
- [ ] Bar Number
- [ ] Email
- [ ] Phone

**Who Fills This In:** Wholesaler or platform assigns

**Where It's Stored:** `attorneys` table

**Why Required:** Some states (e.g., NY, NJ) require attorney involvement in real estate transactions

---

## 📄 **PART 2: CONTRACTS/DOCUMENTS NEEDED PER DEAL**

### **Document #1: LLC Articles of Organization** ✅ REQUIRED (PHASE 0)
**What It Is:** State-filed document proving LLC exists
**Who Provides:** Wholesaler (one-time per LLC)
**When:** Before first deal submission
**Blocks Deal?:** YES - Cannot submit without this

**What We Extract:**
- [ ] LLC Legal Name
- [ ] State of Formation
- [ ] Filing Date

**Who Reviews:** Platform (manual verification)

**Retention:** Permanent

---

### **Document #2: LLC Operating Agreement** ✅ REQUIRED (PHASE 0)
**What It Is:** Internal document defining LLC management and signing authority
**Who Provides:** Wholesaler (one-time per LLC)
**When:** Before first deal submission
**Blocks Deal?:** YES - Needed to verify authorized signer

**What We Extract:**
- [ ] Authorized Signer Name
- [ ] Authorized Signer Title
- [ ] Signing Authority Clause

**Who Reviews:** Platform (manual verification of signer authority)

**Retention:** Permanent

---

### **Document #3: Client Services Agreement (CSA)** ✅ REQUIRED (PHASE 0)
**What It Is:** Agreement between platform and LLC for services
**Who Provides:** Platform generates, LLC signs
**When:** Before first deal submission (one-time per LLC)
**Blocks Deal?:** YES - Cannot submit without executed CSA

**Who Signs:**
- [ ] Platform (auto-signed)
- [ ] Authorized Signer (for the LLC)

**Execution Method:** DocuSeal or manual

**Retention:** Permanent

**Stored In:** `agreements` table (type: 'CSA', llc_id: X, status: 'executed')

---

### **Document #4: Purchase Agreement** ✅ REQUIRED (PHASE 2)
**What It Is:** Contract between seller and wholesaler (LLC) to purchase property
**Who Provides:** Wholesaler uploads
**When:** Deal submission (Phase 2)
**Blocks Deal?:** YES - This IS the deal

**State-Specific Forms:**
- **Oklahoma:** Generic wholesale purchase agreement
- **Texas:** TREC 1-4 Family Residential Contract
- **Florida:** FAR/BAR Residential Contract
- **California:** CAR Purchase Agreement

**What We Extract (via OCR):**
- [ ] Seller Name (or "Grantor" in TX)
- [ ] Buyer Name (or "Grantee" in TX) - must match LLC
- [ ] Property Address
- [ ] Purchase Price
- [ ] Earnest Money Amount
- [ ] Closing Date
- [ ] Contract Expiration Date
- [ ] Assignable? (must be YES or contain "and/or assigns")
- [ ] AS-IS Language? (required for wholesale)
- [ ] Marketing Clause? (allows wholesaling during inspection period)

**Who Signs:**
- [ ] Seller (property owner)
- [ ] Authorized Signer (for buyer LLC)

**Retention:** 7 years

**Stored In:** `property_documents` table (category: 'purchase_contract')

---

### **Document #5: Wholesale Disclosure Addendum** ✅ REQUIRED (PHASE 4)
**What It Is:** State-specific disclosures required for wholesale assignments
**Who Provides:** Wholesaler uploads (attached to purchase contract)
**When:** Deal submission (Phase 4 verification)
**Blocks Deal?:** YES - Missing disclosures = RED status

**State-Specific Requirements:**

**Oklahoma (8 disclosures required):**
- [ ] 1. Buyer not a licensed real estate broker
- [ ] 2. Buyer acting solely as a principal
- [ ] 3. Equitable interest only (not full title)
- [ ] 4. Intent to assign to subsequent purchaser
- [ ] 5. Assignment compensation disclosure
- [ ] 6. Inspection/due diligence period allows marketing
- [ ] 7. No guarantee of performance
- [ ] 8. Seller's right to independent legal advice

**Texas (3 critical disclosures):**
- [ ] 1. Assignment rights disclosure (TX Property Code §5.069)
- [ ] 2. Assignment fee disclosure to seller
- [ ] 3. Not a licensed broker disclosure

**Florida (similar to Oklahoma, research needed per county)

**California (strict disclosure requirements, research needed)

**What We Extract (via OCR):**
- [ ] Each disclosure checkbox: true/false
- [ ] Field evidence (snippet of text for each disclosure)

**Scoring:**
- **GREEN:** All required disclosures found
- **YELLOW:** Some disclosures missing (allow remediation)
- **RED:** Critical disclosures missing (reject deal)

**Retention:** 7 years

**Stored In:** `property_documents` table (category: 'disclosure_addendum')

---

### **Document #6: Marketing Services Agreement (MSA)** ✅ IF DISTRIBUTING (PHASE 7)
**What It Is:** Agreement to market the deal on the platform
**Who Provides:** Platform generates, wholesaler signs
**When:** When wholesaler selects distribution channels (Phase 7)
**Blocks Deal?:** YES - Cannot distribute without executed MSA

**Who Signs:**
- [ ] Platform (auto-signed)
- [ ] Wholesaler or Authorized Signer

**Execution Method:** DocuSeal

**Retention:** Permanent

**Stored In:** `agreements` table (type: 'MSA', deal_id: X, status: 'executed')

---

### **Document #7: Auction Services Agreement (ASA)** ✅ IF USING AUCTION (PHASE 7)
**What It Is:** Agreement to list deal on auction platform (e.g., Hubzu)
**Who Provides:** Platform generates, wholesaler signs
**When:** If wholesaler selects "Auction Services" channel AND deal is cash
**Blocks Deal?:** YES - Cannot list on auction without executed ASA

**Specific Type:** Hubzu Auction Services Agreement

**Who Signs:**
- [ ] Platform (auto-signed)
- [ ] Wholesaler or Authorized Signer

**Execution Method:** DocuSeal

**Retention:** Permanent

**Stored In:** `agreements` table (type: 'ASA', deal_id: X, status: 'executed')

---

### **Document #8: Cancellation/Right-to-Cancel Form** ✅ REQUIRED (PHASE 10)
**What It Is:** Disclosure to seller of their right to cancel after offer acceptance
**Who Provides:** Wholesaler uploads (proof of delivery to seller)
**When:** After offer acceptance, BEFORE assignment execution
**Blocks Deal?:** YES - **CRITICAL TIMING GATE** - Assignment execution locked until this is uploaded and validated

**What We Extract (via OCR):**
- [ ] Seller Name
- [ ] Cancellation Period (e.g., "3 business days")
- [ ] **Delivery Date** (CRITICAL - when seller received this)
- [ ] Seller Acknowledgment/Signature

**Timing Validation (CRITICAL):**
```
Contract Acceptance Date < Cancellation Delivery Date < Assignment Execution Date
```

**If timing fails:** Assignment execution is BLOCKED

**Retention:** 7 years (legal protection)

**Stored In:** `property_documents` table (category: 'cancellation_disclosure')

**Legal Why:** Protects against claims that seller didn't have opportunity to cancel before assignment

---

### **Document #9: Assignment Agreement** ✅ REQUIRED (PHASE 11)
**What It Is:** Contract transferring purchase agreement from wholesaler (assignor) to end buyer (assignee)
**Who Provides:** Wholesaler uploads (after Phase 10 timing gate passes)
**When:** Assignment execution (Phase 11)
**Blocks Deal?:** YES - This completes the wholesale transaction

**What We Extract (via OCR):**
- [ ] Assignor Name (must match wholesaler LLC)
- [ ] Assignee Name (end buyer)
- [ ] Property Address (must match purchase contract)
- [ ] Assignment Fee (what wholesaler earns)
- [ ] Original Contract Date (reference to purchase contract)
- [ ] **Assignment Execution Date** (CRITICAL for timing validation)

**Who Signs:**
- [ ] Assignor (Wholesaler/LLC authorized signer)
- [ ] Assignee (End buyer)

**Timing Validation:**
```
Assignment Execution Date > Cancellation Delivery Date
```

**Retention:** 7 years

**Stored In:** `property_documents` table (category: 'assignment_agreement')

---

## 🎯 **PART 3: WHO FILLS IN WHAT (RESPONSIBILITIES)**

### **Wholesaler Responsibilities:**
✅ **Before First Deal:**
- [ ] Create account
- [ ] Create LLC profile
- [ ] Upload LLC Articles
- [ ] Upload LLC Operating Agreement
- [ ] Identify authorized signer
- [ ] Sign CSA for LLC

✅ **For Each Deal:**
- [ ] Upload purchase contract (Phase 2)
- [ ] Upload disclosure addendum (Phase 4)
- [ ] Provide seller contact info (optional but recommended)
- [ ] Select distribution channels (Phase 6)
- [ ] Sign MSA if distributing (Phase 7)
- [ ] Sign ASA if using auction (Phase 7)
- [ ] Upload cancellation form with delivery proof (Phase 10)
- [ ] Provide end buyer details (Phase 11)
- [ ] Upload assignment agreement (Phase 11)

---

### **Platform Responsibilities:**
✅ **Automated:**
- [ ] OCR extract all contract fields
- [ ] Run Phase 3 universal contract checks
- [ ] Run Phase 4 disclosure analysis
- [ ] Calculate Phase 5 compliance score (GREEN/YELLOW/RED)
- [ ] Validate Phase 10 timing (cancellation before assignment)
- [ ] Store all documents
- [ ] Create audit logs

✅ **Manual (Broker Review - Phase 8):**
- [ ] Review compliance summary
- [ ] Approve or reject distribution
- [ ] Add review notes if needed

---

### **Seller Responsibilities:**
✅ **For Each Deal:**
- [ ] Sign purchase contract
- [ ] Acknowledge receipt of cancellation disclosure (Phase 10)
- [ ] (Optional) Provide contact information for closing

---

### **End Buyer Responsibilities:**
✅ **For Assignment:**
- [ ] Provide contact information
- [ ] Sign assignment agreement (Phase 11)
- [ ] Proceed to closing

---

## 📊 **PART 4: DOCUMENT FLOW TIMELINE**

```
PHASE 0 (ONE-TIME SETUP):
├─ Wholesaler creates account
├─ Wholesaler creates LLC profile
├─ Wholesaler uploads Articles + Operating Agreement
├─ Platform verifies authorized signer
├─ Platform generates CSA
└─ Authorized signer signs CSA → ✅ READY TO SUBMIT DEALS

PHASE 2-5 (DEAL SUBMISSION & VALIDATION):
├─ Wholesaler uploads Purchase Contract
├─ Platform OCR extracts fields → Phase 3 validation
├─ Wholesaler uploads Disclosure Addendum
├─ Platform OCR checks disclosures → Phase 4 validation
└─ Platform calculates compliance score → GREEN/YELLOW/RED

PHASE 6-7 (DISTRIBUTION SETUP):
├─ Wholesaler selects channels (if status = GREEN)
├─ Platform generates MSA
├─ Wholesaler signs MSA
├─ (If auction selected) Platform generates ASA
└─ (If auction) Wholesaler signs ASA

PHASE 8-9 (REVIEW & APPROVAL):
├─ Broker (Jason) reviews compliance
├─ Broker approves or rejects
└─ If approved → Distribution begins

PHASE 10 (CANCELLATION GATE):
├─ Wholesaler uploads Cancellation Form
├─ Platform OCR extracts delivery date
├─ Platform validates timing:
│   └─ Delivery Date > Contract Acceptance Date ✅
└─ ✅ ASSIGNMENT EXECUTION UNLOCKED

PHASE 11 (ASSIGNMENT EXECUTION):
├─ Wholesaler provides end buyer details
├─ Wholesaler uploads Assignment Agreement
├─ Platform OCR extracts assignment date
├─ Platform validates timing:
│   └─ Assignment Date > Cancellation Delivery Date ✅
└─ ✅ DEAL COMPLETE
```

---

## 📋 **PART 5: PRINTABLE CHECKLIST (PER DEAL)**

**Deal ID:** ______________
**State:** ______________
**Property Address:** ______________________________________________

### **Phase 0: LLC Setup (One-Time)**
- [ ] LLC profile created
- [ ] Articles of Organization uploaded
- [ ] Operating Agreement uploaded
- [ ] Authorized signer identified
- [ ] CSA executed
- [ ] ✅ **Ready to submit deals**

### **Phase 2: Contract Upload**
- [ ] Purchase contract uploaded
- [ ] Seller name extracted: ______________
- [ ] Buyer name extracted: ______________
- [ ] Property address extracted: ______________
- [ ] Purchase price extracted: $______________
- [ ] Assignable? ☐ YES ☐ NO
- [ ] AS-IS language? ☐ YES ☐ NO

### **Phase 3: Validation Results**
- [ ] Buyer matches LLC? ☐ YES ☐ NO
- [ ] Seller matches records? ☐ YES ☐ NO
- [ ] Contract assignable? ☐ YES ☐ NO
- [ ] Contract not expired? ☐ YES ☐ NO
- [ ] **Phase 3 Status:** ☐ GREEN ☐ YELLOW ☐ RED

### **Phase 4: Disclosure Upload**
- [ ] Disclosure addendum uploaded
- [ ] Disclosure 1 found? ☐ YES ☐ NO
- [ ] Disclosure 2 found? ☐ YES ☐ NO
- [ ] Disclosure 3 found? ☐ YES ☐ NO
- [ ] (Continue for all state-required disclosures)
- [ ] **Disclosure Score:** ____/8 (Oklahoma) or ____/3 (Texas)
- [ ] **Phase 4 Status:** ☐ GREEN ☐ YELLOW ☐ RED

### **Phase 5: Overall Compliance**
- [ ] **Overall Status:** ☐ GREEN ☐ YELLOW ☐ RED
- [ ] Can distribute? ☐ YES ☐ NO

### **Phase 6-7: Distribution (If GREEN)**
- [ ] Channels selected: ☐ Funds ☐ Buyers ☐ Auction
- [ ] MSA executed? ☐ YES ☐ NO
- [ ] ASA executed (if auction)? ☐ YES ☐ NO ☐ N/A

### **Phase 8: Broker Review**
- [ ] Reviewed by: ______________
- [ ] Review date: ______________
- [ ] Decision: ☐ APPROVED ☐ REJECTED ☐ NEEDS INFO
- [ ] Notes: ______________________________________________

### **Phase 9: Distribution**
- [ ] Approved for distribution? ☐ YES ☐ NO
- [ ] Distribution date: ______________

### **Phase 10: Cancellation Form (CRITICAL)**
- [ ] Cancellation form uploaded
- [ ] Delivery date extracted: ______________
- [ ] Contract acceptance date: ______________
- [ ] Seller acknowledged? ☐ YES ☐ NO
- [ ] Timing valid? (Delivery > Acceptance) ☐ YES ☐ NO
- [ ] Can execute assignment? ☐ YES ☐ NO

### **Phase 11: Assignment Execution**
- [ ] End buyer details entered
- [ ] Assignee name: ______________
- [ ] Assignment fee: $______________
- [ ] Assignment agreement uploaded
- [ ] Assignment date extracted: ______________
- [ ] Timing valid? (Assignment > Cancellation) ☐ YES ☐ NO
- [ ] ✅ **DEAL COMPLETE**

---

## 💰 **PART 6: COST BREAKDOWN (WHO PAYS WHAT)**

| Item | Cost | Who Pays |
|------|------|----------|
| **LLC Formation** | $50-300 | Wholesaler (one-time) |
| **CSA Execution** | $0 | Platform provides |
| **OCR Extraction** | $0.01-0.10/doc | Platform (built into fees) |
| **MSA/ASA Execution** | $0 | Platform provides |
| **DocuSeal E-Signatures** | $0 | Platform provides |
| **Platform Fee** | X% of assignment fee | Wholesaler (at closing) |
| **Closing Costs** | Varies | Buyer/Seller (per contract) |

---

## ⏱️ **PART 7: TIME ESTIMATES**

| Task | Time Required | Who |
|------|---------------|-----|
| **LLC Setup (One-Time)** | 30-60 min | Wholesaler |
| **Upload Purchase Contract** | 5 min | Wholesaler |
| **OCR Extraction** | 10-20 sec | Platform (auto) |
| **Phase 3-5 Validation** | 10-30 sec | Platform (auto) |
| **Upload Disclosure** | 5 min | Wholesaler |
| **Sign MSA/ASA** | 2-5 min | Wholesaler |
| **Broker Review** | 5-10 min | Broker (Jason) |
| **Upload Cancellation Form** | 5 min | Wholesaler |
| **Upload Assignment** | 5 min | Wholesaler |
| **TOTAL PER DEAL** | **~30-45 min** | (mostly automated) |

---

## 🚨 **PART 8: COMMON BLOCKERS & SOLUTIONS**

| Blocker | Solution |
|---------|----------|
| **"Can't submit deal"** | Check: LLC complete? CSA executed? |
| **"Contract not assignable (RED)"** | Verify "and/or assigns" in buyer name |
| **"Buyer doesn't match LLC (RED)"** | Check buyer name vs LLC legal name (exact match) |
| **"Missing disclosures (YELLOW/RED)"** | Upload corrected disclosure addendum |
| **"Can't distribute (YELLOW status)"** | Fix disclosure issues → re-upload → revalidate |
| **"Can't execute assignment"** | Check: Cancellation form uploaded? Timing valid? |
| **"Timing validation failed"** | Ensure: Acceptance < Cancellation < Assignment dates |

---

**Print this checklist for every deal to ensure 100% compliance!**

---

*Last Updated: January 2026*
*Version: 1.0 - Oklahoma Pilot*
