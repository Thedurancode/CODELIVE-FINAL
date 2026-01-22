# Oklahoma Wholesale Deal Extraction - Implementation Checklist

Complete step-by-step checklist for implementing the Oklahoma extraction profile system.

---

## 📋 PHASE 0: System Setup (Day 1 - 2 hours)

### Prerequisites Check
- [ ] PostgreSQL database running
- [ ] OpenAI API key configured in `.env`
- [ ] Backend server can start without errors
- [ ] All dependencies installed

**Commands:**
```bash
cd backend

# Verify setup
npm run validate:extraction

# If errors, fix them:
npm install pdfjs-dist @napi-rs/canvas tesseract.js
```

### Database Setup
- [ ] Run migration to create `compliance_extraction_profiles` table
- [ ] Seed Oklahoma extraction profiles
- [ ] Verify profiles were created

**Commands:**
```bash
# Run migration
npm run migrate

# Seed profiles (creates all 4 Oklahoma profiles)
npm run seed:extraction-profiles

# Verify Oklahoma profiles exist
node -e "
const { default: ComplianceExtractionProfile } = require('./dist/models/ComplianceExtractionProfile');
const { default: sequelize } = require('./dist/config/database');

(async () => {
  await sequelize.authenticate();
  const profiles = await ComplianceExtractionProfile.findAll({ where: { state: 'OK' } });
  console.log('Oklahoma Profiles:', profiles.length);
  profiles.forEach(p => console.log('  ✓', p.name));
  await sequelize.close();
})();
"
```

**Expected Output:**
```
Oklahoma Profiles: 4
  ✓ Oklahoma Purchase Agreement (Wholesale)
  ✓ Oklahoma Assignment Agreement
  ✓ Oklahoma Wholesale Disclosure Addendum
  ✓ Oklahoma Cancellation/Right-to-Cancel Form
```

### API Verification
- [ ] Start backend server
- [ ] Test extraction profiles API endpoint
- [ ] Verify Oklahoma profiles are returned

**Commands:**
```bash
# Start server
npm run dev

# In another terminal, test API
curl http://localhost:3001/api/compliance/extraction-profiles?state=OK \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" | jq

# Should return 4 Oklahoma profiles
```

---

## 📋 PHASE 1: Document Preparation (Day 1 - 1 hour)

### Collect Sample Oklahoma Documents
- [ ] **Purchase Contract** - Oklahoma wholesale purchase agreement
  - Must include "and/or assigns" language
  - Must have AS-IS clause
  - Must show assignment rights

- [ ] **Disclosure Addendum** - Oklahoma wholesale disclosure form
  - Should contain all 8 required disclosures:
    - ✓ Buyer not a licensed broker
    - ✓ Acting as principal
    - ✓ Equitable interest only
    - ✓ Intent to assign
    - ✓ Assignment compensation
    - ✓ Due diligence period
    - ✓ No performance guarantee
    - ✓ Independent advice right

- [ ] **Cancellation Form** - Seller right-to-cancel disclosure
  - Must show delivery date
  - Must show seller signature/acknowledgment
  - Must show cancellation period

- [ ] **Assignment Agreement** - Actual assignment contract
  - Must show assignor and assignee
  - Must show assignment fee
  - Must show assignment execution date

**Organize files:**
```bash
mkdir -p backend/test-contracts/oklahoma

# Place your sample documents:
# - purchase-contract.pdf
# - disclosure-addendum.pdf
# - cancellation-form.pdf
# - assignment-agreement.pdf
```

---

## 📋 PHASE 2: Testing with Real Documents (Day 1-2 - 3 hours)

### Test 1: Purchase Contract Extraction
- [ ] Run extraction on Oklahoma purchase contract
- [ ] Verify all required fields extracted
- [ ] Check confidence score (should be >75%)
- [ ] Verify `assignable` = true
- [ ] Verify `asIsLanguage` = true

**Commands:**
```bash
npm run test:extraction \
  test-contracts/oklahoma/purchase-contract.pdf \
  OK \
  purchase_contract
```

**Success Criteria:**
- ✅ Confidence > 75%
- ✅ sellerName extracted
- ✅ buyerName extracted (with "and/or assigns")
- ✅ propertyAddress extracted
- ✅ purchasePrice extracted
- ✅ closingDate extracted
- ✅ assignable = true
- ✅ asIsLanguage = true

**If extraction fails:**
- [ ] Review `fieldEvidence` to see what was found
- [ ] Check if contract uses different terminology
- [ ] Update profile field labels if needed (see troubleshooting section)

