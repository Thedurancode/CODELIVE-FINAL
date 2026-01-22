# AI Agent Prompt: Generate State/County Compliance Requirements

## PURPOSE
This prompt template allows an AI agent to automatically generate complete compliance requirements, database schemas, and validation rules for any US state or county wholesale real estate regulations.

---

## 🤖 **MASTER PROMPT TEMPLATE**

Copy this entire prompt and replace `{{STATE}}` and `{{COUNTY}}` with the target jurisdiction:

```
You are a real estate compliance expert and software architect. Your task is to analyze {{STATE}} ({{COUNTY}} County, if applicable) wholesale real estate regulations and generate a complete compliance system specification.

## INPUT INFORMATION
State: {{STATE}}
County: {{COUNTY}} (if applicable)
Deal Type: Wholesale Assignment
Transaction Scope: Single-state pilot

## YOUR TASK
Generate a comprehensive compliance specification document that includes:

### 1. REQUIRED CONTACTS (Per Property)
For each contact type, specify:
- Contact category and role
- When collected (which phase)
- Required fields (name, email, phone, address, SSN/EIN, etc.)
- Validation rules
- Database table/field to store
- Blocking rules (can submission proceed without this contact?)

Contact categories to analyze:
- Wholesaler/Submitter
- LLC Entity (if required by state)
- Authorized Signers
- Property Seller/Owner
- End Buyer (Assignee)
- Agents/Brokers (if required)
- Title Company
- Attorneys (if required)
- Other state-specific parties

### 2. REQUIRED CONTRACTS/DOCUMENTS (Per Deal)
For each document type, specify:
- Document name (official state/county name)
- Required or optional?
- When required (which phase)
- What to extract via OCR (specific fields)
- Validation rules
- Storage location
- Retention period (compliance)

Document categories to analyze:
- LLC Formation Documents
- Purchase Agreement (wholesale/assignment version)
- State-specific disclosure addendums
- Seller disclosures
- Buyer disclosures
- Cancellation/rescission notices
- Assignment agreements
- Distribution agreements
- Broker agreements
- Any state/county-specific forms

### 3. COMPLIANCE RULES (By Phase)
For each phase of the workflow (0-11), specify:
- Rule ID (e.g., {{STATE}}-P0-R1)
- Rule description
- What is being validated
- Validation logic (code-ready)
- Enforcement method (frontend, backend, database)
- Blocking? (YES/NO)
- Audit logged? (YES/NO)

Phases to analyze:
- Phase 0: Entity/LLC Requirements
- Phase 2: Initial Submission
- Phase 3: Universal Contract Checks
- Phase 4: State-Specific Disclosures
- Phase 5: Compliance Scoring
- Phase 6: Distribution Channel Rules
- Phase 7: Agreement Requirements
- Phase 8: Review Requirements
- Phase 9: Distribution Approval
- Phase 10: Pre-Assignment Requirements (timing gates, etc.)
- Phase 11: Assignment Execution

### 4. STATE-SPECIFIC DISCLOSURE REQUIREMENTS
List ALL mandatory disclosures required by {{STATE}} law for wholesale assignments:
- Disclosure name
- Legal citation (if known)
- Required wording or substance
- OCR detection strategy (keywords, patterns)
- Penalty for non-compliance

### 5. TIMING REQUIREMENTS
Identify any timing-critical requirements:
- When must disclosures be delivered?
- What must happen BEFORE what?
- Cooling-off periods
- Cancellation/rescission periods
- Recording deadlines

### 6. DATABASE SCHEMA REQUIREMENTS
Generate SQL table specifications for:
- Contact tables (if different from Oklahoma)
- Document tracking
- Compliance tracking table (state-specific fields)
- Workflow state table
- Any state-specific tables needed

### 7. BLOCKING GATES
Identify all hard gates where the deal CANNOT proceed:
- Gate name
- Phase where it occurs
- Blocking condition
- What must be satisfied to unblock

### 8. SCORING RULES
Define GREEN/YELLOW/RED scoring logic:
- What makes a deal GREEN (fully compliant)?
- What makes a deal YELLOW (remediable issues)?
- What makes a deal RED (non-compliant, reject)?

### 9. UNIQUE STATE REQUIREMENTS
Identify any {{STATE}}-specific requirements not covered above:
- Licensing requirements
- Attorney review requirements
- Recording requirements
- Notarization requirements
- Witnesses required
- Specific forms mandated by state law

## OUTPUT FORMAT

Structure your response as a detailed markdown document with these sections:

# {{STATE}} Wholesale Deal Compliance Specification

## 1. Overview
- State: {{STATE}}
- County: {{COUNTY}} (if applicable)
- Deal Type: Wholesale Assignment
- Key Regulations: [List relevant statutes]

## 2. Required Contacts
[Table format matching Oklahoma compliance matrix]

## 3. Required Documents
[Table format matching Oklahoma compliance matrix]

## 4. Compliance Rules by Phase
[Detailed rules for each phase]

## 5. State-Specific Disclosures
[Complete list with OCR detection strategy]

## 6. Timing Requirements
[Timeline diagram with critical dates]

## 7. Database Schema
[SQL CREATE TABLE statements]

## 8. Blocking Gates
[Table of all hard gates]

## 9. Scoring Logic
[GREEN/YELLOW/RED rules]

## 10. Implementation Checklist
[Step-by-step checklist like Oklahoma]

## 11. Extraction Profiles Needed
[List of OCR profiles to create]

## RESEARCH INSTRUCTIONS

1. **Search for {{STATE}} statutes on:**
   - Wholesale real estate assignments
   - Equitable interest transfers
   - Buyer/seller disclosure requirements
   - Contract assignment regulations
   - Real estate licensing exemptions

2. **Search for {{COUNTY}} local ordinances on:**
   - Additional disclosure requirements
   - Recording requirements
   - Transfer taxes
   - Local business licensing

3. **Research common {{STATE}} forms:**
   - Standard purchase agreement
   - Assignment addendum
   - Wholesale disclosure forms
   - Seller disclosure forms

4. **Identify {{STATE}}-specific terms:**
   - Does {{STATE}} use "Grantor/Grantee" or "Seller/Buyer"?
   - Does {{STATE}} use "Close of Escrow" or "Closing Date"?
   - State-specific real estate terminology

5. **Check for attorney/broker requirements:**
   - Must deals be reviewed by attorneys?
   - Are brokers required to be involved?
   - Are there licensing requirements for wholesalers?

## VALIDATION

Ensure your specification includes:
- ✅ At least 3 contact types
- ✅ At least 5 required documents
- ✅ At least 20 compliance rules
- ✅ At least 3 blocking gates
- ✅ Complete database schema
- ✅ GREEN/YELLOW/RED scoring logic
- ✅ State-specific disclosure list (minimum 3)
- ✅ Implementation checklist
- ✅ Extraction profile specifications

## CRITICAL REQUIREMENTS

1. **All rules must be code-ready:**
   - Include exact validation logic
   - Specify database fields
   - Provide regex patterns for OCR

2. **All timing must be explicit:**
   - Use specific date comparisons
   - Define "before" and "after" clearly
   - Account for business days vs calendar days

3. **All documents must have OCR specs:**
   - List fields to extract
   - Provide field label synonyms
   - Give regex hints

4. **All compliance must be auditable:**
   - Every check must log to audit table
   - Include timestamp requirements
   - Specify retention periods

## EXAMPLE VALIDATION RULE

Here's an example of the detail required:

### Rule: {{STATE}}-P3-R1 - Buyer Matches LLC

**Description:** Buyer name on contract must match selected LLC legal name

**Validation Logic:**
```typescript
const extractedBuyerName = ocrResult.buyerName; // From OCR
const selectedLLC = await LLCProfile.findByPk(deal.selectedLlcId);

