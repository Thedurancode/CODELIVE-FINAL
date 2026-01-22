# Dispotree User Workflows

A simple guide to how each user type interacts with the platform.

---

## User Types

| User | Who They Are | What They Do |
|------|--------------|--------------|
| **Team Member** | Internal staff | Add deals, manage pipeline |
| **Wholesaler** | External client | Submit deals to sell |
| **Buyer** | Marketplace user | Browse and purchase deals |
| **Broker** | Internal reviewer | Approve deals for marketplace |

---

## Team Member Flow

Team members add deals on behalf of wholesalers and manage them through the pipeline.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TEAM MEMBER WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

    ADD DEAL              UPLOAD              COMPLIANCE           MARKETPLACE
    ────────              ──────              ──────────           ───────────
       │                     │                     │                    │
       ▼                     ▼                     ▼                    ▼
  ┌─────────┐          ┌─────────┐          ┌─────────┐          ┌─────────┐
  │ New Deal│    →     │ Upload  │    →     │  Check  │    →     │  Live!  │
  │  Form   │          │Contract │          │ Status  │          │         │
  └─────────┘          └─────────┘          └─────────┘          └─────────┘
       │                     │                     │                    │
   Fill out:            PDF of signed        GREEN = Good          Buyers can
   • Address            purchase             YELLOW = Review        see deal
   • Price              contract             RED = Fix issues       and make
   • ARV                with seller                                 offers
   • Seller info
```

### Daily Tasks

| Task | When | How |
|------|------|-----|
| Add new deals | As they come in | New Deal → Fill form → Upload contract |
| Check compliance | After upload | Deal page → Check status color |
| Fix RED issues | When flagged | Get addendum signed → Re-upload |
| Handle offers | When notified | Review → Accept/Reject/Counter |
| Track pipeline | Daily | Pipeline view → Monitor stages |

### Compliance Status Colors

| Color | Meaning | Action |
|-------|---------|--------|
| GREEN | All checks passed | Wait for broker approval |
| YELLOW | Minor issues | Review and clarify |
| RED | Problems found | Fix and re-upload |

---

## Wholesaler Flow

Wholesalers are external clients who bring deals to sell through the platform.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WHOLESALER WORKFLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

   ONE-TIME SETUP                              PER-DEAL PROCESS
   ──────────────                              ────────────────

   ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
   │  LLC    │  →  │ Upload  │  →  │  Sign   │  →  │ Submit  │  →  │ Receive │
   │ Profile │     │  Docs   │     │  CSA    │     │ Deals   │     │ Offers  │
   └─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
        │               │               │               │               │
    Enter:          • Articles      DocuSeal        • Property       Review &
    • LLC name        of Org        sends you       • Contract       Accept or
    • EIN           • Operating     the CSA         • Photos         Counter
    • Address         Agreement     to sign
```

### Setup Checklist (One Time)

- [ ] Complete LLC profile (legal name, EIN, address)
- [ ] Upload Articles of Organization
- [ ] Upload Operating Agreement
- [ ] Identify authorized signer
- [ ] Sign Client Services Agreement (CSA)

### Per-Deal Steps

1. **Get property under contract** with seller
2. **Submit deal** to Dispotree (address, price, ARV, photos)
3. **Upload contract** (must include 8 OK disclosures)
4. **Wait for compliance** check (GREEN = good)
5. **Sign MSA** (Marketing Services Agreement)
6. **Wait for broker** approval
7. **Deal goes live** on marketplace
8. **Review offers** from buyers
9. **Accept offer** → Sign assignment
10. **Get paid** at closing

### Required Contract Elements

| Element | Why |
|---------|-----|
| Your LLC as buyer | Or "and/or assigns" |
| AS-IS language | Protects from repairs |
| Seller signature | Proves agreement |
| Assignment clause | Allows transfer |
| 8 OK disclosures | Legal requirement |

---

## Buyer Flow

Buyers browse the marketplace and purchase wholesale deals.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BUYER WORKFLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    SETUP                BROWSE               OFFER                CLOSE
    ─────                ──────               ─────                ─────
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
  ┌─────────┐          ┌─────────┐          ┌─────────┐          ┌─────────┐
  │ Create  │    →     │  Swipe  │    →     │  Make   │    →     │  Sign   │
  │ Account │          │  Deals  │          │ Offer   │          │ & Close │
  └─────────┘          └─────────┘          └─────────┘          └─────────┘
       │                    │                    │                    │
   • Profile            Like/Pass           • Price              • Assignment
   • Buy Box            on deals            • Earnest $          • Wire funds
   • Proof of           that match          • Timeline           • Own it!
     Funds              criteria            • POF
```

### Getting Started

1. **Create account** (name, email, phone)
2. **Set up Buy Box** (what you're looking for)
   - States/cities
   - Price range
   - Property types
   - Investment strategy
3. **Upload proof of funds** (for cash offers)

### Making Offers

| Field | What to Enter |
|-------|---------------|
| Offer Amount | What you'll pay |
| Earnest Money | Your deposit (shows you're serious) |
| Days to Close | How fast you can close |
| Finance Type | Cash, Hard Money, or Conventional |
| Contingencies | Any conditions |

### Offer Status

| Status | Meaning |
|--------|---------|
| Pending | Waiting for response |
| Viewed | Wholesaler saw it |
| Accepted | You got the deal! |
| Rejected | Try another deal |
| Countered | They want different terms |
| Expired | Didn't respond in time |

### After Acceptance

1. Sign assignment agreement (DocuSeal)
2. Wire funds to title company
3. Close at title
4. You own the property!

---

## Broker Flow

Brokers review deals before they go live on the marketplace.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROKER WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    QUEUE                REVIEW               DECIDE
    ─────                ──────               ──────
       │                    │                    │
       ▼                    ▼                    ▼
  ┌─────────┐          ┌─────────┐          ┌─────────┐
  │ Pending │    →     │ Check   │    →     │ Approve │
  │  Deals  │          │ Details │          │ Reject  │
  └─────────┘          └─────────┘          └─────────┘
       │                    │                    │
   Deals that           • Contract           Approve = Live
   passed               • Compliance         Reject = Back
   compliance           • Numbers              to team
   checks               • Photos
```