### Test 2: Disclosure Addendum Extraction
- [ ] Run extraction on disclosure addendum
- [ ] Verify all 8 disclosures detected
- [ ] Check `overallCompliance` score
- [ ] Review `fieldEvidence` for each disclosure

**Commands:**
```bash
npm run test:extraction \
  test-contracts/oklahoma/disclosure-addendum.pdf \
  OK \
  disclosure_addendum
```

**Success Criteria:**
- ✅ Confidence > 80%
- ✅ All 8 disclosure fields = true:
  - notLicensedBroker
  - actingAsPrincipal
  - equitableInterestOnly
  - intentToAssign
  - assignmentCompensation
  - dueDiligencePeriod
  - noPerformanceGuarantee
  - independentAdviceRight
- ✅ overallCompliance = "GREEN"

**If compliance is YELLOW or RED:**
- [ ] Review which disclosures are missing
- [ ] Check if your form uses different wording
- [ ] Update profile with alternative labels (see troubleshooting)
- [ ] Or add missing disclosures to your standard form

### Test 3: Cancellation Form Extraction
- [ ] Run extraction on cancellation form
- [ ] Verify delivery date extracted (CRITICAL!)
- [ ] Verify seller acknowledgment detected
- [ ] Verify cancellation period extracted

**Commands:**
```bash
npm run test:extraction \
  test-contracts/oklahoma/cancellation-form.pdf \
  OK \
  cancellation_disclosure
```

**Success Criteria:**
- ✅ Confidence > 75%
- ✅ deliveryDate extracted (in YYYY-MM-DD format)
- ✅ acknowledgmentSignature = true
- ✅ rightToCancelPeriod extracted (e.g., "3 business days")
- ✅ sellerName extracted

**If delivery date not found:**
- [ ] Check date format in your form
- [ ] Update regex hint to match your format
- [ ] Consider allowing manual date entry as fallback

### Test 4: Assignment Agreement Extraction
- [ ] Run extraction on assignment agreement
- [ ] Verify assignor and assignee extracted
- [ ] Verify assignment fee extracted
- [ ] Verify assignment date extracted (CRITICAL for timing!)

**Commands:**
```bash
npm run test:extraction \
  test-contracts/oklahoma/assignment-agreement.pdf \
  OK \
  assignment_addendum
```

**Success Criteria:**
- ✅ Confidence > 70%
- ✅ sellerName (assignor) extracted
- ✅ buyerName (assignee) extracted
- ✅ assignmentFee extracted
- ✅ assignmentDate extracted (in YYYY-MM-DD format)
- ✅ propertyAddress extracted

---

## 📋 PHASE 3: Backend Integration (Day 2-3 - 4 hours)

### Create Oklahoma Compliance Service
- [ ] Create `backend/src/services/OklahomaComplianceService.ts`
- [ ] Implement Phase 3 universal contract checks
- [ ] Implement Phase 4 disclosure analysis
- [ ] Implement Phase 5 compliance scoring
- [ ] Implement Phase 10 timing validation

**File to create:** `backend/src/services/OklahomaComplianceService.ts`

