# Wholesale Contract Compliance & Verification Policy – DispoTrack / ESO Platform

## 1. Purpose
This policy establishes the compliance and verification framework governing all wholesale property submissions processed through DispoTrack and Easy Street Offers (ESO). It defines the legal, procedural, and automation rules that ensure every transaction is conducted transparently, directly with the seller, and in full alignment with state and federal real estate regulations.

## 2. Core Compliance Principles

### Transparency
All wholesaling and marketing activities must be fully disclosed to sellers and conducted under appropriate brokerage supervision.

### Direct-to-Seller Integrity
Every deal must originate directly between the property owner and the submitting wholesaler.

### Broker Involvement
Every marketed transaction must include a Marketing Services Agreement (MSA) with the company's designated broker after initial approval.

### State-Specific Compliance
All marketing activities and disclosures must comply with state regulations, including licensing, escrow, rescission, and disclosure laws.

## 3. Verification Process

### 3.1 Seller Verification (Public Record Match)
The AI system automatically cross-references the seller name from the contract against public property records (county assessor, recorder, or title database).

**Condition:** Seller must match the recorded owner of the property.

**If mismatch detected:** Flag for manual review and block further processing until ownership is verified.

**Automation Logic:**
```
IF public_record.owner_name != contract.seller_name
    STATUS = RED
    FLAG = "Seller mismatch – verify ownership or power of attorney"
```

### 3.2 Buyer / Wholesaler Entity Verification
Each wholesaler profile must contain:
- Registered entity name (LLC / Corporation)
- Uploaded operating agreement
- List of authorized signers

**Policy:** Contracts must be signed by an authorized representative of the registered entity. The system verifies that the buyer's entity and signer match what's stored in the wholesaler's profile.

**Automation Logic:**
```
IF contract.buyer_entity != wholesaler_profile.entity_name
    STATUS = RED
    FLAG = "Entity mismatch – not executed by registered company"

IF contract.signer_name NOT IN wholesaler_profile.authorized_signers
    STATUS = RED
    FLAG = "Unauthorized signer"
```

### 3.3 Anti–Daisy Chain Enforcement
All transactions must be direct to seller. Any intermediary or daisy-chained deal will be rejected.

**Policy:** If the seller listed in the contract is not the property owner, or if the contract shows another wholesaler as seller, the submission will be flagged and rejected.

**Automation Logic:**
```
IF contract.seller_name != public_record.owner_name
    OR contract.seller_name IN known_wholesaler_entities
    STATUS = RED
    FLAG = "Potential Daisy Chain"
```

## 4. Contract Marketing Authorization Rules

### 4.1 Assignability Requirement
If the purchase contract is not assignable, the deal is automatically blocked.

```
IF assignable == false
    STATUS = RED
    FLAG = "Non-Assignable Contract – requires novation or double close"
```

### 4.2 Marketing Clause Enforcement
If the contract does not include a marketing clause, the system:
- Rejects all marketing routes (A/B/C)
- Flags deal as Yellow: Marketing Not Authorized
- Prompts a single action: "Request Authorized Marketing Authorization Addendum"
- After the addendum is executed, the system re-evaluates and, if compliant, enables marketing distribution

## 5. Marketing Distribution & Broker Oversight

### 5.1 Routing Definitions

| Route | Description | Requires Broker | Marketing Clause Required |
|-------|-------------|-----------------|--------------------------|
| A | ESO Private Marketplace | Yes (if property marketing) | Yes |
| B | Online Auction | Always | Yes |
| C | External Buyer Prospecting | Yes (if property marketing) | Yes |

### 5.2 Workflow Summary

| Status | Condition | Action |
|--------|-----------|--------|
| 🟢 Green | Assignable + Authorized + Broker Engaged | Allow A/B/C marketing |
| 🟡 Yellow | No marketing clause | Require addendum before marketing |
| 🔴 Red | Non-assignable / Missing broker / Missing disclosures - Provide Addendum with all Contract Requirements?? | Reject |

### 5.3 Post-Approval Broker Engagement
Once the deal is approved (Green), the system auto-generates a Marketing Services Agreement (MSA) between DispoTrack/ESO and the designated in-state broker.

- The MSA includes Auction Services authorization and any applicable state riders
- This occurs post-approval, ensuring legal oversight without hindering intake flow

## 6. Addendum & Disclosure Automation

When a deal lacks a marketing clause, the following documents are generated:
- Marketing Authorization & Brokerage Addendum (state-specific)
- Required State Disclosures (seller and buyer packets)
- Auction Services authorization language (default included)

After full execution, the deal transitions to Green and unlocks marketing routes.

## 7. Compliance Enforcement Summary

| Verification Type | Trigger | Enforcement Action |
|-------------------|---------|-------------------|
| Seller identity | Public record mismatch | Red flag – manual verification required |
| Buyer entity / signer | Entity or signer mismatch | Reject submission |
| Daisy chain detection | Intermediary detected | Reject submission |
| Missing marketing clause | Addendum required | Yellow status until signed |
| Missing broker MSA | No marketing permitted | Hold until executed |

## 8. Wholesaler Representations & Warranties

Each wholesaler certifies upon submission that:
- They are in direct contractual privity with the property owner
- The contract was executed by an authorized representative of their registered entity
- All information provided is accurate and supported by uploaded corporate records
- They authorize ESO/DispoTrack to verify seller ownership and entity authorization through public and third-party data sources

## 9. Policy Integration & Automation Behavior

The AI Agent and Compliance Reviewer dashboards will display:
- **Top Status Banner:** Green (Marketable), Yellow (Addendum Needed), Red (Blocked)
- **Tooltips:** show missing clauses, signer mismatches, and public record verification results
- **Primary Action (Yellow state):** "Request Authorized Marketing Authorization Addendum"
- All automated steps and manual overrides will be logged for audit tracking

## 10. Effective Date & Governance

This policy takes effect immediately and governs all wholesale submissions under DispoTrack and ESO. It may be updated as state laws evolve (e.g., OK effective 11/1/2025, MD 10/1/2025, ND 8/1/2025, CT 7/1/2026). The Compliance Director shall review and update this policy quarterly.

---

## Implementation Notes for AI Agents

### Contract Compliance Agent
- Perform seller verification against public records
- Validate buyer entity and authorized signer
- Check for daisy chain indicators
- Verify contract assignability
- Detect marketing clause presence

### Workflow Orchestrator
- Route submissions through verification checkpoints
- Generate appropriate addenda when required
- Transition status based on compliance results
- Trigger MSA generation for approved deals

### Guardrail & Compliance Enforcement Agent
- Monitor for unauthorized marketing attempts
- Block non-compliant submissions
- Maintain audit trail of all compliance actions
- Escalate red flag items for human review

### Communication & Negotiation Agent
- Communicate missing requirements to wholesalers
- Provide clear instructions for remediation
- Facilitate addendum execution process
- Maintain professional compliance-focused communication