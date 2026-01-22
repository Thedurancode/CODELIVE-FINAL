# Dispotree Compliance System
## Complete User Guide

---

# Introduction

## What is the Compliance System?

The Compliance System is Dispotree's built-in protection that automatically checks every real estate deal to make sure it's legitimate, legal, and safe to proceed with. Think of it as a security checkpoint that every deal must pass through before it can move forward.

## Why Does It Matter?

When you're dealing with real estate wholesale transactions, there are many things that can go wrong:

- A seller might not actually own the property
- Someone could be submitting the same property multiple times trying to scam buyers
- A party involved could be on a government sanctions list
- The property might have unpaid taxes or liens
- Required licenses or documents might be missing or expired

The compliance system catches these issues automatically, protecting you and your buyers from bad deals.

## How It Works (The Simple Version)

```
Deal Submitted → Automatic Checks → Result
                                      ↓
                        ┌─────────────┼─────────────┐
                        ↓             ↓             ↓
                      GREEN        YELLOW          RED
                    (Approved)    (Review)      (Blocked)
```

Every deal goes through multiple checks. Based on what's found, the deal gets a status:

| Status | What It Means | What Happens |
|--------|---------------|--------------|
| **GREEN** | Everything checks out | Deal moves forward automatically |
| **YELLOW** | Minor issues found | Deal can proceed but needs review |
| **RED** | Serious problems detected | Deal is blocked until issues are resolved |

---

# Part 1: Understanding Deal Checks

## What Gets Checked?

When a deal is submitted, the system automatically runs these checks:

### 1. Fraud Detection

**What it looks for:**
- Is the same person submitting too many deals too quickly?
- Is this property being submitted repeatedly?
- Does the asking price make sense compared to the property value?
- Is the seller actually a wholesaler trying to "daisy chain"?
- Is anyone involved connected to previously confirmed fraud?

**Example flags:**
- "This seller has submitted 5 deals in the last 24 hours" (suspicious)
- "This property was already submitted 3 times this week" (suspicious)
- "Asking price is 60% higher than estimated value" (potential fraud)

### 2. Sanctions Screening

**What it looks for:**
- Is the seller, buyer, wholesaler, or any contact on a government sanctions list?
- This includes OFAC (US Treasury), UN sanctions, EU sanctions, and UK sanctions lists

**Why it matters:**
- It's illegal to do business with sanctioned individuals or companies
- Violations can result in massive fines and legal consequences

### 3. Property Verification

**What it looks for:**
- Does the seller actually own this property?
- Are the property details accurate (bedrooms, bathrooms, square footage)?
- Are property taxes current or delinquent?
- What is the property actually worth?

**Example flags:**
- "Seller name doesn't match property owner on record" (critical issue)
- "Property has $15,000 in delinquent taxes" (must be addressed)
- "Listed as 4 bedrooms but records show 3" (minor discrepancy)

### 4. Title Verification

**What it looks for:**
- Are there any liens on the property?
- Are there any legal judgments against the property?
- Are there easements or restrictions?
- Is there pending litigation?

**Example flags:**
- "Property has an outstanding mortgage of $180,000"
- "Tax lien of $8,500 recorded"
- "Lis pendens filed - lawsuit pending"

### 5. State Compliance Rules

**What it looks for:**
- Different states have different requirements for real estate transactions
- The system checks that all state-specific requirements are met

**Examples by state:**
- Texas: Attorney not required, but certain disclosures are
- Florida: Specific broker licensing requirements
- California: Additional disclosure requirements

---

# Part 2: Compliance Statuses Explained

## GREEN Status (Approved)

**What it means:** The deal passed all checks with no issues.

**What happens next:**
- Deal is automatically queued for broker approval
- No action required from you
- Deal can proceed through the pipeline

**You'll see:**
- All rules passed
- No fraud signals
- No sanctions matches
- Property verified
- Title clear

---

## YELLOW Status (Review Needed)

**What it means:** The deal has minor issues that don't block it, but someone should look at them.

**Common reasons for yellow status:**
- Property square footage doesn't match records (but close enough)
- Seller has submitted multiple deals recently (but not excessive)
- Minor documentation is missing
- Fuzzy match on sanctions (probably not the same person)