```typescript
/**
 * Oklahoma Wholesale Deal Compliance Service
 *
 * Implements the 11-phase Oklahoma wholesale workflow with:
 * - Universal contract checks (Phase 3)
 * - Disclosure analysis (Phase 4)
 * - Compliance scoring (Phase 5)
 * - Cancellation timing validation (Phase 10)
 */

import { complianceOCRService } from './ComplianceOCRService';
import ComplianceCheck from '../models/ComplianceCheck';
import ComplianceAlert from '../models/ComplianceAlert';

interface Phase3CheckResult {
  passed: boolean;
  status: 'GREEN' | 'YELLOW' | 'RED';
  issues: string[];
  details: any;
}

interface Phase4DisclosureResult {
  overallCompliance: 'GREEN' | 'YELLOW' | 'RED';
  missingDisclosures: string[];
  foundDisclosures: string[];
  details: any;
}

interface Phase10TimingResult {
  valid: boolean;
  canProceedWithAssignment: boolean;
  issues: string[];
  timeline: {
    contractAcceptanceDate: string;
    cancellationDeliveryDate: string;
    assignmentExecutionDate?: string;
  };
}

class OklahomaComplianceService {

  /**
   * PHASE 3: Universal Contract Checks
   * Validates contract meets basic Oklahoma wholesale requirements
   */
  async runPhase3Checks(
    contractBuffer: Buffer,
    selectedLLC: { name: string; authorizedSigner: string },
    mimeType?: string
  ): Promise<Phase3CheckResult> {

    // Extract contract fields
    const extraction = await complianceOCRService.extractContractFields(
      contractBuffer,
      mimeType,
      'OK',
      undefined,
      'purchase_contract'
    );

    const issues: string[] = [];
    let status: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';

    // Check 1: Buyer name matches selected LLC
    if (!extraction.buyerName?.includes(selectedLLC.name)) {
      issues.push(`Buyer name "${extraction.buyerName}" does not match selected LLC "${selectedLLC.name}"`);
      status = 'RED';
    }

    // Check 2: Seller name present
    if (!extraction.sellerName) {
      issues.push('Seller name not found in contract');
      status = 'RED';
    }

    // Check 3: Assignment language present
    if (!extraction.assignable) {
      issues.push('Contract does not allow assignment - non-assignable contracts cannot be wholesaled');
      status = 'RED';
    }

    // Check 4: AS-IS language present (critical for wholesale)
    if (!(extraction as any).asIsLanguage) {
      issues.push('Missing AS-IS purchase language - required for wholesale deals');
      status = 'RED';
    }

    // Check 5: Contract not expired
    if (extraction.contractExpirationDate) {
      const expirationDate = new Date(extraction.contractExpirationDate);
      if (expirationDate < new Date()) {
        issues.push(`Contract expired on ${extraction.contractExpirationDate}`);
        status = 'RED';
      }
    }

    // Check 6: Marketing clause found (allows wholesaling during inspection period)
    if (!extraction.marketingClauseFound) {
      issues.push('No marketing/inspection period found - may limit ability to market deal');
      if (status === 'GREEN') status = 'YELLOW'; // Warning only
    }

    // Log compliance check
    await ComplianceCheck.create({
      checkType: 'oklahoma_phase3_universal',
      status: status === 'GREEN' ? 'pass' : status === 'YELLOW' ? 'warning' : 'fail',
      details: {
        extraction,
        issues,
        llcValidation: {
          selectedLLC: selectedLLC.name,
          contractBuyer: extraction.buyerName,
          match: extraction.buyerName?.includes(selectedLLC.name)
        }
      }
    });

    return {
      passed: status !== 'RED',
      status,
      issues,
      details: extraction
    };
  }

  /**
   * PHASE 4: Oklahoma-Specific Disclosure Analysis
   * Checks for all 8 required Oklahoma wholesale disclosures
   */
  async runPhase4DisclosureAnalysis(
    disclosureBuffer: Buffer,
    mimeType?: string
  ): Promise<Phase4DisclosureResult> {

    // Extract disclosure fields
    const extraction = await complianceOCRService.extractContractFields(
      disclosureBuffer,
      mimeType,
      'OK',
      undefined,
      'disclosure_addendum'
    );

    const requiredDisclosures = [
      'notLicensedBroker',
      'actingAsPrincipal',
      'equitableInterestOnly',
      'intentToAssign',
      'assignmentCompensation',
      'dueDiligencePeriod',
      'noPerformanceGuarantee',
      'independentAdviceRight'
    ];

    const foundDisclosures: string[] = [];
    const missingDisclosures: string[] = [];

    for (const disclosure of requiredDisclosures) {
      if ((extraction as any)[disclosure] === true) {
        foundDisclosures.push(disclosure);
      } else {
        missingDisclosures.push(disclosure);
      }
    }

    // Determine overall compliance
    let overallCompliance: 'GREEN' | 'YELLOW' | 'RED';
    if (foundDisclosures.length === 8) {
      overallCompliance = 'GREEN';
    } else if (foundDisclosures.length >= 5) {
      overallCompliance = 'YELLOW';
    } else {
      overallCompliance = 'RED';
    }

    // Log compliance check
    await ComplianceCheck.create({
      checkType: 'oklahoma_phase4_disclosures',
      status: overallCompliance === 'GREEN' ? 'pass' : overallCompliance === 'YELLOW' ? 'warning' : 'fail',
      details: {
        extraction,
        foundDisclosures,
        missingDisclosures,
        score: `${foundDisclosures.length}/8`
      }
    });

    // Create alert if non-compliant
    if (overallCompliance === 'RED') {
      await ComplianceAlert.create({
        alertType: 'missing_disclosures',
        severity: 'high',
        status: 'active',
        message: `Missing ${missingDisclosures.length} critical Oklahoma disclosures`,
        details: {
          missingDisclosures,
          action: 'Upload complete disclosure addendum with all 8 required disclosures'
        }
      });
    }

    return {
      overallCompliance,
      missingDisclosures,
      foundDisclosures,
      details: extraction
    };
  }

  /**
   * PHASE 5: Compliance Scoring
   * Returns GREEN/YELLOW/RED based on contract + disclosure analysis
   */
  async runPhase5Scoring(
    phase3Result: Phase3CheckResult,
    phase4Result: Phase4DisclosureResult
  ): Promise<'GREEN' | 'YELLOW' | 'RED'> {

    // RED if either phase is RED
    if (phase3Result.status === 'RED' || phase4Result.overallCompliance === 'RED') {
      return 'RED';
    }

    // YELLOW if either phase is YELLOW
    if (phase3Result.status === 'YELLOW' || phase4Result.overallCompliance === 'YELLOW') {
      return 'YELLOW';
    }

    // GREEN only if both phases are GREEN
    return 'GREEN';
  }

  /**
   * PHASE 10: Pre-Assignment Cancellation Disclosure Gate
   * CRITICAL: Validates timing of cancellation disclosure delivery
   */
  async runPhase10TimingValidation(
    cancellationFormBuffer: Buffer,
    contractAcceptanceDate: Date,
    attemptedAssignmentDate?: Date,
    mimeType?: string
  ): Promise<Phase10TimingResult> {

    // Extract cancellation form
    const extraction = await complianceOCRService.extractContractFields(
      cancellationFormBuffer,
      mimeType,
      'OK',
      undefined,
      'cancellation_disclosure'
    );

    const issues: string[] = [];

    // Critical field: delivery date
    if (!extraction.deliveryDate) {
      issues.push('CRITICAL: Cancellation form delivery date not found - cannot validate timing');
      return {
        valid: false,
        canProceedWithAssignment: false,
        issues,
        timeline: {
          contractAcceptanceDate: contractAcceptanceDate.toISOString().split('T')[0],
          cancellationDeliveryDate: 'UNKNOWN'
        }
      };
    }

    const cancellationDeliveryDate = new Date(extraction.deliveryDate);

    // Validation 1: Cancellation must be delivered AFTER contract acceptance
    if (cancellationDeliveryDate <= contractAcceptanceDate) {
      issues.push(
        `Cancellation disclosure delivered on ${extraction.deliveryDate} ` +
        `BEFORE contract acceptance on ${contractAcceptanceDate.toISOString().split('T')[0]} - INVALID`
      );
    }

    // Validation 2: Seller must have acknowledged receipt
    if (!(extraction as any).acknowledgmentSignature) {
      issues.push('Seller has not acknowledged receipt of cancellation disclosure');
    }

    // Validation 3: If assignment date provided, it must be AFTER cancellation delivery
    if (attemptedAssignmentDate) {
      if (attemptedAssignmentDate <= cancellationDeliveryDate) {
        issues.push(
          `Assignment execution attempted on ${attemptedAssignmentDate.toISOString().split('T')[0]} ` +
          `BEFORE seller received cancellation disclosure on ${extraction.deliveryDate} - BLOCKED`
        );
      }
    }

    const valid = issues.length === 0;

    // Log compliance check
    await ComplianceCheck.create({
      checkType: 'oklahoma_phase10_timing',
      status: valid ? 'pass' : 'fail',
      details: {
        extraction,
        timeline: {
          contractAcceptanceDate: contractAcceptanceDate.toISOString().split('T')[0],
          cancellationDeliveryDate: extraction.deliveryDate,
          assignmentExecutionDate: attemptedAssignmentDate?.toISOString().split('T')[0]
        },
        issues
      }
    });

    // Create alert if timing invalid
    if (!valid) {
      await ComplianceAlert.create({
        alertType: 'timing_violation',
        severity: 'critical',
        status: 'active',
        message: 'Oklahoma cancellation disclosure timing violation',
        details: {
          issues,
          action: 'Assignment execution BLOCKED until timing requirements are met'
        }
      });
    }

    return {
      valid,
      canProceedWithAssignment: valid,
      issues,
      timeline: {
        contractAcceptanceDate: contractAcceptanceDate.toISOString().split('T')[0],
        cancellationDeliveryDate: extraction.deliveryDate,
        assignmentExecutionDate: attemptedAssignmentDate?.toISOString().split('T')[0]
      }
    };
  }

  /**
   * Complete Oklahoma Deal Validation
   * Runs all phases and returns overall deal status
   */
  async validateOklahomaDeal(params: {
    purchaseContractBuffer: Buffer;
    disclosureAddendumBuffer: Buffer;
    cancellationFormBuffer?: Buffer;
    selectedLLC: { name: string; authorizedSigner: string };
    contractAcceptanceDate: Date;
    mimeType?: string;
  }): Promise<{
    overallStatus: 'GREEN' | 'YELLOW' | 'RED';
    phase3: Phase3CheckResult;
    phase4: Phase4DisclosureResult;
    phase5: 'GREEN' | 'YELLOW' | 'RED';
    phase10?: Phase10TimingResult;
    canDistribute: boolean;
    canExecuteAssignment: boolean;
  }> {

    // Phase 3: Universal contract checks
    const phase3 = await this.runPhase3Checks(
      params.purchaseContractBuffer,
      params.selectedLLC,
      params.mimeType
    );

    // Phase 4: Disclosure analysis
    const phase4 = await this.runPhase4DisclosureAnalysis(
      params.disclosureAddendumBuffer,
      params.mimeType
    );

    // Phase 5: Overall scoring
    const phase5 = await this.runPhase5Scoring(phase3, phase4);

    // Phase 10: Timing validation (if cancellation form provided)
    let phase10: Phase10TimingResult | undefined;
    if (params.cancellationFormBuffer) {
      phase10 = await this.runPhase10TimingValidation(
        params.cancellationFormBuffer,
        params.contractAcceptanceDate,
        undefined,
        params.mimeType
      );
    }

    // Determine permissions
    const canDistribute = phase5 === 'GREEN'; // Only GREEN deals can be distributed
    const canExecuteAssignment = phase10?.canProceedWithAssignment ?? false;

    return {
      overallStatus: phase5,
      phase3,
      phase4,
      phase5,
      phase10,
      canDistribute,
      canExecuteAssignment
    };
  }
}

export const oklahomaComplianceService = new OklahomaComplianceService();
```

