# Dispotree System Overview

Dispotree is a **B2B real estate deal distribution platform** that connects wholesalers with institutional buyers (hedge funds). It automates deal intake, scoring, matching, and submission workflows.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DEAL SOURCES                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐ │
│  │   CSV   │ │   API   │ │  Email  │ │ Webhook │ │ Manual  │ │ Firecrawl │ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └─────┬─────┘ │
└───────┼──────────┼──────────┼──────────┼──────────┼────────────────┼───────┘
        └──────────┴──────────┴──────────┴──────────┴────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEAL PROCESSING SERVICE                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Normalizer   │→ │ Deduplicator │→ │ Validator    │→ │ Enrichment   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SCORING ENGINE                                    │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                        Rule-Based Scoring (70%)                     │    │
│  │  • Location Match  • Price Range  • Property Type  • Year Built    │    │
│  │  • Bedrooms        • Equity       • Condition      • Photos        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     ML Scoring Plugin (30%)                         │    │
│  │  • TensorFlow.js Neural Network                                     │    │
│  │  • Learns from historical outcomes                                  │    │
│  │  • Cold-start handling for new system                              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BUY BOX MATCHING                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ Fund A      │  │ Fund B      │  │ Fund C      │  │ Fund D      │       │
│  │ Score: 92   │  │ Score: 87   │  │ Score: 75   │  │ Score: 68   │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTOMATION ENGINE                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Auto-Submit  │  │ Notifications│  │ Webhooks     │  │ Browser      │   │
│  │ to Funds     │  │ & Emails     │  │ & APIs       │  │ Automation   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MARKETPLACE & FEEDBACK LOOP                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Deal Feed    │  │ User Actions │  │ Offers       │  │ Fund         │   │
│  │ Display      │  │ (Like/Pass)  │  │ Management   │  │ Responses    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                              │                              │               │
│                              └──────────────┬───────────────┘               │
│                                             ▼                               │
│                              ┌──────────────────────────┐                   │
│                              │   ML Training Data       │                   │
│                              │   (Feedback Loop)        │                   │
│                              └──────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Deal Sources (Plugins)

The system ingests deals from multiple sources via a pluggable architecture:

| Plugin | Description | Use Case |
|--------|-------------|----------|
| **CSV Import** | Bulk upload from spreadsheets | Wholesaler deal lists |
| **REST API** | Programmatic deal submission | Integration with CRMs |
| **Email Parser** | Extract deals from emails | Automated inbox processing |
| **Webhook Receiver** | Real-time deal ingestion | External system triggers |
| **Manual Entry** | Form-based input | One-off deals |
| **Firecrawl** | Web scraping/crawling | Auction sites, listings |

**Location:** `src/plugins/sources/`

```typescript
// Example: Submitting a deal via API
POST /api/plugins/deals/ingest
{
  "source": "api",
  "deals": [{
    "address": "123 Main St",
    "city": "Miami",
    "state": "FL",
    "price": 250000,
    "arv": 350000,
    "propertyType": "single_family"
  }]
}
```

---

### 2. Deal Processing Pipeline

Every deal flows through this pipeline:

```
Raw Deal → Normalize → Deduplicate → Validate → Enrich → Store
```

#### A. Normalization
Converts various input formats to a standard `NormalizedDeal` structure:
- Standardizes addresses (123 Main St → 123 MAIN STREET)
- Normalizes property types (SFH → single_family)
- Parses prices ($250k → 250000)
- Extracts coordinates from addresses

#### B. Deduplication
Prevents duplicate deals using multiple strategies:
- Address matching (exact + fuzzy)
- Coordinate proximity (within 50m)
- Property ID matching
- Configurable time window (default: 30 days)

#### C. Validation
Ensures data quality:
- Required fields present (address, price, state)
- Price within reasonable bounds
- Valid state codes
- Property type recognized

#### D. Enrichment
Adds additional data from external sources:
- **Zillow API** - Zestimate, rental estimates
- **Attom API** - Property details, tax records
- **Rentometer** - Rental comps
- **Market Data** - Local market trends
- **AI Analysis** - Property condition assessment

**Location:** `src/plugins/enrichment/`

---

### 3. Scoring Engine

The heart of the system - determines how well a deal matches each fund's criteria.

#### Rule-Based Scoring (70% weight)

Evaluates deals against buy box criteria:

| Criterion | Max Points | Logic |
|-----------|------------|-------|
| Location Match | 20 | State + county + city match |
| Price Range | 15 | Within min/max bounds |
| Property Type | 10 | Matches allowed types |
| Bedrooms | 10 | Meets minimum requirement |
| Year Built | 10 | Above minimum year |
| Equity/ARV | 15 | Meets equity threshold |
| Condition | 10 | Matches rehab preferences |
| Photo Count | 5 | Has sufficient photos |
| Occupancy | 5 | Matches vacancy preference |

**Hard Requirements:** Some criteria are pass/fail (e.g., must be in target state)

#### ML Scoring Plugin (30% weight)

TensorFlow.js neural network that learns from outcomes:

```
Input Features (82 total)
       ↓
Dense(64, ReLU) + Dropout
       ↓
Dense(32, ReLU) + Dropout
       ↓
Dense(16, ReLU)
       ↓
Dense(1, Sigmoid) → Success Probability
```

**Cold Start Handling:**
- 0-99 samples: Returns neutral score (50%)
- 100-499 samples: 20% ML weight
- 500+ samples: Full 30% ML weight

**Location:** `src/plugins/scoring/` and `src/plugins/ml/`

---

### 4. Buy Box System

Buy boxes define what each fund is looking for:

```typescript
// Example Buy Box
{
  "fundName": "Acme Capital",
  "criteria": {
    "states": ["FL", "TX", "GA"],
    "minPrice": 100000,
    "maxPrice": 500000,
    "propertyTypes": ["single_family", "townhouse"],
    "minBedrooms": 3,
    "minYearBuilt": 1980,
    "minEquity": 0.20,
    "occupancyPreference": "vacant"
  },
  "scoringWeights": {
    "location": 1.5,  // 50% more important
    "price": 1.0,
    "equity": 1.2
  },
  "autoSubmit": true,
  "autoSubmitThreshold": 85
}
```

**Stored in:** `hedge_fund_buy_boxes` table

**API:**
```bash
# List all buy boxes
GET /api/hedgefunds

# Score a deal against all buy boxes
POST /api/hedgefunds/score
{"dealId": "deal-123"}
```

---

### 5. Automation Engine

Event-driven workflow system that triggers actions:

#### Workflow Templates

| Template | Trigger | Actions |
|----------|---------|---------|
| Standard | New deal | Score → Notify if >70 → Queue review |
| Fast Track | High score (>90) | Score → Auto-submit → Notify |
| High Value | Price >$500k | Score → Compliance check → Manager review |
| Marketplace | Any deal | Score → Publish to marketplace |

#### Action Handlers

| Action | Description |
|--------|-------------|
| `send_email` | Email notifications |
| `send_webhook` | HTTP callbacks |
| `update_deal` | Modify deal properties |
| `add_tag` | Tag deals for filtering |
| `send_notification` | In-app notifications |
| `score_against_buybox` | Trigger scoring |
| `run_compliance_check` | AI compliance analysis |
| `enrich_deal` | Add external data |
| `submit_to_marketplace` | Publish to deal feed |

**Location:** `src/plugins/automation/`

---

### 6. Browser Automation

Playwright-based automation for submitting to auction sites:

```
┌─────────────────────────────────────────────────────────┐
│                  Browser Automation                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Human       │  │ CAPTCHA     │  │ Smart       │     │
│  │ Behavior    │  │ Solver      │  │ Selectors   │     │
│  │ Simulation  │  │ Integration │  │ (AI-based)  │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│  ┌─────────────┐  │ ┌─────────────┐  ┌─────────────┐   │
│  │ Stealth     │  │ Session     │  │ Resilience  │     │
│  │ Config      │  │ Manager     │  │ Layer       │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Human-like typing, mouse movements, scrolling
- CAPTCHA solving (2Captcha, Anti-Captcha, CapSolver)
- Session persistence across submissions
- Retry logic with exponential backoff
- Screenshot capture for debugging

**Location:** `src/plugins/browser/`

---

### 7. AI Agents

LangChain-powered AI assistants:

| Agent | Purpose |
|-------|---------|
| **Compliance** | Analyze contracts, verify legal requirements |
| **BuyBox** | Intelligent property-to-fund matching |
| **Guardrail** | Content moderation, data validation |
| **Underwriting** | Data enrichment (coming soon) |
| **Offers** | Offer ranking, buyer behavior (coming soon) |
| **Communication** | Automated buyer communication (coming soon) |

**Location:** `src/services/agentService.ts`

```bash
# Chat with AI agent
POST /api/agent/chat
{
  "message": "Find me all 3-bed houses in Florida under $300k"
}
```

---

### 8. ML Training & Feedback Loop

The system continuously learns from outcomes:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Fund        │     │ Deal        │     │ Deal        │
│ Feedback    │ ──→ │ Actions     │ ──→ │ Offers      │
│ (API)       │     │ (Automatic) │     │ (Automatic) │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                           ▼
                 ┌─────────────────┐
                 │ Training Data   │
                 │ (100+ samples)  │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Model Training  │
                 │ (TensorFlow.js) │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Model Deployed  │
                 │ (If AUC > 0.65) │
                 └─────────────────┘
```

**Auto-Retraining Triggers:**
- 50+ new labeled outcomes
- Model older than 30 days
- Accuracy drops 10%

**Location:** `src/plugins/ml/`

---

### 9. Marketplace

B2B marketplace for deal distribution:

#### For Buyers (Funds)
- Browse scored deals
- Filter by criteria
- Like/pass on deals
- Make offers
- Track deal history

#### For Sellers (Wholesalers)
- Submit deals
- View scores across funds
- Track submissions
- Manage offers

**Models:**
- `MarketplaceUser` - Buyer accounts
- `UserBuyBox` - Buyer preferences
- `DealAction` - Like/pass/view events
- `DealOffer` - Offer management

**Location:** `src/routes/marketplaceRoutes.ts`