**What you should do:**
1. Review the flagged issues
2. Determine if they're actually problems
3. Add notes if you've verified something is okay
4. Proceed if satisfied, or request more information

**The deal CAN still proceed** - yellow is a warning, not a stop sign.

---

## RED Status (Blocked)

**What it means:** Serious issues were found. The deal cannot proceed until they're resolved.

**Common reasons for red status:**
- Seller name doesn't match property owner
- Property taxes are delinquent
- Someone is on a sanctions list
- High fraud risk score (80+)
- Required licenses missing
- Critical documents missing

**What you should do:**
1. Review the specific issues listed
2. Determine if they can be resolved
3. Take action to fix each issue
4. Re-run compliance check after fixes
5. If issues can't be resolved, the deal should be rejected

**The deal CANNOT proceed** until red issues are resolved.

---

# Part 3: Fraud Detection

## How Fraud Detection Works

The fraud detection system uses multiple methods to identify potentially fraudulent deals:

### Velocity Checks (Submission Frequency)

The system tracks how often entities submit deals and flags unusual activity:

| Who/What | Limit | Why |
|----------|-------|-----|
| Same seller | 3 deals per 24 hours | Legitimate sellers rarely have this many properties |
| Same phone number | 5 deals per 24 hours | Could indicate fake identities |
| Same email | 5 deals per 24 hours | Could indicate fake identities |
| Same property | 2 times per week | Why submit the same property repeatedly? |
| Same IP address | 10 deals per hour | Bot or automated fraud attempt |
| Same wholesaler | 20 deals per 24 hours | High volume needs extra scrutiny |

### Pattern Detection

The system looks for known fraud patterns:

**Daisy Chaining**
- When a "seller" is actually another wholesaler
- They're trying to mark up and resell a deal they have under contract
- System checks if the seller name matches known wholesalers

**Price Manipulation**
- When asking price is significantly higher than property value
- Flag triggers at 50%+ above estimated value
- Could indicate inflated pricing or fake deals

**Rapid Resubmission**
- Same property submitted multiple times quickly
- Often indicates testing the system or shopping for approval

**Entity Mismatch**
- Contact information tied to a different person in the database
- Phone or email was previously used by someone else
- Possible identity fraud

**Known Fraud Network**
- Any connection to previously confirmed fraudulent entities
- If someone worked with a confirmed fraudster before, flag it

### Risk Scores

Every deal gets a fraud risk score from 0-100:

| Score | Risk Level | What Happens |
|-------|------------|--------------|
| 0-39 | Low | Deal proceeds normally |
| 40-59 | Medium | Caution flag, extra verification suggested |
| 60-79 | High | Manual review required |
| 80-100 | Critical | Deal is automatically blocked |

---

## Viewing Fraud Signals

To see fraud signals for a deal:

1. Go to the deal/property details
2. Look for the "Fraud Detection" section
3. You'll see:
   - Overall risk score
   - Risk level (low/medium/high/critical)
   - List of detected signals with explanations
   - Recommendations

### Understanding Fraud Signal Details

Each signal shows:
- **Type**: What kind of signal (velocity, pattern, network, etc.)
- **Severity**: How serious (low, medium, high, critical)
- **Entity**: What triggered it (seller, phone, email, etc.)
- **Occurrences**: How many times this has happened
- **Message**: Plain explanation of the issue

---

## Resolving Fraud Signals

### If It's a False Positive (Not Actually Fraud)

1. Go to the fraud signal
2. Click "Clear Signal"
3. Add notes explaining why it's not fraud
4. The signal will be marked as cleared

**Example:** A legitimate wholesaler submitted 25 deals because they just acquired a large portfolio. You verify this with them and clear the velocity signal.

### If It's Confirmed Fraud

1. Go to the fraud signal
2. Click "Confirm Fraud"
3. Add notes with evidence
4. The entity will be permanently flagged
5. Future deals involving this entity will be blocked

**Important:** Confirming fraud is permanent and affects all future deals. Only do this when you're certain.

---

# Part 4: Sanctions Screening

## What is Sanctions Screening?

The US government (and international bodies) maintain lists of individuals and companies that are prohibited from doing business. These include:

- **OFAC SDN List**: Specially Designated Nationals (terrorists, drug traffickers, etc.)
- **Consolidated Sanctions**: Combined US sanctions
- **UN Sanctions**: International sanctions
- **EU Sanctions**: European Union restrictions
- **UK OFSI**: UK financial sanctions

**It is illegal to do business with anyone on these lists.** The penalties are severe - millions in fines and potential criminal charges.

## Who Gets Screened?

Everyone involved in a deal:
- Sellers
- Buyers
- Wholesalers
- Brokers
- Agents
- Attorneys
- Any other contacts

## Understanding Screening Results

### No Match Found
- The person is not on any sanctions list
- Deal can proceed (from sanctions perspective)

### Match Found

If a match is found, you'll see:

**Match Type:**
| Type | What It Means |
|------|---------------|
| Exact Match | Name matches exactly - very serious |
| Alias Match | Matches a known alias of a sanctioned person |
| Partial Match | Part of the name matches |
| Fuzzy Match | Name is similar but not exact |

**Match Score (0-100):**
- 99-100: Almost certainly the same person
- 90-98: Likely the same person
- 85-89: Possibly the same person
- Below 85: Probably not the same person (but verify)

**What You'll See:**
- The name that matched
- Which sanctions list they're on
- Why they were sanctioned
- When they were added to the list

## Resolving Sanctions Matches

### When It's NOT the Same Person

This is common - many people have similar names. To clear:

1. Gather evidence that it's a different person:
   - Different date of birth
   - Different location
   - Different identifying information
2. Go to the pending match
3. Click "Clear - Different Person"
4. Add your evidence in the notes
5. Your name will be recorded for audit purposes

### When It IS the Same Person

**STOP. DO NOT PROCEED WITH THE DEAL.**

1. Mark the match as "Blocked"
2. Add notes documenting the confirmation
3. The deal will be permanently blocked
4. Report to your compliance officer immediately

### When You're Not Sure

1. Mark for "Escalation"
2. Add notes explaining your uncertainty
3. A senior compliance officer will review
4. Do not proceed until resolved

---

# Part 5: Property Verification

## What Gets Verified?

### Ownership Verification

The most important check - does the seller actually own this property?

**What the system does:**
1. Looks up the property in public records
2. Compares the recorded owner to your seller
3. Gives a match score (0-100%)

**Match Score Meanings:**
| Score | Meaning |
|-------|---------|
| 95-100% | Names match almost exactly |
| 80-94% | Names are very similar (minor spelling differences) |
| 60-79% | Names are somewhat similar (might be same person) |
| Below 60% | Names don't match well - investigate |

**Common Reasons for Mismatch:**
- Property is in a trust or LLC
- Seller recently inherited property
- Name change (marriage/divorce)
- Seller is selling on behalf of actual owner
- Wrong seller name entered
- Actual fraud

### Property Details Verification

The system compares your listing details to public records:

| Field | What's Checked |
|-------|----------------|
| Address | Does it exist? Is it formatted correctly? |
| Bedrooms | Match to county records |
| Bathrooms | Match to county records |
| Square Footage | Match to county records (10% tolerance) |
| Year Built | Match to county records |
| Lot Size | Match to county records |
| Property Type | SFR, Condo, Multi-family, etc. |

**Minor discrepancies** (like off by 50 sqft) get a warning but don't block the deal.

**Major discrepancies** (like 3 beds vs 5 beds listed) will flag for review.

### Tax Status Verification

**What's checked:**
- Are property taxes current?
- Are there any tax liens?
- What is the assessed value?
- What is the tax amount?

**Tax Status Results:**
| Status | Meaning |
|--------|---------|
| Current | Taxes are paid up to date |
| Delinquent | Taxes are past due - RED FLAG |
| Exempt | Property is tax exempt |
| Unknown | Couldn't determine status |

**If taxes are delinquent:**
- You'll see the delinquent amount
- This affects the deal economics
- May need to be addressed before closing
- Serious delinquency can indicate distressed situation

### Property Valuation (AVM)

The system gets an automated valuation:

- **Estimated Value**: Best estimate of current market value
- **Value Range**: Low to high estimate
- **Confidence**: How confident is the estimate (0-100%)
- **Price Per Square Foot**: Calculated from value and size