### Create API Endpoints
- [ ] Create `backend/src/routes/oklahomaRoutes.ts`
- [ ] Add routes for each phase
- [ ] Add route for complete validation

**File to create:** `backend/src/routes/oklahomaRoutes.ts`

```typescript
import { Router } from 'express';
import multer from 'multer';
import { oklahomaComplianceService } from '../services/OklahomaComplianceService';
import { authenticate } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/oklahoma/validate-contract
 * Phase 3: Universal Contract Checks
 */
router.post(
  '/validate-contract',
  authenticate,
  upload.single('contract'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Contract file required' });
      }

      const selectedLLC = {
        name: req.body.llcName,
        authorizedSigner: req.body.authorizedSigner
      };

      const result = await oklahomaComplianceService.runPhase3Checks(
        req.file.buffer,
        selectedLLC,
        req.file.mimetype
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * POST /api/oklahoma/validate-disclosures
 * Phase 4: Disclosure Analysis
 */
router.post(
  '/validate-disclosures',
  authenticate,
  upload.single('disclosure'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Disclosure file required' });
      }

      const result = await oklahomaComplianceService.runPhase4DisclosureAnalysis(
        req.file.buffer,
        req.file.mimetype
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * POST /api/oklahoma/validate-cancellation-timing
 * Phase 10: Cancellation Timing Validation
 */
router.post(
  '/validate-cancellation-timing',
  authenticate,
  upload.single('cancellationForm'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Cancellation form required' });
      }

      const contractAcceptanceDate = new Date(req.body.contractAcceptanceDate);
      const attemptedAssignmentDate = req.body.assignmentDate
        ? new Date(req.body.assignmentDate)
        : undefined;

      const result = await oklahomaComplianceService.runPhase10TimingValidation(
        req.file.buffer,
        contractAcceptanceDate,
        attemptedAssignmentDate,
        req.file.mimetype
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

/**
 * POST /api/oklahoma/validate-complete-deal
 * Complete Oklahoma Deal Validation (Phases 3-5, optionally 10)
 */
router.post(
  '/validate-complete-deal',
  authenticate,
  upload.fields([
    { name: 'purchaseContract', maxCount: 1 },
    { name: 'disclosureAddendum', maxCount: 1 },
    { name: 'cancellationForm', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files.purchaseContract || !files.disclosureAddendum) {
        return res.status(400).json({
          success: false,
          error: 'Purchase contract and disclosure addendum required'
        });
      }

      const result = await oklahomaComplianceService.validateOklahomaDeal({
        purchaseContractBuffer: files.purchaseContract[0].buffer,
        disclosureAddendumBuffer: files.disclosureAddendum[0].buffer,
        cancellationFormBuffer: files.cancellationForm?.[0]?.buffer,
        selectedLLC: {
          name: req.body.llcName,
          authorizedSigner: req.body.authorizedSigner
        },
        contractAcceptanceDate: new Date(req.body.contractAcceptanceDate),
        mimeType: files.purchaseContract[0].mimetype
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
```

