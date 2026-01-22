# Oklahoma Compliance Phases Guide

**Internal AI Agent Knowledge - Oklahoma Wholesale Transaction Workflow**

---

## Overview

Oklahoma uses a **7-phase compliance workflow** (phases 0-6) for wholesale real estate transactions. This guide helps the AI agent understand what each phase means and what activities occur in each.

---

## Phase Structure

### Phase 0: Account Setup & Entity Verification
**What happens:** Initial LLC setup and platform onboarding
- LLC profile completion
- Articles of Organization upload
- Operating Agreement upload
- Authorized signer identification
- Compliance Services Agreement (CSA) execution

**Gate:** Cannot proceed to Phase 1 until all LLC setup items are complete.

---

### Phase 1: Property Submission
**What happens:** Deal intake and initial documentation
- Property details entered into system
- Purchase & Sale Agreement (Seller to Wholesaler) uploaded
- Seller disclosures completed
- Wholesaler position disclosure
- Equity position disclosure

**Gate:** Cannot proceed to Phase 2 until purchase contract is uploaded and seller disclosures are present.

---

### Phase 2: Compliance Review & Approval
**What happens:** System validates the deal
- Contract validation (buyer matches LLC, assignable, AS-IS language, not expired)
- Disclosure verification
- Compliance scoring (GREEN/YELLOW/RED)

**Gate:** Cannot proceed to Phase 3 unless compliance status is GREEN.

---

### Phase 3: Approved / Pre-Distribution
**What happens:** Prepare deal for marketplace distribution
- Marketing Services Agreement (MSA) execution
- Auction Services Agreement (ASA) if using auction channel
- Broker review and approval
- Distribution channel selection

**Gate:** Cannot proceed to Phase 4 until broker approves the deal.

---

### Phase 4: Offer Accepted / Pre-Buyer Seller Acknowledgment
**What happens:** Buyer offer accepted, statutory hold begins
- Seller acknowledgment of assignment intent
- Cancellation rights disclosure delivered
- **3-DAY STATUTORY HOLD BEGINS** (Oklahoma requirement)

**IMPORTANT:** The 3-day statutory hold is a waiting period after seller signs acknowledgment. No buyer contracts can be executed until this period passes.

**Gate:** Cannot proceed to Phase 5 until 3-day hold period expires.

---

### Phase 5: Buyer Contract Execution
**What happens:** Execute contract with end buyer
- **For Wholesale (Assignment):** Assignment of Contract Addendum executed
- **For Double Closing:** Purchase & Sale Agreement (Wholesaler to Buyer) executed

**Transaction Types:**
- `wholesale` - Assignment of original contract to end buyer
- `double_closing` - Two separate closings (Seller→Wholesaler, then Wholesaler→Buyer)

---

### Phase 6: Title, Closing & Settlement
**What happens:** Final closing activities (largely outside platform)
- Title company coordination
- Closing disclosure
- Settlement statement
- Wire instructions
- Hubzu addendum (if auction)

**Note:** Phase 6 activities are mostly tracked for reference. Actual closing occurs at title company.

---

## Transaction Types Supported

Oklahoma supports two transaction types:

1. **Wholesale (Assignment)** - Primary method
   - Original purchase contract is assigned to end buyer
   - Single closing at title company
   - Assignment fee disclosed to all parties

2. **Double Closing** - Alternative method
   - Two separate transactions
   - Wholesaler takes title briefly
   - Wholesaler sells to end buyer
   - Used when assignment isn't practical

---

## Blocking Gates Summary

| Gate | After Phase | Blocks Phase | Key Requirement |
|------|-------------|--------------|-----------------|
| OK-GATE-1 | 0 | 1 | LLC setup complete |
| OK-GATE-2 | 1 | 2 | Contract uploaded |
| OK-GATE-3 | 2 | 3 | GREEN compliance status |
| OK-GATE-4 | 3 | 4 | Broker approval |
| OK-GATE-5 | 4 | 5 | 3-day statutory hold expired |

---

## Common User Questions

**"What phase is my deal in?"**
→ Use `get_deal_status` tool to check current phase

**"What's blocking my deal?"**
→ Check the blocking gate requirements for the next phase

**"How long is the 3-day hold?"**
→ The statutory hold is 3 calendar days from when seller signs the acknowledgment

**"Can I skip the 3-day hold?"**
→ No, this is a required waiting period for Oklahoma wholesale transactions

**"What's the difference between wholesale and double closing?"**
→ Wholesale assigns the original contract; double closing involves two separate closings

---

## Key Documents by Phase

| Phase | Documents |
|-------|-----------|
| 0 | Articles of Organization, Operating Agreement, CSA |
| 1 | Purchase & Sale Agreement, Seller Disclosures |
| 2 | (Validation - no new documents) |
| 3 | MSA, ASA (if auction) |
| 4 | Seller Acknowledgment, Cancellation Disclosure |
| 5 | Assignment Addendum OR Double Close PSA |
| 6 | Closing Disclosure, Settlement Statement, Wire Instructions |

---

## Reminder

When discussing phases and requirements with users:
- Describe what IS present or missing
- Offer options, don't dictate requirements
- Suggest consulting legal counsel for compliance questions
- Use "may," "appears to," and "commonly included" language