### Review Checklist

- [ ] Contract uploaded and readable
- [ ] Compliance status is GREEN
- [ ] Numbers make sense (price vs ARV)
- [ ] Photos are adequate
- [ ] Seller info is complete
- [ ] MSA is signed

### Decision Options

| Action | Result |
|--------|--------|
| **Approve** | Deal goes live on marketplace |
| **Reject** | Deal returns to team with notes |
| **Request Info** | Ask for more details before deciding |

---

## Deal Lifecycle (All Users)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPLETE DEAL LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 0    Phase 2      Phase 4       Phase 7      Phase 9      Phase 12
  │           │            │             │            │             │
  ▼           ▼            ▼             ▼            ▼             ▼
┌────┐     ┌────┐       ┌────┐        ┌────┐      ┌────┐        ┌────┐
│LLC │ ──▶ │Deal│ ──▶   │Disc│  ──▶   │Dist│ ──▶  │Live│  ──▶   │DONE│
│Setup│    │Entry│      │Check│       │Agree│     │Mktp│        │    │
└────┘     └────┘       └────┘        └────┘      └────┘        └────┘
  │           │            │             │            │             │
  │        Upload        System        Sign MSA    Receive      Title
  │        contract      checks 8      + maybe     offers       company
Sign CSA   with seller   disclosures   ASA         from         closes
                                                   buyers       deal

         ══════════════════════════════════════════════════════════
         │    GATE 1    │   GATE 2   │  GATE 3  │    GATE 4    │
         │   LLC OK?    │  Contract  │ GREEN?   │   Broker     │
         │              │  Valid?    │          │   Approved?  │
         ══════════════════════════════════════════════════════════
```

---

## Oklahoma-Specific Requirements

### The 8 Required Disclosures

Every Oklahoma wholesale contract must disclose these to the seller:

| # | Disclosure | Plain English |
|---|------------|---------------|
| 1 | Not a Licensed Broker | "I'm not a real estate agent" |
| 2 | Acting as Principal | "I'm buying for myself" |
| 3 | Equitable Interest Only | "I'm getting contract rights, not the deed yet" |
| 4 | Intent to Assign | "I plan to sell this contract to another buyer" |
| 5 | **Assignment Compensation** | "I'll make money when I assign this" |
| 6 | Marketing During Due Diligence | "I'll advertise while under contract" |
| 7 | No Guarantee | "I can't promise the end buyer will close" |
| 8 | **Independent Legal Advice** | "You should talk to your own lawyer" |

**#5 and #8 are critical - missing either = RED status**

### Oklahoma Blocking Gates

| Gate | After Phase | What It Checks |
|------|-------------|----------------|
| LLC Hard Gate | 0 | LLC profile, Articles, Operating Agreement, CSA signed |
| Contract Validation | 3 | Buyer matches, Assignable, AS-IS, Not expired, Signature |
| Compliance Status | 5 | GREEN status, All 8 disclosures present |
| Distribution Agreements | 7 | MSA signed, ASA signed (if using auction) |
| Broker Approval | 8 | Broker reviewed and approved |
| Timing Validation | 10 | Cancellation delivered before assignment |

---

## Contract Signing (DocuSeal)

All contracts are signed electronically through DocuSeal.

### Documents by Role

| Document | Who Signs | When |
|----------|-----------|------|
| **CSA** (Client Services Agreement) | Wholesaler | LLC setup (once) |
| **MSA** (Marketing Services Agreement) | Wholesaler | Before distribution |
| **ASA** (Auction Services Agreement) | Wholesaler | If using auction |
| **Cancellation Disclosure** | Seller | After offer accepted |
| **Assignment Agreement** | Wholesaler + Buyer | Before closing |

### Signing Status

| Status | Meaning |
|--------|---------|
| Not Sent | Contract not created yet |
| Sent | Email sent, waiting for signature |
| Opened | They're looking at it |
| Completed | Signed! |
| Declined | They rejected - needs resend |
| Expired | Timed out - needs resend |

---

## Quick Reference

### Pipeline Stages

```
New → Analyzing → Due Diligence → Offered → Negotiating → Under Contract → Closed
```

### Status Meanings

| Status | Color | Meaning |
|--------|-------|---------|
| GREEN | Green | All good, proceed |
| YELLOW | Yellow | Minor issues, review |
| RED | Red | Problems, blocked |

### Key Actions by User

| User | Main Actions |
|------|--------------|
| Team Member | Add deal, Upload contract, Handle offers |
| Wholesaler | Submit deal, Sign agreements, Accept offers |
| Buyer | Browse deals, Make offers, Sign & close |
| Broker | Review deals, Approve/Reject |

---

## Need Help?

| Question | Where to Go |
|----------|-------------|
| Technical issues | Contact support |
| Compliance questions | Check the compliance dashboard |
| Contract issues | Contracts tab → Resend |
| Deal strategy | Talk to your account manager |

---

*User Workflows Guide v1.0 | January 2026*