### Register Routes
- [ ] Add Oklahoma routes to main app

**Edit:** `backend/src/index.ts`

```typescript
// Add this import
import oklahomaRoutes from './routes/oklahomaRoutes';

// Add this route registration (with other routes)
app.use('/api/oklahoma', oklahomaRoutes);
```

### Test Backend Endpoints
- [ ] Test Phase 3 contract validation endpoint
- [ ] Test Phase 4 disclosure analysis endpoint
- [ ] Test Phase 10 timing validation endpoint
- [ ] Test complete deal validation endpoint

**Test Commands:**
```bash
# Test Phase 3: Contract validation
curl -X POST http://localhost:3001/api/oklahoma/validate-contract \
  -H "Authorization: Bearer $TOKEN" \
  -F "contract=@test-contracts/oklahoma/purchase-contract.pdf" \
  -F "llcName=ABC Wholesale LLC" \
  -F "authorizedSigner=John Smith"

# Test Phase 4: Disclosure analysis
curl -X POST http://localhost:3001/api/oklahoma/validate-disclosures \
  -H "Authorization: Bearer $TOKEN" \
  -F "disclosure=@test-contracts/oklahoma/disclosure-addendum.pdf"

# Test Phase 10: Timing validation
curl -X POST http://localhost:3001/api/oklahoma/validate-cancellation-timing \
  -H "Authorization: Bearer $TOKEN" \
  -F "cancellationForm=@test-contracts/oklahoma/cancellation-form.pdf" \
  -F "contractAcceptanceDate=2026-01-15" \
  -F "assignmentDate=2026-02-10"

# Test complete validation
curl -X POST http://localhost:3001/api/oklahoma/validate-complete-deal \
  -H "Authorization: Bearer $TOKEN" \
  -F "purchaseContract=@test-contracts/oklahoma/purchase-contract.pdf" \
  -F "disclosureAddendum=@test-contracts/oklahoma/disclosure-addendum.pdf" \
  -F "cancellationForm=@test-contracts/oklahoma/cancellation-form.pdf" \
  -F "llcName=ABC Wholesale LLC" \
  -F "authorizedSigner=John Smith" \
  -F "contractAcceptanceDate=2026-01-15"
```