// Normalize names
const normalizedBuyer = extractedBuyerName.toUpperCase().trim();
const normalizedLLC = selectedLLC.legalName.toUpperCase().trim();

// Check if buyer includes LLC name (may have "and/or assigns")
if (!normalizedBuyer.includes(normalizedLLC)) {
  return {
    passed: false,
    status: 'RED',
    error: `Buyer name "${extractedBuyerName}" does not match selected LLC "${selectedLLC.legalName}"`,
    blocking: true
  };
}
```

**Database Fields:**
- `oklahoma_deal_compliance.buyer_matches_llc` (BOOLEAN)
- `oklahoma_deal_compliance.phase3_details` (JSONB) - stores full comparison

**Audit Log:**
```sql
INSERT INTO compliance_audit_log (
  deal_id, event_type, severity, details
) VALUES (
  #{deal_id}, '{{STATE}}_buyer_llc_check', 'critical',
  jsonb_build_object(
    'extracted_buyer', #{extractedBuyerName},
    'selected_llc', #{selectedLLC.legalName},
    'match', #{passed}
  )
);
```

**Blocking:** YES - Cannot proceed if buyer doesn't match LLC

**Enforcement:** Backend validation after OCR extraction

---

Now generate the complete specification for {{STATE}} ({{COUNTY}} County).
```