**Using this information:**
- Compare your contract price to estimated value
- Large gaps should be investigated
- Low confidence means the estimate may not be reliable

---

## Property Verification Flags

### Critical Flags (Blocks the Deal)

| Flag | Meaning | What to Do |
|------|---------|------------|
| PROPERTY_NOT_FOUND | Property doesn't exist in records | Verify address is correct |
| OWNER_MISMATCH | Seller isn't the recorded owner | Get proof of ownership |
| TAX_DELINQUENT | Significant unpaid taxes | Factor into deal or resolve |
| VERIFICATION_BLOCKED | Couldn't verify (API down) | Wait and retry |

### Warning Flags (Review But Can Proceed)

| Flag | Meaning | What to Do |
|------|---------|------------|
| BEDROOM_MISMATCH | Bedroom count differs | Verify actual count |
| BATHROOM_MISMATCH | Bathroom count differs | Verify actual count |
| SQFT_MISMATCH | Square footage differs | Verify with measurements |

### Info Flags (Just FYI)

| Flag | Meaning | What to Do |
|------|---------|------------|
| USING_CACHED_DATA | Results from cache, not fresh | Usually fine, refresh if needed |
| LOW_CONFIDENCE_AVM | Value estimate may not be reliable | Get independent valuation |

---

# Part 6: Title Verification

## What is Title Verification?

Title verification checks the legal status of the property to uncover any issues that could affect the sale:

- Who legally owns the property
- What debts are attached to the property
- What restrictions exist
- Whether the title can be transferred cleanly

## What Gets Checked

### Liens

A lien is a legal claim against the property for unpaid debts.

| Lien Type | What It Is | Severity |
|-----------|------------|----------|
| Mortgage | Outstanding home loan | Must be paid at closing |
| Tax Lien | Unpaid property taxes | High - affects title |
| Judgment Lien | Court ordered debt | High - must be addressed |
| Mechanic's Lien | Unpaid contractor work | Medium - must be resolved |
| HOA Lien | Unpaid HOA dues | Medium - must be paid |
| Federal Tax Lien | Unpaid IRS taxes | High - complex to resolve |

**For each lien, you'll see:**
- Type of lien
- Amount owed
- Lien holder (who is owed)
- Recording date
- Position (1st, 2nd, 3rd - order of priority)

### Encumbrances

Encumbrances are restrictions or claims on how the property can be used.

| Type | What It Is |
|------|------------|
| Easement | Right of way for utilities, neighbors, etc. |
| Deed Restriction | Limits on what can be built or done |
| Covenant | Agreement that runs with the property |
| Right of First Refusal | Someone has option to buy first |
| Mineral Rights | Someone else owns below-ground rights |

### Title Exceptions

Issues that a title insurance company won't cover:
- Known boundary disputes
- Unrecorded claims
- Government rights (eminent domain)

### Lis Pendens

A recorded notice that litigation is pending involving the property. This is a **serious red flag** - the property is being fought over in court.

---

## Understanding Title Results

### Clear Title
- No liens (or only mortgage that will be paid off)
- No concerning encumbrances
- No litigation
- Title can transfer cleanly
- Status: GREEN

### Title with Issues
- Outstanding liens that need to be paid
- Encumbrances that affect value or use
- Issues can be resolved before closing
- Status: YELLOW (proceed with caution)

### Clouded Title
- Serious unresolved issues
- Litigation pending
- Ownership disputes
- Cannot close until resolved
- Status: RED (blocked)

---

# Part 7: State Compliance Rules

## What Are State Rules?

Different states have different legal requirements for real estate transactions. The compliance system enforces these automatically.

## How Rules Work

Each rule checks a specific requirement:

**Rule Components:**
- **State**: Which state(s) it applies to
- **Category**: What type of requirement (licensing, documentation, etc.)
- **What's Checked**: The specific field or condition
- **Severity**: Warning (yellow) or Critical (red)
- **Message**: What you see if it fails

## Common Rule Categories

### Licensing Rules
- Broker license required and valid
- Agent license required and valid
- License numbers must be on file

### Documentation Rules
- Purchase agreement required
- Proof of funds required
- Disclosure forms completed

### Transaction Rules
- Contract dates must be valid
- Closing date must be in the future
- Assignment fee within limits