---

## 📋 PHASE 4: Frontend Integration (Day 3-5 - 8 hours)

### Create Oklahoma Deal Submission Flow Component

- [ ] Create `frontend/src/components/oklahoma/DealSubmissionFlow.tsx`
- [ ] Implement multi-step form (Phases 0-11)
- [ ] Add file upload for each document type
- [ ] Add real-time validation feedback
- [ ] Add compliance status indicators (RED/YELLOW/GREEN)
- [ ] Add timing validation UI (Phase 10)

**Key Features to Implement:**

1. **Phase 0: LLC Selection Hard Gate**
   - Dropdown to select LLC
   - Validate LLC profile complete
   - Validate CSA executed for selected LLC
   - Block submission if requirements not met

2. **Phase 2: Contract Upload**
   - File upload for purchase contract
   - Auto-extract on upload
   - Show extracted fields in real-time
   - Display Phase 3 validation results

3. **Phase 3-5: Compliance Status Display**
   - Show GREEN/YELLOW/RED indicator
   - List all issues found
   - Show remediation steps if YELLOW
   - Block progression if RED

4. **Phase 4: Disclosure Upload**
   - File upload for disclosure addendum
   - Show 8 disclosure checklist
   - Highlight found vs missing disclosures
   - Allow remediation (upload corrected form)

5. **Phase 6: Distribution Channel Selection**
   - Only enable if status = GREEN
   - Checkboxes for channels
   - Auto-trigger MSA/ASA based on selection

6. **Phase 10: Cancellation Form Upload**
   - File upload for cancellation form
   - Extract delivery date
   - Show timeline validation
   - Block assignment execution if timing invalid

7. **Phase 11: Assignment Execution Gate**
   - Show "Ready for Assignment" only if Phase 10 valid
   - Display timeline with dates
   - Block button if timing requirements not met