---

## 📋 **HOW TO USE THIS PROMPT**

### **Step 1: Choose Your State/County**
```
State: Texas
County: Harris
```

### **Step 2: Replace Variables**
```
Find: {{STATE}}
Replace with: Texas

Find: {{COUNTY}}
Replace with: Harris
```

### **Step 3: Run the Prompt**
Copy the modified prompt and send it to:
- GPT-4 (OpenAI)
- Claude (Anthropic)
- Gemini (Google)

### **Step 4: Review Output**
The AI will generate a complete specification document including:
- All required contacts
- All required documents
- All compliance rules
- Database schema
- Validation code
- Implementation checklist

### **Step 5: Implement**
Use the generated specification to:
1. Create database migration
2. Create Sequelize models
3. Create extraction profiles
4. Create validation service
5. Create API endpoints
6. Build frontend forms

---

## 🎯 **EXAMPLE USAGE**

### **For Texas (Harris County):**
```
You are a real estate compliance expert and software architect. Your task is to analyze Texas (Harris County) wholesale real estate regulations and generate a complete compliance system specification.

[... rest of prompt ...]
```

### **For Florida (Miami-Dade County):**
```
You are a real estate compliance expert and software architect. Your task is to analyze Florida (Miami-Dade County) wholesale real estate regulations and generate a complete compliance system specification.

[... rest of prompt ...]
```

### **For California (Los Angeles County):**
```
You are a real estate compliance expert and software architect. Your task is to analyze California (Los Angeles County) wholesale real estate regulations and generate a complete compliance system specification.

[... rest of prompt ...]
```

---

## 📊 **WHAT YOU'LL GET**

The AI will generate a document (usually 30-50 pages) containing:

### **1. Complete Compliance Matrix**
- All required contacts with validation rules
- All required documents with OCR specs
- All compliance rules (usually 30-50 rules)
- State-specific disclosures

### **2. Ready-to-Run Code**
- SQL migration file
- Sequelize model definitions
- Validation functions
- OCR extraction profiles

### **3. Implementation Guide**
- Step-by-step checklist
- Phase-by-phase implementation
- Testing instructions
- Deployment guide

### **4. Business Logic**
- GREEN/YELLOW/RED scoring
- Blocking gate definitions
- Timing validation logic
- Audit requirements

---

## ⚡ **ADVANCED: Batch Generation**

### **Generate for Multiple States at Once**

Create a script that runs the prompt for each state:

```typescript
const states = [
  { state: 'Texas', county: 'Harris' },
  { state: 'Texas', county: 'Dallas' },
  { state: 'Florida', county: 'Miami-Dade' },
  { state: 'California', county: 'Los Angeles' },
  { state: 'Arizona', county: 'Maricopa' },
  { state: 'Georgia', county: 'Fulton' },
];

for (const { state, county } of states) {
  const prompt = masterPrompt
    .replace(/\{\{STATE\}\}/g, state)
    .replace(/\{\{COUNTY\}\}/g, county);

  const result = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1, // Low temperature for consistency
  });

  // Save to file
  fs.writeFileSync(
    `./compliance-specs/${state}-${county}-compliance.md`,
    result.choices[0].message.content
  );
}
```