### Disclosure Rules
- State-specific disclosures completed
- Lead paint disclosure (if applicable)
- Property condition disclosure

## Viewing Which Rules Apply

1. Go to Compliance Settings
2. Select a state
3. See all rules that apply to that state
4. Rules marked "ALL" apply everywhere

## What Happens When a Rule Fails

**Warning Rules (Yellow):**
- Deal gets yellow status
- You see which rule failed and why
- Can still proceed after review

**Critical Rules (Red):**
- Deal gets red status
- Deal is blocked
- Must fix the issue before proceeding

---

# Part 8: Compliance Alerts

## What Are Alerts?

Alerts are notifications about compliance issues that need attention. They're generated automatically when problems are detected.

## Types of Alerts

### Configuration Alerts
- System isn't properly configured
- API keys missing
- Service unavailable

### Fraud Alerts
- High-risk deal detected
- Multiple fraud signals
- Confirmed fraud entity

### Sanctions Alerts
- Match found on sanctions list
- Screening couldn't complete

### Verification Alerts
- Property verification failed
- Owner mismatch detected
- API service unavailable

### Expiration Alerts
- License expiring soon
- Contract expiring
- Insurance expiring

### Compliance Failure Alerts
- Deal failed compliance check
- Critical rules violated

## Alert Severity Levels

| Level | Color | Meaning |
|-------|-------|---------|
| Info | Blue | Just informational |
| Warning | Yellow | Needs attention soon |
| High | Orange | Needs attention now |
| Critical | Red | Urgent - immediate action required |

## Managing Alerts

### Viewing Alerts
1. Go to Compliance Dashboard
2. Click "Alerts" tab
3. See all active alerts sorted by severity

### Acknowledging Alerts
When you've seen an alert and are working on it:
1. Click on the alert
2. Click "Acknowledge"
3. Alert stays visible but shows as acknowledged
4. Others know someone is handling it

### Resolving Alerts
When the issue is fixed:
1. Click on the alert
2. Click "Resolve"
3. Add notes explaining what was done
4. Alert moves to resolved status

### Viewing Alert History
1. Go to Alerts
2. Click "Show Resolved"
3. See history of all past alerts
4. Useful for auditing and patterns

---

# Part 9: Audit Trail

## What is the Audit Trail?

Every action in the compliance system is recorded in a permanent, tamper-proof log. This is required for regulatory compliance (SOC 2) and provides a complete history of everything that happened.

## What Gets Logged

**Everything:**
- Every compliance check run
- Every status change
- Every alert created/resolved
- Every fraud signal detected/cleared
- Every sanctions match resolved
- Every rule change
- Who did what and when

## Why It Matters

1. **Legal Protection**: Proof that you followed proper procedures
2. **Audit Requirements**: Regulators and auditors need this
3. **Dispute Resolution**: Evidence of what happened
4. **Pattern Detection**: Finding recurring issues
5. **Accountability**: Who made what decisions

## Viewing Audit Logs

1. Go to Compliance > Audit Logs
2. Use filters:
   - Date range
   - Event type
   - Who performed the action
   - What was affected
   - Outcome (success/failure)

## Understanding Log Entries

Each entry shows:
- **When**: Exact date and time
- **Who**: User or system that performed action
- **What**: The action taken
- **On What**: The resource affected
- **Result**: Success, failure, or pending
- **Details**: Additional context

## Exporting Audit Logs

For external audits or records:
1. Go to Audit Logs
2. Set your date range and filters
3. Click "Export"
4. Choose format (spreadsheet or data file)
5. Download the export

**Exports include:**
- All matching log entries
- Verification that the log hasn't been tampered with
- Export ID for reference

---

# Part 10: Dead Letter Queue (Failed Actions)

## What is the Dead Letter Queue?

Sometimes automated actions fail - an email doesn't send, a webhook doesn't work, or a notification can't be delivered. When an action fails multiple times, it goes to the "Dead Letter Queue" for manual review.

Think of it as a holding area for things that couldn't be completed automatically.

## Why Actions Fail

Common reasons:
- External service is down
- Email address is invalid
- Webhook URL not responding
- Network issues
- Invalid data

## Viewing Failed Actions