### Create Custom Hooks

- [ ] Create `frontend/src/hooks/use-oklahoma-deal.ts`
- [ ] Implement validation hooks for each phase

**Example Hook:**
```typescript
export function useOklahomaDealValidation() {
  const [dealStatus, setDealStatus] = useState<'GREEN' | 'YELLOW' | 'RED'>('YELLOW');
  const [issues, setIssues] = useState<string[]>([]);

  const validateContract = useMutation({
    mutationFn: async (data: { file: File; llcName: string }) => {
      const formData = new FormData();
      formData.append('contract', data.file);
      formData.append('llcName', data.llcName);
      return api.post('/api/oklahoma/validate-contract', formData);
    },
    onSuccess: (response) => {
      setDealStatus(response.data.status);
      setIssues(response.data.issues);
    }
  });

  const validateDisclosures = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('disclosure', file);
      return api.post('/api/oklahoma/validate-disclosures', formData);
    },
    onSuccess: (response) => {
      // Update disclosure status
    }
  });

  const validateCancellationTiming = useMutation({
    mutationFn: async (data: {
      file: File;
      contractAcceptanceDate: string;
      assignmentDate?: string;
    }) => {
      const formData = new FormData();
      formData.append('cancellationForm', data.file);
      formData.append('contractAcceptanceDate', data.contractAcceptanceDate);
      if (data.assignmentDate) {
        formData.append('assignmentDate', data.assignmentDate);
      }
      return api.post('/api/oklahoma/validate-cancellation-timing', formData);
    }
  });

  return {
    dealStatus,
    issues,
    validateContract,
    validateDisclosures,
    validateCancellationTiming
  };
}
```

### Add to Dashboard

- [ ] Create new page: `frontend/src/app/(dashboard)/oklahoma/page.tsx`
- [ ] Add to sidebar navigation
- [ ] Test end-to-end flow

---

## 📋 PHASE 5: Testing End-to-End Flow (Day 5-6 - 4 hours)

### Complete Deal Submission Test

- [ ] Start with no LLC created
- [ ] Create LLC profile (Phase 0)
- [ ] Sign CSA for LLC
- [ ] Submit deal with all documents:
  - Purchase contract
  - Disclosure addendum
  - Cancellation form (optional at first)
- [ ] Verify Phase 3 checks run automatically
- [ ] Verify Phase 4 disclosure analysis runs
- [ ] Verify Phase 5 scoring is GREEN
- [ ] Select distribution channels (Phase 6)
- [ ] Verify MSA/ASA triggered
- [ ] Complete broker review (Phase 8)
- [ ] Approve for distribution (Phase 9)
- [ ] Upload cancellation form (Phase 10)
- [ ] Verify timing validation passes
- [ ] Execute assignment (Phase 11)
- [ ] Verify all audit logs created

### Edge Case Testing

- [ ] Test with RED status deal (non-assignable contract)
- [ ] Test with YELLOW status (missing 2-3 disclosures)
- [ ] Test with invalid timing (cancellation before contract acceptance)
- [ ] Test with expired contract
- [ ] Test with buyer name not matching LLC
- [ ] Test with missing AS-IS language

---

## 📋 PHASE 6: Production Deployment (Day 7 - 2 hours)

### Pre-Deployment Checklist

- [ ] All Oklahoma profiles seeded in production database
- [ ] Environment variables configured (OPENAI_API_KEY)
- [ ] Frontend build successful
- [ ] Backend build successful
- [ ] All tests passing

### Deploy to Staging

- [ ] Deploy backend to staging
- [ ] Deploy frontend to staging
- [ ] Run smoke tests on staging
- [ ] Test with real Oklahoma documents

### Deploy to Production

- [ ] Deploy backend to production
- [ ] Deploy frontend to production
- [ ] Monitor error logs
- [ ] Monitor extraction accuracy

### Monitoring Setup

- [ ] Set up error tracking (Sentry, DataDog, etc.)
- [ ] Set up extraction accuracy monitoring
- [ ] Set up cost monitoring (OpenAI API usage)
- [ ] Set up alerts for failed extractions

---

## 📋 PHASE 7: Optimization & Tuning (Ongoing)

### Week 1 Post-Launch

- [ ] Review first 50 deal submissions
- [ ] Calculate extraction accuracy per profile
- [ ] Identify common extraction failures
- [ ] Update profiles with missing field labels

### Month 1 Post-Launch