---

## 🔧 **CUSTOMIZATION OPTIONS**

### **Add Transaction Types**
Modify the prompt to handle different deal types:
```
Deal Types to analyze:
- Wholesale Assignment
- Novation
- Wholetail (Fix & Flip)
- Subject-To
- Owner Finance
```

### **Add Party Types**
Include additional parties:
```
Additional parties to analyze:
- Hard money lenders
- Private lenders
- JV partners
- Bird dogs
- Wholesaler assistants
```

### **Add Compliance Areas**
Expand compliance coverage:
```
Additional compliance areas:
- Fair Housing Act compliance
- RESPA compliance
- TILA compliance
- State licensing requirements
- Local business licensing
```

---

## ✅ **VALIDATION CHECKLIST**

After AI generates the specification, verify:

- [ ] All database tables have proper indexes
- [ ] All foreign keys are defined
- [ ] All validation rules have code examples
- [ ] All OCR extractions have field labels + regex
- [ ] All timing rules use date comparisons
- [ ] All blocking gates are clearly identified
- [ ] All audit logging is specified
- [ ] GREEN/YELLOW/RED scoring is complete
- [ ] State-specific terms are identified
- [ ] Implementation checklist is actionable

---

## 💡 **TIPS FOR BEST RESULTS**

1. **Be Specific About Sources:**
   ```
   Research {{STATE}} Statutes:
   - Title 47 (real estate)
   - Administrative Code Chapter 535
   - Case law on wholesale assignments
   ```

2. **Request Code Examples:**
   ```
   For each validation rule, provide:
   - TypeScript validation function
   - SQL audit log insertion
   - Test cases (passing and failing)
   ```

3. **Ask for Edge Cases:**
   ```
   Identify edge cases for {{STATE}}:
   - What if buyer is a trust?
   - What if seller is deceased (estate)?
   - What if property is in foreclosure?
   ```

4. **Request Comparison:**
   ```
   Compare {{STATE}} requirements to Oklahoma:
   - What's similar?
   - What's unique to {{STATE}}?
   - What's stricter/looser?
   ```

---

## 📁 **OUTPUT FILE STRUCTURE**

The AI will generate files for:

```
compliance-specs/
├── {STATE}-{COUNTY}-compliance-matrix.md
├── {STATE}-{COUNTY}-database-schema.sql
├── {STATE}-{COUNTY}-extraction-profiles.ts
├── {STATE}-{COUNTY}-validation-rules.ts
├── {STATE}-{COUNTY}-implementation-checklist.md
└── {STATE}-{COUNTY}-api-endpoints.ts
```

---

## 🚀 **QUICK START EXAMPLES**

### **Texas Example:**
```bash
# 1. Generate spec
AI_PROMPT="Generate Texas compliance spec" | gpt4

# 2. Review output
cat texas-harris-compliance-matrix.md

# 3. Run migration
npm run migrate -- texas-harris

# 4. Seed profiles
npm run seed:extraction-profiles -- texas

# 5. Test
npm run test:compliance -- texas
```

---

## 🎓 **LEARNING FROM OUTPUT**

Use the AI-generated specs to:

1. **Understand State Variations:**
   - Compare TX vs FL vs CA
   - Identify common patterns
   - Build reusable components

2. **Build Template Library:**
   - Extract common rules
   - Create base classes
   - Share validation logic

3. **Automate Testing:**
   - Generate test cases from rules
   - Create mock documents
   - Build regression suite

---

**Last Updated:** January 2026
**Version:** 1.0
**Tested With:** GPT-4, Claude Opus 4, Gemini Pro

---

**Ready to generate compliance for any state in 5 minutes!** 🚀