1. Go to Compliance > Failed Actions (or Dead Letters)
2. See all items that need attention
3. Sorted by most recent

## Understanding Failed Action Details

Each item shows:
- **What Failed**: Type of action (email, webhook, etc.)
- **From What**: Which automation or process
- **Error**: What went wrong
- **Attempts**: How many times it tried
- **When**: First failure and most recent failure

## Handling Failed Actions

### Retry the Action
If you think it might work now:
1. Click on the failed action
2. Click "Retry"
3. System will try again
4. If successful, it's removed from the queue

### Resolve Without Retry
If you handled it manually or it's no longer needed:
1. Click on the failed action
2. Click "Resolve"
3. Add notes explaining what you did
4. It's marked as handled

### Abandon
If it can't be fixed and doesn't matter:
1. Click on the failed action
2. Click "Abandon"
3. Add notes explaining why
4. It's marked as abandoned

## Best Practices

- Check the dead letter queue daily
- Don't let items pile up
- Investigate patterns (same action failing repeatedly)
- Fix root causes, not just symptoms

---

# Part 11: Webhooks & Notifications

## What Are Webhooks?

Webhooks are a way to get notified in real-time when something happens in the compliance system. Instead of checking constantly, the system sends a message to your other tools automatically.

## What You Can Be Notified About

| Event | When It Fires |
|-------|---------------|
| Compliance Check Passed | A deal gets GREEN status |
| Compliance Check Warning | A deal gets YELLOW status |
| Compliance Check Failed | A deal gets RED status |
| Sanctions Match Found | Someone matches a sanctions list |
| High Risk Fraud Detected | Deal has high fraud score |
| Alert Created | New compliance alert |

## Where Notifications Can Go

- Slack channels
- Microsoft Teams
- Email systems
- Custom applications
- Any service that accepts webhooks

## Setting Up Webhooks

1. Go to Compliance > Settings > Webhooks
2. Click "Add Webhook"
3. Enter:
   - Name (for your reference)
   - URL (where to send notifications)
   - Events (what to notify about)
4. Save
5. Click "Test" to verify it works

## Webhook Security

Each webhook gets a secret key. This proves the notification really came from Dispotree and wasn't faked. Your receiving system should verify this signature.

---

# Part 12: Common Tasks

## Running a Compliance Check Manually

Sometimes you need to re-check a deal:

1. Go to the property/deal
2. Click "Run Compliance Check"
3. Wait for results
4. Review any issues found

## Checking a Specific Person for Sanctions

Before adding someone to a deal:

1. Go to Compliance > Sanctions Screening
2. Click "Screen Individual"
3. Enter their name and details
4. Click "Screen"
5. Review results

## Viewing All Deals That Failed Compliance

1. Go to Compliance Dashboard
2. Click "Failed Checks" or filter by RED status
3. See all blocked deals
4. Click any deal to see why it failed

## Finding Deals with Fraud Flags

1. Go to Compliance Dashboard
2. Click "Fraud Signals"
3. See all active fraud signals
4. Filter by risk level if needed

## Checking the Overall Compliance Status

1. Go to Compliance Dashboard
2. See summary statistics:
   - Total deals checked
   - Pass/warning/fail percentages
   - Active alerts
   - Pending reviews

## Exporting a Compliance Report

1. Go to Compliance > Reports
2. Select report type
3. Set date range
4. Choose what to include
5. Click "Generate"
6. Download when ready

---

# Part 13: Dashboard Overview

## Main Compliance Dashboard

When you open the Compliance section, you see:

### Summary Cards

| Card | What It Shows |
|------|---------------|
| Total Checks | Number of compliance checks run |
| Pass Rate | Percentage of GREEN results |
| Active Alerts | Alerts needing attention |
| Pending Reviews | Items waiting for review |

### Recent Activity

- Latest compliance checks
- Recent alerts
- Recent status changes

### Charts & Trends

- Compliance status over time
- Issues by category
- Fraud trends
- State-by-state comparison

### Quick Actions

- Run compliance check
- View all alerts
- Screen for sanctions
- Access audit logs

---

# Part 14: Troubleshooting

## "Verification Service Unavailable"

**What it means:** The external service that verifies properties isn't responding.