- [ ] Analyze extraction costs vs budget
- [ ] Review compliance scoring accuracy
- [ ] Collect user feedback on UX
- [ ] Tune confidence thresholds if needed

### Ongoing Improvements

- [ ] Add new field labels as patterns emerge
- [ ] Update regex hints for better accuracy
- [ ] Create profile variations for different OK forms
- [ ] Add automated profile learning (corrections → updates)

---

## 📊 Success Metrics

### Extraction Accuracy Targets
- ✅ Purchase Contract: >85% accuracy
- ✅ Disclosure Addendum: >80% accuracy
- ✅ Cancellation Form: >90% accuracy (delivery date critical!)
- ✅ Assignment Agreement: >85% accuracy

### Processing Targets
- ✅ Average extraction time: <15s per document
- ✅ End-to-end deal processing: <2 minutes
- ✅ API error rate: <1%
- ✅ User satisfaction: >4/5 stars

### Cost Targets
- ✅ Average cost per deal: <$0.05
- ✅ Monthly costs (1000 deals): <$50
- ✅ Cost savings vs manual: >99%

---

## 🚨 Troubleshooting Checklist

### Extraction Accuracy Issues

**Problem:** Low confidence scores (<70%)

**Solutions:**
- [ ] Review `fieldEvidence` to see what was found
- [ ] Check if your forms use different terminology
- [ ] Update profile with alternative field labels
- [ ] Add or update regex hints
- [ ] Consider manual review workflow for low-confidence extractions

**Example: Update Profile**
```typescript
// If extraction missing "earnest money" because form says "EMD Deposit"
const profile = await ComplianceExtractionProfile.findOne({
  where: { state: 'OK', category: 'purchase_contract' }
});

profile.fieldLabels = {
  ...profile.fieldLabels,
  earnestMoney: [
    ...profile.fieldLabels.earnestMoney,
    'EMD Deposit',
    'Good Faith Deposit'
  ]
};

await profile.save();
```

### Disclosure Detection Issues

**Problem:** Missing disclosures even though they're in the form

**Solutions:**
- [ ] Check exact wording in your form
- [ ] Add alternative wording to profile
- [ ] Update regex hints
- [ ] Lower confidence threshold temporarily
- [ ] Review field evidence to see partial matches

### Timing Validation Issues

**Problem:** Cannot find delivery date in cancellation form

**Solutions:**
- [ ] Check date format (MM/DD/YYYY vs "February 1, 2026")
- [ ] Update regex to support your format
- [ ] Add manual date entry as fallback
- [ ] Require standardized cancellation form

### Performance Issues

**Problem:** Extractions taking >30 seconds

**Solutions:**
- [ ] Check PDF file size (compress if >5MB)
- [ ] Verify text extraction runs first (saves time)
- [ ] Check OpenAI API latency
- [ ] Consider caching for repeated extractions

---

## ✅ Final Checklist

### Before Going Live

- [ ] All 4 Oklahoma profiles seeded
- [ ] Tested with 10+ real Oklahoma contracts
- [ ] All API endpoints working
- [ ] Frontend integrated and tested
- [ ] Timing validation working correctly
- [ ] Audit logging enabled
- [ ] Error monitoring configured
- [ ] User documentation created
- [ ] Team trained on Oklahoma workflow
- [ ] Backup/restore procedures tested

### Launch Day

- [ ] Deploy to production
- [ ] Run smoke tests
- [ ] Monitor error logs (first 24 hours)
- [ ] Have rollback plan ready
- [ ] Support team on standby

### Week 1

- [ ] Review first 50 submissions
- [ ] Address any accuracy issues
- [ ] Collect user feedback
- [ ] Tune profiles if needed

---

## 📞 Support

**Questions about Oklahoma implementation:**
- Review: `backend/docs/OKLAHOMA_EXTRACTION_GUIDE.md`
- Review: `backend/docs/EXTRACTION_PROFILES_SETUP.md`
- Check test results in `backend/tests/manual/testExtractionProfiles.ts`

**Technical Issues:**
- Run: `npm run validate:extraction`
- Check server logs
- Review ComplianceCheck and ComplianceAlert tables

---

**Estimated Total Time:** 30-40 hours (1 week with 1 developer)

**System Ready:** ✅ Yes - All profiles and scripts created
**Your Next Step:** Start with PHASE 0 - System Setup (2 hours)

---

*Last Updated: January 2026*
*Oklahoma Wholesale Pilot - Implementation Checklist v1.0*