---

## Database Schema

### Core Tables

```
┌─────────────────┐     ┌─────────────────┐
│   properties    │     │hedge_fund_buy_  │
│                 │     │     boxes       │
│ • propertyId    │     │ • criteria      │
│ • address       │     │ • scoringWeights│
│ • price, arv    │     │ • autoSubmit    │
│ • bedrooms, etc │     │ • threshold     │
└────────┬────────┘     └─────────────────┘
         │
         ├──────────────────────────────────┐
         │                                  │
         ▼                                  ▼
┌─────────────────┐                ┌─────────────────┐
│  deal_actions   │                │   deal_offers   │
│ • like/pass     │                │ • offerAmount   │
│ • viewDuration  │                │ • status        │
│ • userId        │                │ • userId        │
└─────────────────┘                └─────────────────┘
```

### ML Tables

```
┌─────────────────┐     ┌─────────────────┐
│  fund_feedback  │     │  ml_predictions │
│ • dealId        │     │ • dealId        │
│ • responseType  │     │ • predictedScore│
│ • dealSnapshot  │     │ • actualOutcome │
└─────────────────┘     └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌─────────────────┐     ┌─────────────────┐
         │ model_versions  │←────│  training_runs  │
         │ • modelPath     │     │ • hyperparams   │
         │ • metrics       │     │ • status        │
         │ • isProduction  │     │ • metrics       │
         └─────────────────┘     └─────────────────┘
```

---

## API Structure

```
/api
├── /health              # Health check
├── /listings            # Property CRUD
├── /hedgefunds          # Buy box management
│   ├── GET /            # List all buy boxes
│   ├── POST /           # Create buy box
│   ├── POST /score      # Score deal against buy boxes
│   └── /:id/submit      # Submit deal to fund
├── /plugins             # Plugin management
│   ├── /deals/ingest    # Ingest deals from sources
│   ├── /workflows       # Workflow management
│   └── /automations     # Automation rules
├── /marketplace         # B2B marketplace
│   ├── /deals           # Deal feed
│   ├── /actions         # User interactions
│   └── /offers          # Offer management
├── /agent               # AI chat interface
│   └── /chat            # Conversational AI
├── /ml                  # ML operations
│   ├── /status          # Service status
│   ├── /readiness       # Training readiness
│   ├── /feedback        # Record outcomes
│   ├── /training        # Training management
│   ├── /models          # Model management
│   └── /insights        # Analytics
└── /api-docs            # Swagger documentation
```

---

## Data Flow Example

**Scenario:** Wholesaler submits a deal via CSV

```
1. INGEST
   CSV uploaded → CSV Plugin parses → Raw deals extracted

2. PROCESS
   Normalize address → Check duplicates → Validate fields → Enrich with Zillow

3. STORE
   Save to properties table → Generate propertyId

4. SCORE
   For each active buy box:
     → Apply rule-based criteria (70%)
     → Apply ML prediction (30%)
     → Calculate final score

5. MATCH
   Rank buy boxes by score:
     Fund A: 92 points (auto-submit)
     Fund B: 78 points (notify)
     Fund C: 45 points (skip)

6. AUTOMATE
   Fund A score > 85 → Trigger auto-submit workflow
     → Send to Fund A portal
     → Log submission
     → Notify wholesaler

7. FEEDBACK
   Fund A responds "offer_accepted"
     → Record in fund_feedback
     → Update ML training data
     → Retrain model if threshold met
```

---

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dispotree

# AI/ML
OPENAI_API_KEY=sk-...          # For AI agents
FIRECRAWL_API_KEY=...          # For web crawling

# Browser Automation
CAPTCHA_PROVIDER=2captcha      # 2captcha, anticaptcha, capsolver
CAPTCHA_API_KEY=...

# External APIs (Enrichment)
ZILLOW_API_KEY=...
ATTOM_API_KEY=...
RENTOMETER_API_KEY=...

# Server
PORT=3001
NODE_ENV=development
```

---

## Performance Characteristics

| Operation | Typical Latency |
|-----------|-----------------|
| Deal ingestion | <100ms |
| Scoring (per buy box) | <50ms |
| ML prediction | <20ms |
| Full enrichment | 2-5s |
| Browser submission | 30-120s |

---

## Extensibility Points

1. **Deal Sources** - Add new plugins in `src/plugins/sources/`
2. **Enrichment Providers** - Add in `src/plugins/enrichment/`
3. **Scoring Criteria** - Extend `ScoringEngine.ts`
4. **ML Models** - Add models in `src/plugins/ml/models/`
5. **Automation Actions** - Register in `ActionRegistry.ts`
6. **Workflows** - Define in `WorkflowRegistry.ts`

---

## Summary

Dispotree automates the real estate deal distribution pipeline:

1. **Ingest** deals from multiple sources
2. **Process** with normalization, deduplication, enrichment
3. **Score** against fund buy boxes using rules + ML
4. **Match** deals to the best-fit funds
5. **Automate** submissions, notifications, workflows
6. **Learn** from outcomes to improve over time

The plugin architecture makes it extensible, while the ML layer ensures it gets smarter with use.