**What to do:**
1. Wait a few minutes and try again
2. Check if there's a system-wide issue
3. The system will block deals in the meantime (safety first)
4. Contact support if it persists

## "All Parties Must Be Screened"

**What it means:** Sanctions screening couldn't complete for everyone.

**What to do:**
1. Check which parties failed screening
2. Try screening them individually
3. Verify names are entered correctly
4. If API is down, wait and retry

## "Rule Evaluation Failed"

**What it means:** A compliance rule couldn't be checked properly.

**What to do:**
1. Check if required information is missing
2. Review the specific rule that failed
3. Add missing information
4. Run check again

## Deal Stuck on YELLOW

**What to do:**
1. Review all warnings
2. Determine if they're acceptable
3. Add notes for each issue explaining your decision
4. Proceed if comfortable, or address issues first

## Deal Stuck on RED

**What to do:**
1. Review all critical issues
2. Each one must be resolved or explained
3. Fix what you can
4. Some issues may mean the deal can't proceed
5. Run compliance check again after fixes

## Fraud Score Seems Wrong

**What to do:**
1. Review each fraud signal
2. Clear false positives with notes
3. If legitimate activity triggered it, document why
4. Contact compliance team if patterns seem off

## Can't Find Audit Logs

**What to do:**
1. Check your date range filters
2. Make sure you have permission to view logs
3. Try different filter combinations
4. Logs might be in a different section

---

# Part 15: Glossary

| Term | What It Means |
|------|---------------|
| **AVM** | Automated Valuation Model - computer-estimated property value |
| **Compliance Check** | Automated review of a deal against all rules |
| **Daisy Chain** | When a wholesaler sells to another wholesaler (often discouraged) |
| **Dead Letter** | A failed automated action waiting for manual handling |
| **Encumbrance** | Any claim or restriction on a property |
| **Fail-Safe Mode** | Safety feature that blocks deals when verification isn't available |
| **Fraud Signal** | An indicator of potentially fraudulent activity |
| **GREEN/YELLOW/RED** | Compliance status - pass/warning/fail |
| **Lien** | A legal claim against property for unpaid debts |
| **Lis Pendens** | Notice that a lawsuit involving the property is pending |
| **OFAC** | Office of Foreign Assets Control - manages US sanctions |
| **Risk Score** | 0-100 rating of how risky a deal appears |
| **Sanctions** | Government restrictions on doing business with certain people/entities |
| **SDN** | Specially Designated Nationals - OFAC's main sanctions list |
| **Title** | Legal ownership rights to a property |
| **Velocity Check** | Detecting unusually high submission frequency |
| **Webhook** | Automatic notification sent to external systems |

---

# Part 16: Quick Reference

## Status Colors

| Color | Status | Meaning | Action |
|-------|--------|---------|--------|
| Green | PASS | All clear | Proceed |
| Yellow | WARNING | Minor issues | Review then proceed |
| Red | FAIL | Critical issues | Cannot proceed until resolved |

## Risk Levels

| Level | Score | Meaning |
|-------|-------|---------|
| Low | 0-39 | Normal |
| Medium | 40-59 | Extra caution |
| High | 60-79 | Manual review required |
| Critical | 80-100 | Blocked |

## Alert Priorities

| Priority | Response Time |
|----------|---------------|
| Critical | Immediate |
| High | Same day |
| Warning | Within 48 hours |
| Info | When convenient |

## Key Contacts

For compliance system issues:
- Check internal documentation first
- Contact your compliance officer
- For technical issues, contact IT support

---

# Summary

The Dispotree Compliance System protects you by automatically checking:

1. **Fraud** - Is this deal suspicious?
2. **Sanctions** - Is anyone on a government list?
3. **Property** - Is the seller the real owner?
4. **Title** - Are there liens or legal issues?
5. **State Rules** - Does the deal meet state requirements?

Every check is logged for your protection. When issues are found, you're alerted immediately. Critical issues block deals automatically - this protects you from bad transactions.

**Remember:**
- GREEN means go
- YELLOW means proceed with caution
- RED means stop and fix issues first

When in doubt, check the audit trail, review the specific flags, and consult your compliance team.

---

*This guide covers the Dispotree Compliance System v1.0*
*Last Updated: January 2026*
