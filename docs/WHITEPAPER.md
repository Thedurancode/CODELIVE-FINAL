 # Dispotree Technical White Paper

**Version 1.0 | December 2025**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [System Architecture](#4-system-architecture)
5. [Core Platform Components](#5-core-platform-components)
6. [AI Agent System](#6-ai-agent-system)
7. [Deal Pipeline & Portfolio Management](#7-deal-pipeline--portfolio-management)
8. [Automation Engine](#8-automation-engine)
9. [E-Signature Integration](#9-e-signature-integration)
10. [Machine Learning Infrastructure](#10-machine-learning-infrastructure)
11. [Data Architecture](#11-data-architecture)
12. [API Design & OpenAI Compatibility](#12-api-design--openai-compatibility)
13. [Security Architecture](#13-security-architecture)
14. [Integration Ecosystem](#14-integration-ecosystem)
15. [Deployment & Infrastructure](#15-deployment--infrastructure)
16. [Performance & Scalability](#16-performance--scalability)
17. [Future Roadmap](#17-future-roadmap)

---

## 1. Executive Summary

Dispotree is an enterprise-grade real estate wholesale deal management platform that combines artificial intelligence, machine learning, and automation to transform how investment properties are sourced, analyzed, and distributed to institutional buyers.

### Key Differentiators

| Capability | Description |
|------------|-------------|
| **AI-Powered Deal Analysis** | 30+ tool conversational AI agent for natural language deal management |
| **Multi-Source Ingestion** | Unified pipeline for API, email, webhook, CSV, and web-scraped deals |
| **Intelligent Matching** | ML-enhanced buy box scoring with continuous learning from outcomes |
| **End-to-End Automation** | Event-driven workflows from deal receipt to contract signing |
| **E-Signature Integration** | Native DocuSeal integration with automatic pipeline updates |
| **Portfolio Intelligence** | Track owned properties with valuations, cash flow, and ROI analytics |

### Platform Statistics

- **180+ API Endpoints** across 12 major modules
- **30+ AI Agent Tools** for conversational deal management
- **7-Stage Deal Pipeline** with full audit trail
- **90+ Property Fields** for comprehensive deal data
- **6 Deal Source Plugins** for multi-channel ingestion
- **20+ Automation Actions** including e-signature workflows

---

## 2. Problem Statement

### Industry Challenges

The real estate wholesale market faces significant operational inefficiencies:

**2.1 Fragmented Deal Sources**
- Deals arrive via email, spreadsheets, APIs, and phone calls
- No standardized data format across wholesalers
- Manual data entry leads to errors and delays

**2.2 Inefficient Matching**
- Manual matching of properties to buyer criteria
- Inconsistent evaluation standards
- Missed opportunities due to processing delays

**2.3 Compliance Complexity**
- State-specific wholesale regulations (OK HB1089, MD SB0205, IL SB1872)
- Contract clause verification requirements
- Audit trail requirements for institutional buyers

**2.4 Distribution Bottlenecks**
- Manual submission to auction platforms (Xome, Hubzu)
- Email-based fund communication
- No centralized offer management

**2.5 Lack of Intelligence**
- No learning from deal outcomes
- Static buy box criteria
- No predictive analytics

### Market Opportunity

| Metric | Value |
|--------|-------|
| US Wholesale Real Estate Market | $30B+ annually |
| Average Deal Processing Time | 4-7 days |
| Manual Processing Error Rate | 15-20% |
| Deals Lost to Competition | 30%+ |

---

## 3. Solution Overview

Dispotree addresses these challenges through an integrated platform architecture:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DISPOTREE PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         INGESTION LAYER                                   │   │
│  │                                                                           │   │
│  │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │   │
│  │   │   API   │ │  Email  │ │ Webhook │ │   CSV   │ │DispoCrawl│           │   │
│  │   │ Plugin  │ │ Parser  │ │Receiver │ │ Import  │ │(Firecrawl)│          │   │
│  │   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │   │
│  │        └───────────┴───────────┴───────────┴───────────┘                 │   │
│  │                                │                                          │   │
│  │                    ┌───────────▼───────────┐                             │   │
│  │                    │  NORMALIZATION ENGINE  │                             │   │
│  │                    └───────────┬───────────┘                             │   │
│  └────────────────────────────────┼──────────────────────────────────────────┘  │
│                                   │                                              │
│  ┌────────────────────────────────┼──────────────────────────────────────────┐  │
│  │                         PROCESSING LAYER                                   │  │
│  │                                │                                           │  │
│  │   ┌──────────────┐   ┌────────▼────────┐   ┌──────────────┐              │  │
│  │   │  COMPLIANCE  │   │  SCORING ENGINE │   │  ENRICHMENT  │              │  │
│  │   │    AGENT     │   │  (Buy Box Match)│   │   (Zillow,   │              │  │
│  │   │              │   │                 │   │   ATTOM)     │              │  │
│  │   └──────┬───────┘   └────────┬────────┘   └──────┬───────┘              │  │
│  │          └────────────────────┼────────────────────┘                      │  │
│  │                               │                                           │  │
│  │                    ┌──────────▼──────────┐                               │  │
│  │                    │  AUTOMATION ENGINE   │                               │  │
│  │                    │  (Event-Driven)      │                               │  │
│  │                    └──────────┬──────────┘                               │  │
│  └───────────────────────────────┼───────────────────────────────────────────┘  │
│                                  │                                               │
│  ┌───────────────────────────────┼───────────────────────────────────────────┐  │
│  │                        DISTRIBUTION LAYER                                  │  │
│  │                               │                                            │  │
│  │   ┌──────────┐   ┌───────────▼───────────┐   ┌──────────────┐            │  │
│  │   │MARKETPLACE│   │    DEAL PIPELINE     │   │  E-SIGNATURE │            │  │
│  │   │ (Swipe)   │   │  (7-Stage Tracking)  │   │  (DocuSeal)  │            │  │
│  │   └─────┬─────┘   └───────────┬──────────┘   └──────┬───────┘            │  │
│  │         │                     │                      │                    │  │
│  │         ▼                     ▼                      ▼                    │  │
│  │   ┌──────────┐   ┌───────────────────┐   ┌──────────────────┐           │  │
│  │   │  OFFERS  │   │    PORTFOLIO      │   │  HEDGE FUNDS /   │           │  │
│  │   │          │   │   MANAGEMENT      │   │  AUCTION SITES   │           │  │
│  │   └──────────┘   └───────────────────┘   └──────────────────┘           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                         INTELLIGENCE LAYER                                 │  │
│  │                                                                            │  │
│  │   ┌────────────────┐   ┌────────────────┐   ┌────────────────┐           │  │
│  │   │ WIN/LOSS       │   │ AGENT METRICS  │   │ ML PREDICTION  │           │  │
│  │   │ ANALYSIS       │   │ & ACCURACY     │   │ ENGINE         │           │  │
│  │   └────────────────┘   └────────────────┘   └────────────────┘           │  │
│  │                                                                            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. System Architecture

### 4.1 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Node.js 18+ | Server-side JavaScript execution |
| **Framework** | Express.js | HTTP server and routing |
| **Language** | TypeScript | Type-safe development |
| **Database** | PostgreSQL 14+ | Primary data persistence |
| **ORM** | Sequelize | Database abstraction and migrations |
| **Cache** | Redis | Session storage, rate limiting, caching |
| **Vector DB** | Pinecone | RAG knowledge base and semantic search |
| **AI/LLM** | OpenRouter / OpenAI | Language model inference |
| **ML** | TensorFlow.js | On-device machine learning |
| **E-Signature** | DocuSeal | Contract signing workflows |
| **Browser Automation** | Playwright | Auction site submissions |
| **API Documentation** | Scalar (OpenAPI 3.1) | Interactive API docs |

### 4.2 Directory Structure

```
dispotree/
├── backend/
│   ├── src/
│   │   ├── config/                 # Database, Swagger, environment
│   │   ├── controllers/            # HTTP request handlers
│   │   ├── middleware/             # Auth, CORS, rate limiting
│   │   ├── models/                 # Sequelize data models
│   │   ├── plugins/
│   │   │   ├── sources/            # Deal source plugins
│   │   │   ├── scoring/            # Buy box scoring engine
│   │   │   ├── automation/         # Event-driven automation
│   │   │   ├── workflow/           # Multi-step workflows
│   │   │   ├── browser/            # Playwright automation
│   │   │   ├── ai/                 # AI analysis services
│   │   │   └── ml/                 # TensorFlow.js models
│   │   ├── routes/                 # Express route definitions
│   │   ├── services/               # Business logic layer
│   │   │   ├── agentService.ts     # LangChain AI agent
│   │   │   ├── PipelineService.ts  # Deal pipeline management
│   │   │   ├── PortfolioService.ts # Portfolio tracking
│   │   │   ├── DocuSealService.ts  # E-signature integration
│   │   │   ├── MemoryService.ts    # Long-term AI memory
│   │   │   └── knowledge/          # RAG knowledge base
│   │   ├── types/                  # TypeScript definitions
│   │   └── tests/                  # Unit and integration tests
│   ├── knowledge/                  # Document store for RAG
│   └── uploads/                    # User file uploads
├── frontend/                       # React application
├── docs/                           # Documentation
└── docker-compose.yml              # Container orchestration
```

### 4.3 Request Flow Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            REQUEST FLOW                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   Client Request                                                              │
│        │                                                                      │
│        ▼                                                                      │
│   ┌─────────────┐                                                            │
│   │   Helmet    │  Security headers (CSP, XSS protection)                    │
│   └──────┬──────┘                                                            │
│          │                                                                    │
│          ▼                                                                    │
│   ┌─────────────┐                                                            │
│   │    CORS     │  Cross-origin request handling                             │
│   └──────┬──────┘                                                            │
│          │                                                                    │
│          ▼                                                                    │
│   ┌─────────────┐                                                            │
│   │  Rate Limit │  Redis-backed request throttling                           │
│   └──────┬──────┘                                                            │
│          │                                                                    │
│          ▼                                                                    │
│   ┌─────────────┐                                                            │
│   │ JWT Auth    │  Token validation (optional per route)                     │
│   └──────┬──────┘                                                            │
│          │                                                                    │
│          ▼                                                                    │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│   │   Router    │────▶│ Controller  │────▶│  Service    │                   │
│   └─────────────┘     └─────────────┘     └──────┬──────┘                   │
│                                                   │                          │
│                            ┌──────────────────────┼──────────────────────┐   │
│                            ▼                      ▼                      ▼   │
│                    ┌─────────────┐        ┌─────────────┐        ┌─────────┐│
│                    │ PostgreSQL  │        │   Redis     │        │Pinecone ││
│                    │  (Primary)  │        │  (Cache)    │        │ (RAG)   ││
│                    └─────────────┘        └─────────────┘        └─────────┘│
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Core Platform Components

### 5.1 Deal Source Plugin System

The plugin architecture enables extensible deal ingestion from any data source.

#### Plugin Types

| Plugin | File | Capability |
|--------|------|------------|
| **API** | `APIDealSourcePlugin.ts` | REST API integration with OAuth, pagination |
| **Email** | `EmailDealSourcePlugin.ts` | IMAP/Gmail parsing with AI extraction |
| **Webhook** | `WebhookDealSourcePlugin.ts` | Inbound webhooks with signature verification |
| **CSV** | `CSVDealSourcePlugin.ts` | File upload with delimiter detection |
| **Manual** | `ManualDealSourcePlugin.ts` | Form-based entry with validation |
| **DispoCrawl** | `FirecrawlDealSourcePlugin.ts` | AI web scraping via Firecrawl |

#### Plugin Interface

```typescript
interface DealSourcePlugin {
  id: string;
  name: string;
  type: 'api' | 'email' | 'webhook' | 'csv' | 'manual' | 'firecrawl';

  // Core methods
  initialize(config: PluginConfig): Promise<void>;
  fetchDeals(options?: FetchOptions): Promise<NormalizedDeal[]>;
  validateDeal(deal: RawDeal): ValidationResult;
  normalizeDeal(deal: RawDeal): NormalizedDeal;

  // Lifecycle
  healthCheck(): Promise<HealthStatus>;
  shutdown(): Promise<void>;
}
```

#### Normalization Pipeline

All deals are normalized to a standard 90+ field schema:

```typescript
interface NormalizedDeal {
  // Identification
  externalId: string;
  source: string;
  sourceType: DealSourceType;

  // Address
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    county?: string;
  };

  // Property Details
  propertyType: PropertyType;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lotSize?: number;
  yearBuilt?: number;

  // Financials
  askingPrice: number;
  arv?: number;
  rehabCost?: number;
  equity?: number;

  // Condition
  condition?: 'turnkey' | 'light_rehab' | 'heavy_rehab' | 'teardown';

  // Seller
  wholesalerName?: string;
  wholesalerEmail?: string;
  wholesalerPhone?: string;

  // Metadata
  receivedAt: Date;
  rawData: Record<string, any>;
}
```

### 5.2 Scoring Engine

The scoring engine matches deals against buy box criteria using weighted algorithms.

#### Scoring Weights

```
┌─────────────────────────────────────────────────────────────┐
│                   SCORING WEIGHTS                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Geographic Match    ████████████████████████████░░  30%   │
│   (State/City/Zip)                                           │
│                                                              │
│   Price Range         ████████████████████████░░░░░░  25%   │
│   (Within min/max)                                           │
│                                                              │
│   Property Type       ████████████████░░░░░░░░░░░░░░  15%   │
│   (SFH, Condo, etc)                                          │
│                                                              │
│   Bedrooms            ██████████░░░░░░░░░░░░░░░░░░░░  10%   │
│                                                              │
│   Year Built          ██████████░░░░░░░░░░░░░░░░░░░░  10%   │
│                                                              │
│   Pool Requirement    █████░░░░░░░░░░░░░░░░░░░░░░░░░   5%   │
│                                                              │
│   HOA Preference      █████░░░░░░░░░░░░░░░░░░░░░░░░░   5%   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Match Tiers:
  Strong (80-100)  → Auto-submit recommended
  Moderate (60-79) → Human review suggested
  Weak (50-59)     → Low priority
  No Match (<50)   → Does not meet criteria
```

#### Algorithm Implementation

```typescript
class ScoringEngine {
  private weights: ScoringWeights = {
    geographic: 0.30,
    price: 0.25,
    propertyType: 0.15,
    bedrooms: 0.10,
    yearBuilt: 0.10,
    pool: 0.05,
    hoa: 0.05,
  };

  scoreDeal(deal: NormalizedDeal, buyBox: BuyBox): ScoringResult {
    let totalScore = 0;
    const breakdown: ScoreBreakdown[] = [];

    // Geographic scoring (required - 0 or full points)
    const geoScore = this.scoreGeographic(deal, buyBox);
    if (geoScore === 0) {
      return { score: 0, tier: 'no_match', breakdown, reason: 'Geographic mismatch' };
    }
    totalScore += geoScore * this.weights.geographic * 100;

    // Price scoring (proximity to range)
    const priceScore = this.scorePrice(deal.askingPrice, buyBox.minPrice, buyBox.maxPrice);
    totalScore += priceScore * this.weights.price * 100;

    // Continue for all criteria...

    return {
      score: Math.round(totalScore),
      tier: this.getTier(totalScore),
      breakdown,
      buyBoxId: buyBox.id,
    };
  }
}
```

### 5.3 Marketplace System

A Tinder-style swipe interface for deal discovery and offer management.

#### User Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MARKETPLACE USER FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. ONBOARDING                                                              │
│      ┌──────────────┐                                                       │
│      │ Create User  │──▶ Define Buy Boxes ──▶ Set Notification Prefs       │
│      └──────────────┘                                                       │
│                                                                              │
│   2. DEAL DISCOVERY                                                          │
│      ┌──────────────┐     ┌──────────────┐                                  │
│      │ Get Feed     │────▶│ ML-Ranked    │  Deals scored against buy boxes  │
│      │ (Personalized)│     │ Deal Cards   │  + behavior prediction           │
│      └──────────────┘     └──────┬───────┘                                  │
│                                  │                                           │
│   3. SWIPE ACTIONS               │                                           │
│                    ┌─────────────┴─────────────┐                            │
│                    ▼                           ▼                             │
│             ┌─────────────┐             ┌─────────────┐                     │
│             │    LIKE     │             │    PASS     │                     │
│             │ + View Time │             │ + Feedback  │                     │
│             └──────┬──────┘             └──────┬──────┘                     │
│                    │                           │                             │
│                    ▼                           ▼                             │
│             ┌─────────────┐             ┌─────────────┐                     │
│             │Submit Offer │             │ Learn from  │                     │
│             │             │             │ Pass Reason │                     │
│             └──────┬──────┘             └─────────────┘                     │
│                    │                                                         │
│   4. OFFER LIFECYCLE                                                         │
│                    │                                                         │
│             ┌──────▼──────┐                                                 │
│             │   PENDING   │                                                 │
│             └──────┬──────┘                                                 │
│                    │                                                         │
│       ┌────────────┼────────────┬────────────┐                              │
│       ▼            ▼            ▼            ▼                               │
│   ┌────────┐  ┌────────┐  ┌──────────┐  ┌────────┐                         │
│   │ACCEPTED│  │REJECTED│  │COUNTERED │  │EXPIRED │                         │
│   └────────┘  └────────┘  └──────────┘  └────────┘                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Offer Schema

```typescript
interface DealOffer {
  id: string;
  userId: string;
  dealId: string;

  // Offer Terms
  offerAmount: number;
  earnestMoney: number;
  closingDays: number;
  contingencies: Contingency[];

  // Financing
  financeType: 'cash' | 'hard_money' | 'conventional';
  proofOfFunds: boolean;
  preApprovalLetter?: string;

  // Status
  status: 'pending' | 'viewed' | 'countered' | 'accepted' | 'rejected' | 'expired';

  // Counter Offer
  counterAmount?: number;
  counterNotes?: string;

  // Timestamps
  submittedAt: Date;
  viewedAt?: Date;
  respondedAt?: Date;
  expiresAt: Date;
}
```

---

## 6. AI Agent System

### 6.1 Architecture Overview

The conversational AI agent is built on LangChain with a custom tool registry supporting 30+ specialized tools.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI AGENT ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                        USER INTERFACE                                 │  │
│   │                                                                       │  │
│   │    Chat UI ◄─────────────────────────────────────────────────────►   │  │
│   │                                                                       │  │
│   │    REST API: POST /api/agent/chat                                     │  │
│   │    Streaming: POST /api/agent/chat/stream (SSE)                       │  │
│   │    OpenAI-Compatible: POST /v1/chat/completions                       │  │
│   │                                                                       │  │
│   └───────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│   ┌───────────────────────────────▼──────────────────────────────────────┐  │
│   │                        AGENT EXECUTOR                                 │  │
│   │                                                                       │  │
│   │    ┌─────────────────┐                                               │  │
│   │    │   LLM Provider  │  OpenRouter / OpenAI                          │  │
│   │    │   (Claude/GPT)  │  Model: anthropic/claude-sonnet-4             │  │
│   │    └────────┬────────┘                                               │  │
│   │             │                                                         │  │
│   │    ┌────────▼────────┐     ┌─────────────────┐                       │  │
│   │    │  Agent Memory   │────▶│  Pinecone       │  Long-term memory     │  │
│   │    │  (Conversation) │     │  Vector Store   │  User preferences     │  │
│   │    └────────┬────────┘     └─────────────────┘                       │  │
│   │             │                                                         │  │
│   │    ┌────────▼────────┐     ┌─────────────────┐                       │  │
│   │    │   RAG Context   │────▶│  Knowledge Base │  Document retrieval   │  │
│   │    │                 │     │  (Embeddings)   │                       │  │
│   │    └─────────────────┘     └─────────────────┘                       │  │
│   │                                                                       │  │
│   └───────────────────────────────┬──────────────────────────────────────┘  │
│                                   │                                          │
│   ┌───────────────────────────────▼──────────────────────────────────────┐  │
│   │                          TOOL REGISTRY                                │  │
│   │                                                                       │  │
│   │    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │  │
│   │    │  PROPERTY   │ │  PIPELINE   │ │ PORTFOLIO   │ │  DOCUSEAL   │   │  │
│   │    │   TOOLS     │ │   TOOLS     │ │   TOOLS     │ │   TOOLS     │   │  │
│   │    └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │  │
│   │    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │  │
│   │    │  ANALYTICS  │ │  MARKET     │ │  BUY BOX    │ │  AUTOMATION │   │  │
│   │    │   TOOLS     │ │  DATA TOOLS │ │   TOOLS     │ │   TOOLS     │   │  │
│   │    └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │  │
│   │                                                                       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Tool Categories

#### Property & Deal Tools
| Tool | Description |
|------|-------------|
| `search_properties` | Search with filters (state, city, price, beds, baths) |
| `get_property` | Get detailed property information |
| `analyze_deal` | AI analysis with recommendations |
| `get_market_data` | Zillow/RapidAPI market valuations |

#### Pipeline Tools
| Tool | Description |
|------|-------------|
| `add_to_pipeline` | Add deal to user's pipeline |
| `update_pipeline_stage` | Move deal through stages |
| `get_my_pipeline` | View current pipeline |
| `close_deal` | Mark as won/lost with outcome data |

#### Portfolio Tools
| Tool | Description |
|------|-------------|
| `add_to_portfolio` | Add property to portfolio |
| `get_my_portfolio` | View owned properties |
| `get_portfolio_value` | Total portfolio valuation |
| `update_property_value` | Manual valuation update |

#### E-Signature Tools (DocuSeal)
| Tool | Description |
|------|-------------|
| `list_contract_templates` | Available DocuSeal templates |
| `send_contract` | Send contract for e-signature |
| `get_contract_status` | Check signing status |
| `resend_contract_reminder` | Send reminder to signer |

#### Analytics Tools
| Tool | Description |
|------|-------------|
| `get_win_loss_stats` | Win/loss analysis |
| `get_agent_accuracy` | Agent prediction accuracy |
| `get_pipeline_conversion` | Funnel conversion rates |

### 6.3 Tool Implementation Pattern

```typescript
const sendContractTool = new DynamicStructuredTool({
  name: 'send_contract',
  description: 'Send a contract to a seller for e-signature via DocuSeal',
  schema: z.object({
    templateId: z.number().describe('DocuSeal template ID'),
    propertyAddress: z.string().describe('Property address'),
    sellerName: z.string().describe('Seller full name'),
    sellerEmail: z.string().email().describe('Seller email address'),
    purchasePrice: z.number().describe('Purchase price'),
    closingDate: z.string().optional().describe('Closing date (YYYY-MM-DD)'),
  }),
  func: async ({ templateId, propertyAddress, sellerName, sellerEmail, purchasePrice, closingDate }) => {
    if (!docuSealService.isReady()) {
      return 'DocuSeal is not configured. Please set DOCUSEAL_API_KEY.';
    }

    const submission = await docuSealService.createDealSubmission(templateId, {
      propertyAddress,
      sellerName,
      sellerEmail,
      purchasePrice,
      closingDate: closingDate ? new Date(closingDate) : undefined,
    });

    return `Contract sent successfully! Submission ID: ${submission.id}. ` +
           `The seller (${sellerEmail}) will receive an email to sign.`;
  },
});
```

### 6.4 Long-Term Memory (Pinecone)

The agent maintains persistent memory of user preferences and interactions:

```typescript
interface UserMemory {
  userId: string;

  // Learned Preferences
  preferredStates: string[];
  preferredPriceRange: { min: number; max: number };
  preferredPropertyTypes: PropertyType[];

  // Behavior Patterns
  avgViewDurationLiked: number;
  avgViewDurationPassed: number;
  quickDismissPatterns: string[];

  // Interaction History
  recentSearches: SearchQuery[];
  recentDeals: string[];

  // Embeddings
  preferenceVector: number[];  // For semantic similarity
}
```

---

## 7. Deal Pipeline & Portfolio Management

### 7.1 Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          7-STAGE DEAL PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   STAGE 1: NEW                                                              │
│   ├── Deal received from any source                                         │
│   ├── Initial validation complete                                           │
│   └── Trigger: deal.received event                                          │
│                                                                              │
│   STAGE 2: ANALYZING                                                        │
│   ├── AI analysis in progress                                               │
│   ├── Market data enrichment                                                │
│   └── Compliance check initiated                                            │
│                                                                              │
│   STAGE 3: DUE DILIGENCE                                                    │
│   ├── Property inspection scheduled                                         │
│   ├── Title search initiated                                                │
│   └── Financial analysis complete                                           │
│                                                                              │
│   STAGE 4: OFFERED                                                          │
│   ├── Offer submitted to seller                                             │
│   ├── Terms documented                                                      │
│   └── Awaiting seller response                                              │
│                                                                              │
│   STAGE 5: NEGOTIATING                                                      │
│   ├── Counter-offers in progress                                            │
│   ├── Terms being revised                                                   │
│   └── Active communication                                                  │
│                                                                              │
│   STAGE 6: UNDER CONTRACT                                                   │
│   ├── Contract signed (DocuSeal)                                            │
│   ├── Earnest money deposited                                               │
│   └── Closing scheduled                                                     │
│                                                                              │
│   STAGE 7a: CLOSED WON                      STAGE 7b: CLOSED LOST          │
│   ├── Transaction complete                  ├── Deal did not close          │
│   ├── Move to Portfolio                     ├── Loss reason captured        │
│   └── Win factors recorded                  └── Learning data stored        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Pipeline Data Model

```typescript
interface DealPipeline {
  id: string;
  userId: string;
  dealId: string;
  propertyId?: number;

  // Current State
  stage: PipelineStage;

  // Stage History (Full Audit Trail)
  stageHistory: {
    stage: PipelineStage;
    enteredAt: Date;
    exitedAt?: Date;
    notes?: string;
    triggeredBy: 'user' | 'agent' | 'automation';
  }[];

  // Entry Snapshot (Deal data at time of addition)
  entrySnapshot: {
    price: number;
    arv?: number;
    equity?: number;
    state: string;
    city: string;
    propertyType: string;
  };

  // Outcome Tracking
  outcome?: 'won' | 'lost' | 'withdrawn';
  outcomeReason?: string;
  closePrice?: number;
  closedAt?: Date;

  // Calculated Metrics
  daysInPipeline: number;

  createdAt: Date;
  updatedAt: Date;
}

type PipelineStage =
  | 'new'
  | 'analyzing'
  | 'due_diligence'
  | 'offered'
  | 'negotiating'
  | 'under_contract'
  | 'closed_won'
  | 'closed_lost';
```

### 7.3 Portfolio Management

```typescript
interface Portfolio {
  id: string;
  userId: string;
  propertyId?: number;
  dealPipelineId?: string;  // Link to originating deal

  // Property Info
  address: string;
  city: string;
  state: string;
  propertyType: string;

  // Acquisition
  acquisitionDate: Date;
  acquisitionPrice: number;
  acquisitionSource: 'pipeline' | 'manual' | 'import';

  // Current Valuation
  currentValue?: number;
  lastValuedAt?: Date;
  valuationSource?: 'zestimate' | 'appraisal' | 'manual';

  // Financials
  totalInvested: number;  // acquisition + rehab + holding
  rehabCost?: number;
  monthlyRent?: number;
  monthlyExpenses?: number;

  // Status
  status: 'holding' | 'renting' | 'renovating' | 'listed_for_sale' | 'sold';
  soldPrice?: number;
  soldAt?: Date;

  // Calculated Performance
  equity: number;           // currentValue - totalInvested
  cashFlow?: number;        // monthlyRent - monthlyExpenses
  roi?: number;             // Annualized return

  createdAt: Date;
  updatedAt: Date;
}
```

### 7.4 Win/Loss Analysis

```typescript
interface WinLossAnalysis {
  // Statistics
  stats: {
    totalDeals: number;
    won: number;
    lost: number;
    winRate: number;
    avgDaysToClose: number;
    avgClosePrice: number;
  };

  // Loss Categories
  lossPatterns: {
    category: 'price' | 'condition' | 'location' | 'competition' | 'timing' | 'other';
    count: number;
    percentage: number;
    examples: string[];
  }[];

  // Win Factors
  winPatterns: {
    factor: string;
    frequency: number;
    impact: 'high' | 'medium' | 'low';
  }[];

  // Scoring Accuracy
  accuracy: {
    predictedWins: number;
    actualWins: number;
    accuracy: number;
    avgScoreVariance: number;
  };

  // AI Insights
  insights: {
    type: 'recommendation' | 'warning' | 'opportunity';
    message: string;
    confidence: number;
  }[];
}
```

---

## 8. Automation Engine

### 8.1 Event-Driven Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTOMATION ENGINE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                          EVENT SOURCES                                │  │
│   │                                                                       │  │
│   │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐   │  │
│   │   │  Deal   │ │Pipeline │ │ DocuSeal│ │ Schedule│ │   Webhook   │   │  │
│   │   │ Events  │ │ Events  │ │ Events  │ │ (Cron)  │ │   Events    │   │  │
│   │   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └──────┬──────┘   │  │
│   │        └───────────┴───────────┴───────────┴─────────────┘           │  │
│   │                                │                                      │  │
│   └────────────────────────────────┼──────────────────────────────────────┘  │
│                                    │                                         │
│   ┌────────────────────────────────▼──────────────────────────────────────┐  │
│   │                          EVENT ROUTER                                  │  │
│   │                                                                        │  │
│   │    Event ──▶ Match Triggers ──▶ Evaluate Conditions ──▶ Queue Actions │  │
│   │                                                                        │  │
│   └────────────────────────────────┬──────────────────────────────────────┘  │
│                                    │                                         │
│   ┌────────────────────────────────▼──────────────────────────────────────┐  │
│   │                        ACTION EXECUTOR                                 │  │
│   │                                                                        │  │
│   │    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │  │
│   │    │  Rate       │────▶│  Execute    │────▶│  Retry      │           │  │
│   │    │  Limiter    │     │  Handler    │     │  Queue      │           │  │
│   │    └─────────────┘     └─────────────┘     └─────────────┘           │  │
│   │                                                                        │  │
│   │    ┌───────────────────────────────────────────────────────────────┐  │  │
│   │    │                    ACTION HANDLERS                             │  │  │
│   │    │                                                                │  │  │
│   │    │  send_email      send_sms         create_docuseal_submission  │  │  │
│   │    │  update_stage    submit_to_fund   add_to_portfolio            │  │  │
│   │    │  score_deal      enrich_deal      send_notification           │  │  │
│   │    │  http_request    update_property  generate_pdf                │  │  │
│   │    │  custom_function ...                                          │  │  │
│   │    │                                                                │  │  │
│   │    └───────────────────────────────────────────────────────────────┘  │  │
│   │                                                                        │  │
│   └────────────────────────────────┬──────────────────────────────────────┘  │
│                                    │                                         │
│   ┌────────────────────────────────▼──────────────────────────────────────┐  │
│   │                        AUDIT LOG                                       │  │
│   │                                                                        │  │
│   │    AutomationExecution: timestamp, event, actions, results, errors    │  │
│   │                                                                        │  │
│   └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Event Types

```typescript
type EventType =
  // Deal Events
  | 'deal.received'
  | 'deal.scored'
  | 'deal.matched'
  | 'deal.enriched'
  | 'deal.compliance_checked'

  // Pipeline Events
  | 'pipeline.stage_changed'
  | 'pipeline.closed_won'
  | 'pipeline.closed_lost'

  // DocuSeal Events
  | 'docuseal.form.viewed'
  | 'docuseal.form.started'
  | 'docuseal.form.completed'
  | 'docuseal.submission.completed'
  | 'docuseal.form.declined'

  // Marketplace Events
  | 'offer.submitted'
  | 'offer.accepted'
  | 'offer.rejected'
  | 'offer.countered'

  // Scheduled Events
  | 'schedule.triggered';
```

### 8.3 Action Types

| Action Type | Description | Configuration |
|-------------|-------------|---------------|
| `send_email` | Send email via Resend | `to`, `subject`, `template`, `variables` |
| `send_sms` | Send SMS via Twilio | `to`, `message` |
| `send_notification` | In-app notification | `userId`, `title`, `message` |
| `update_stage` | Change pipeline stage | `stage`, `notes` |
| `submit_to_fund` | Submit to hedge fund | `fundId`, `format` |
| `create_docuseal_submission` | Send contract | `templateId`, `expireInDays` |
| `get_docuseal_status` | Check signing status | `submissionId` |
| `resend_docuseal_email` | Send reminder | `submitterId` |
| `http_request` | External API call | `url`, `method`, `headers`, `body` |
| `score_deal` | Score against buy boxes | `buyBoxIds` |
| `enrich_deal` | Add market data | `sources` |
| `add_to_portfolio` | Add to user portfolio | `userId`, `valuationSource` |
| `generate_pdf` | Create PDF document | `template`, `outputPath` |
| `custom_function` | Run registered function | `functionName`, `params` |

### 8.4 Automation Configuration

```typescript
interface Automation {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;

  // Trigger Conditions
  trigger: {
    type: EventType;
    config?: {
      // For scheduled triggers
      cron?: string;
      // For stage change triggers
      fromStage?: PipelineStage;
      toStage?: PipelineStage;
    };
  };

  // Conditions (all must be true)
  conditions: {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in';
    value: any;
  }[];

  // Actions (executed in order)
  actions: {
    id: string;
    type: AutomationActionType;
    config: Record<string, any>;
    delay?: number;  // Delay in ms before execution
  }[];

  // Rate Limiting
  rateLimit?: {
    maxExecutions: number;
    windowMs: number;
  };

  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  executionCount: number;
}
```

---

## 9. E-Signature Integration

### 9.1 DocuSeal Service

```typescript
class DocuSealService {
  private apiKey: string | null = null;
  private baseUrl: string = 'https://api.docuseal.com';

  // Template Management
  async listTemplates(): Promise<DocuSealTemplate[]>;
  async getTemplate(id: number): Promise<DocuSealTemplate>;

  // Submission Management
  async createSubmission(request: CreateSubmissionRequest): Promise<DocuSealSubmission>;
  async createDealSubmission(
    templateId: number,
    dealData: DealContractData,
    options?: SubmissionOptions
  ): Promise<DocuSealSubmission>;
  async getSubmission(id: number): Promise<DocuSealSubmission>;
  async listSubmissions(options?: ListOptions): Promise<DocuSealSubmission[]>;

  // Signer Management
  async resendEmail(submitterId: number): Promise<void>;

  // Document Retrieval
  async downloadDocuments(submissionId: number): Promise<DocumentDownload>;

  // Webhook Handling
  parseWebhook(body: any): WebhookPayload;
  getDealIdFromWebhook(payload: WebhookPayload): string | undefined;
  getPipelineIdFromWebhook(payload: WebhookPayload): string | undefined;
}
```

### 9.2 Webhook Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DOCUSEAL WEBHOOK FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   DocuSeal Cloud                                                             │
│        │                                                                     │
│        │  1. Signer completes form                                           │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────┐                                                           │
│   │   Webhook   │  POST /api/webhooks/docuseal                              │
│   │   Payload   │  { event_type, timestamp, data }                          │
│   └──────┬──────┘                                                           │
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      WEBHOOK HANDLER                                 │   │
│   │                                                                      │   │
│   │   1. Parse payload (docuSealService.parseWebhook)                   │   │
│   │   2. Extract dealId/pipelineId from metadata                         │   │
│   │   3. Emit automation event (docuseal.{event_type})                  │   │
│   │   4. Execute built-in logic based on event type                     │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│          │                                                                   │
│          │                                                                   │
│          ├── form.viewed ────────────▶ Log: "Document viewed"               │
│          │                                                                   │
│          ├── form.started ───────────▶ Log: "Signing started"               │
│          │                                                                   │
│          ├── form.completed ─────────▶ Log: "Signer completed"              │
│          │                                                                   │
│          ├── submission.completed ───▶ Pipeline → under_contract            │
│          │                            Emit: pipeline.stage_changed          │
│          │                                                                   │
│          └── form.declined ──────────▶ Pipeline → closed_lost               │
│                                        Record: decline reason               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Contract Data Mapping

```typescript
interface DealContractData {
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  purchasePrice: number;
  sellerName: string;
  sellerEmail: string;
  closingDate?: Date;
  earnestMoney?: number;
  inspectionDays?: number;

  // Buyer Info (filled from user profile)
  buyerName?: string;
  buyerEmail?: string;
  buyerCompany?: string;
}

// Maps to DocuSeal template fields
const fieldMapping = {
  'Property Address': 'propertyAddress',
  'City': 'city',
  'State': 'state',
  'ZIP': 'zip',
  'Purchase Price': 'purchasePrice',
  'Seller Name': 'sellerName',
  'Closing Date': 'closingDate',
  // ...
};
```

---

## 10. Machine Learning Infrastructure

### 10.1 TensorFlow.js Models

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ML MODEL ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                      DEAL QUALITY MODEL                               │  │
│   │                                                                       │  │
│   │   Input Layer (15 features)                                          │  │
│   │   ├── askingPrice (normalized)                                        │  │
│   │   ├── arv (normalized)                                                │  │
│   │   ├── rehabCost (normalized)                                          │  │
│   │   ├── equityPercent                                                   │  │
│   │   ├── bedrooms, bathrooms, sqft                                       │  │
│   │   ├── yearBuilt (normalized)                                          │  │
│   │   ├── daysOnMarket                                                    │  │
│   │   ├── propertyType (one-hot)                                          │  │
│   │   └── state (one-hot top 10)                                          │  │
│   │                                                                       │  │
│   │   Hidden Layers                                                       │  │
│   │   ├── Dense(64, ReLU)                                                 │  │
│   │   ├── Dropout(0.2)                                                    │  │
│   │   ├── Dense(32, ReLU)                                                 │  │
│   │   └── Dropout(0.2)                                                    │  │
│   │                                                                       │  │
│   │   Output Layer                                                        │  │
│   │   └── Dense(1, Sigmoid) → Quality Score [0-1]                        │  │
│   │                                                                       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     CLOSE PROBABILITY MODEL                           │  │
│   │                                                                       │  │
│   │   Input: Deal features + Pipeline history + User behavior            │  │
│   │   Output: Probability of closing [0-1]                               │  │
│   │                                                                       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                    USER INTEREST PREDICTOR                            │  │
│   │                                                                       │  │
│   │   Input: Deal features + User behavior profile                       │  │
│   │   Output: { predictedAction: 'like'|'pass', confidence: number }     │  │
│   │                                                                       │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Behavior Prediction Algorithm

```typescript
interface BehaviorProfile {
  userId: string;

  // Price Preferences (learned from actions)
  avgLikedPrice: number;
  avgPassedPrice: number;
  priceRangePreference: { min: number; max: number };

  // Geographic Preferences
  preferredStates: Map<string, number>;  // state → interaction count
  preferredCities: Map<string, number>;

  // Property Preferences
  preferredTypes: Map<PropertyType, number>;
  avgLikedBedrooms: number;
  avgLikedSqft: number;

  // Timing Patterns
  avgViewDurationLiked: number;   // ms
  avgViewDurationPassed: number;  // ms
  quickDismissThreshold: number;  // < 5 seconds = quick dismiss

  // Pass Reasons (learned)
  topPassReasons: Map<PassReason, number>;

  // "Almost Liked" Detection
  // Deals viewed 70%+ of like duration but ultimately passed
  almostLikedPatterns: DealPattern[];
}

class PredictionEngine {
  predict(deal: NormalizedDeal, profile: BehaviorProfile): Prediction {
    let score = 50;  // Neutral start
    const factors: Factor[] = [];

    // Price analysis (+/- 15 points)
    if (deal.askingPrice >= profile.priceRangePreference.min &&
        deal.askingPrice <= profile.priceRangePreference.max) {
      score += 15;
      factors.push({ factor: 'Price in preferred range', impact: 'positive', weight: 15 });
    } else if (deal.askingPrice > profile.avgPassedPrice * 1.2) {
      score -= 10;
      factors.push({ factor: 'Price significantly above passed deals', impact: 'negative', weight: 10 });
    }

    // Geographic match (+10 points)
    if (profile.preferredStates.has(deal.address.state)) {
      score += 10;
      factors.push({ factor: `Previously liked ${deal.address.state} properties`, impact: 'positive', weight: 10 });
    }

    // Similar to "almost liked" (+8 points)
    if (this.isSimilarToAlmostLiked(deal, profile.almostLikedPatterns)) {
      score += 8;
      factors.push({ factor: 'Similar to deals you carefully considered', impact: 'positive', weight: 8 });
    }

    // Quick-dismiss pattern detection (-15 points)
    if (this.matchesQuickDismissPattern(deal, profile)) {
      score -= 15;
      factors.push({ factor: 'Matches quick-dismiss pattern', impact: 'negative', weight: 15 });
    }

    return {
      predictedAction: score >= 60 ? 'like' : 'pass',
      confidence: Math.min(95, Math.max(5, score)),
      factors,
    };
  }
}
```

### 10.3 Training Pipeline

```typescript
class MLService {
  // Model Training
  async trainDealQualityModel(options?: TrainingOptions): Promise<TrainingResult> {
    // 1. Fetch training data (FundFeedback with outcomes)
    const data = await this.getTrainingData();

    // 2. Feature engineering
    const features = this.extractFeatures(data.deals);
    const labels = data.outcomes;  // 0 = passed, 1 = closed

    // 3. Train/test split (80/20)
    const [trainX, testX, trainY, testY] = this.splitData(features, labels);

    // 4. Build model
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [15] }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    // 5. Train
    const history = await model.fit(trainX, trainY, {
      epochs: 100,
      batchSize: 32,
      validationData: [testX, testY],
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch}: loss=${logs.loss}, accuracy=${logs.acc}`);
        },
      },
    });

    // 6. Save model version
    await this.saveModelVersion(model, {
      accuracy: history.history.acc.slice(-1)[0],
      loss: history.history.loss.slice(-1)[0],
      trainedAt: new Date(),
      datasetSize: data.deals.length,
    });

    return { model, history };
  }

  // Inference
  async predictDealQuality(deal: NormalizedDeal): Promise<QualityPrediction> {
    const model = await this.loadLatestModel('deal-quality');
    const features = tf.tensor2d([this.extractDealFeatures(deal)]);
    const prediction = model.predict(features) as tf.Tensor;
    const score = (await prediction.data())[0];

    return {
      score: Math.round(score * 100),
      confidence: this.calculateConfidence(score),
      factors: this.explainPrediction(deal, score),
    };
  }
}
```

---

## 11. Data Architecture

### 11.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ENTITY RELATIONSHIPS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐          ┌──────────────────┐                        │
│   │    Property      │          │  MarketplaceUser │                        │
│   │   (90+ fields)   │          │                  │                        │
│   └────────┬─────────┘          └────────┬─────────┘                        │
│            │                             │                                   │
│            │                    ┌────────┴────────┐                         │
│            │                    │                 │                          │
│            │            ┌───────▼───────┐ ┌──────▼───────┐                  │
│            │            │   UserBuyBox  │ │   Settings   │                  │
│            │            └───────────────┘ └──────────────┘                  │
│            │                    │                                            │
│            │    ┌───────────────┼───────────────┬───────────────┐           │
│            │    │               │               │               │            │
│            │    ▼               ▼               ▼               ▼            │
│            │ ┌─────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────┐      │
│            │ │DealAction│ │ DealOffer │ │DealPipeline│ │   Portfolio   │     │
│            │ └────┬────┘ └─────┬─────┘ └─────┬─────┘ └───────────────┘      │
│            │      │            │             │                               │
│            └──────┴────────────┴─────────────┘                               │
│                                                                              │
│   ┌──────────────────┐          ┌──────────────────┐                        │
│   │ HedgeFundBuyBox  │          │   FundFeedback   │                        │
│   └────────┬─────────┘          └────────┬─────────┘                        │
│            │                             │                                   │
│            └─────────────────────────────┘                                   │
│                           │                                                  │
│                           ▼                                                  │
│                   ┌───────────────┐     ┌───────────────┐                   │
│                   │  MLPrediction │     │ AgentMetric   │                   │
│                   └───────────────┘     └───────────────┘                   │
│                                                                              │
│   ┌──────────────────┐          ┌──────────────────┐                        │
│   │    Automation    │          │AutomationExecution│                       │
│   └────────┬─────────┘          └──────────────────┘                        │
│            │                                                                 │
│            └────────────────────────────────────────┘                        │
│                                                                              │
│   ┌──────────────────┐          ┌──────────────────┐                        │
│   │ConversationHistory│         │  ModelVersion    │                        │
│   └──────────────────┘          └──────────────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Property Model (Core Entity)

```typescript
interface Property {
  // Identification
  id: number;
  propertyId: string;
  propertyType: PropertyType;
  propertyOwnership?: string;

  // Address
  address: {
    houseNumber?: string;
    street: string;
    address2?: string;
  };
  city: string;
  state: string;
  zip: string;
  county?: string;
  country?: string;

  // Physical Characteristics
  bedroomCount: number;
  bathroomCount: number;
  fullBathrooms?: number;
  partialBathrooms?: number;
  livingSpaceSqFt: number;
  lotSizeSqFt?: number;
  yearBuilt?: number;
  stories?: number;
  garage?: boolean;
  garageCount?: number;
  pool?: boolean;
  solar?: boolean;
  septic?: boolean;
  well?: boolean;

  // Financial
  purchaseContractPrice?: number;
  reservePrice?: number;
  buyItNowPrice?: number;
  arv?: number;
  renovationBudget?: number;
  rehabCost?: number;
  bpoValue1?: number;
  bpoValue2?: number;
  appraisalValue?: number;
  commissionPercentage?: number;

  // Occupancy
  occupancyStatus?: 'vacant' | 'occupied' | 'tenant' | 'owner';
  deliveredVacant?: boolean;
  monthlyRent?: number;
  accessToProperty?: string;
  lockboxCode?: string;

  // Condition
  condition?: string;
  roof?: string;
  sewer?: string;
  electric?: string;
  water?: string;
  foundationType?: string;
  waterHeater?: string;
  hvac?: string;
  typeOfRehab?: string;
  knownMaterialDefects?: string;

  // Compliance
  assignable?: boolean;
  marketingClauseFound?: boolean;
  brokerOnFile?: boolean;
  status?: 'green' | 'yellow' | 'red';
  complianceNotes?: string[];

  // Agent/Broker
  agentFirstName?: string;
  agentLastName?: string;
  agentEmail?: string;
  agentPhone?: string;
  agentLicenseNumber?: string;
  licensedState?: string;
  brokerCompany?: string;

  // Wholesaler
  wholesalerLlcName?: string;
  llcOwnerName?: string;
  llcOwnerEmail?: string;
  purchaseContractExpiration?: Date;

  // Marketing
  liveOnHubzu?: boolean;
  onMarketOffMarket?: string;
  listedOnMLS?: boolean;
  mlsNumber?: string;
  photoLinks?: string[];
  propertyListingDescription?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### 11.3 Index Strategy

```sql
-- Primary indexes
CREATE INDEX idx_property_state ON properties(state);
CREATE INDEX idx_property_city ON properties(city);
CREATE INDEX idx_property_price ON properties(purchase_contract_price);
CREATE INDEX idx_property_type ON properties(property_type);
CREATE INDEX idx_property_created ON properties(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_property_state_price ON properties(state, purchase_contract_price);
CREATE INDEX idx_property_location ON properties(state, city, zip);

-- Full-text search
CREATE INDEX idx_property_address_gin ON properties USING gin(to_tsvector('english', address::text));

-- Pipeline indexes
CREATE INDEX idx_pipeline_user_stage ON deal_pipelines(user_id, stage);
CREATE INDEX idx_pipeline_created ON deal_pipelines(created_at DESC);

-- Portfolio indexes
CREATE INDEX idx_portfolio_user ON portfolios(user_id);
CREATE INDEX idx_portfolio_status ON portfolios(status);

-- Action tracking
CREATE INDEX idx_deal_action_user ON deal_actions(user_id, created_at DESC);
CREATE INDEX idx_deal_action_deal ON deal_actions(deal_id);
```

---

## 12. API Design & OpenAI Compatibility

### 12.1 RESTful API Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API ENDPOINT MAP                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Base URL: https://api.dispotree.com                                       │
│                                                                              │
│   /api/auth                 Authentication                                   │
│   ├── POST /register        Register new user                               │
│   ├── POST /login           Login with credentials                          │
│   ├── POST /refresh         Refresh JWT token                               │
│   └── POST /logout          Invalidate session                              │
│                                                                              │
│   /api/listings             Property Management                              │
│   ├── GET /                 List properties (paginated, filtered)           │
│   ├── POST /                Create property                                  │
│   ├── GET /:id              Get property details                            │
│   ├── PUT /:id              Update property                                  │
│   └── DELETE /:id           Delete property                                  │
│                                                                              │
│   /api/agent                AI Agent                                         │
│   ├── POST /chat            Send message (sync)                              │
│   ├── POST /chat/stream     Send message (SSE streaming)                    │
│   ├── GET /conversations    List conversations                              │
│   └── DELETE /conversations/:id  Clear conversation                         │
│                                                                              │
│   /api/pipeline             Deal Pipeline                                    │
│   ├── GET /                 Get user's pipeline                             │
│   ├── POST /                Add deal to pipeline                            │
│   ├── PATCH /:id/stage      Update stage                                    │
│   ├── POST /:id/close       Mark as closed                                  │
│   ├── POST /:id/to-portfolio  Move to portfolio                             │
│   ├── GET /stats            Pipeline statistics                             │
│   └── GET /conversion-rates Conversion funnel                               │
│                                                                              │
│   /api/portfolio            Portfolio Management                             │
│   ├── GET /                 Get portfolio                                   │
│   ├── POST /                Add property                                    │
│   ├── PATCH /:id            Update property                                 │
│   ├── POST /:id/valuation   Update valuation                                │
│   ├── GET /summary          Portfolio summary                               │
│   └── GET /performance      Performance metrics                             │
│                                                                              │
│   /api/marketplace          Swipe Marketplace                                │
│   ├── GET /users/:id/feed   Personalized deal feed                          │
│   ├── POST /users/:id/deals/:dealId/swipe  Like/Pass                        │
│   ├── POST /users/:id/deals/:dealId/offers Submit offer                     │
│   └── POST /offers/:id/respond  Accept/Reject/Counter                       │
│                                                                              │
│   /api/webhooks             Webhook Receivers                                │
│   ├── POST /docuseal        DocuSeal events                                 │
│   └── POST /generic         Generic webhook                                 │
│                                                                              │
│   /api/analytics            Analytics & Metrics                              │
│   ├── GET /win-loss/stats   Win/loss statistics                             │
│   ├── GET /agent/accuracy   Agent prediction accuracy                       │
│   └── GET /agent/tools      Tool usage statistics                           │
│                                                                              │
│   /v1                       OpenAI-Compatible API                            │
│   ├── GET /models           List available models                           │
│   ├── POST /chat/completions  Chat completion (streaming)                   │
│   └── GET /health           API health check                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 OpenAI Compatibility Layer

The `/v1` endpoints provide OpenAI API compatibility for integration with:
- OpenWebUI
- LangChain
- Custom GPT clients
- Any OpenAI-compatible tool

```typescript
// Request format (OpenAI-compatible)
POST /v1/chat/completions
{
  "model": "dispotree-agent",
  "messages": [
    { "role": "user", "content": "Show me deals in Texas under $200k" }
  ],
  "stream": true
}

// Response format (SSE streaming)
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"dispotree-agent","choices":[{"index":0,"delta":{"content":"I found 15 deals"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"dispotree-agent","choices":[{"index":0,"delta":{"content":" in Texas..."},"finish_reason":null}]}

data: [DONE]
```

### 12.3 Error Handling

```typescript
// Standard error response
interface APIError {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: string;
  requestId: string;
}

// HTTP Status Codes
// 200 OK - Success
// 201 Created - Resource created
// 400 Bad Request - Invalid input
// 401 Unauthorized - Missing/invalid token
// 403 Forbidden - Insufficient permissions
// 404 Not Found - Resource not found
// 429 Too Many Requests - Rate limited
// 500 Internal Server Error - Server error
```

---

## 13. Security Architecture

### 13.1 Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SECURITY LAYERS                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Layer 1: Transport Security                                               │
│   ├── TLS 1.3 for all connections                                           │
│   ├── HSTS headers enabled                                                  │
│   └── Certificate pinning (mobile apps)                                     │
│                                                                              │
│   Layer 2: Request Security                                                 │
│   ├── Helmet.js security headers                                            │
│   ├── CORS whitelist                                                        │
│   ├── Rate limiting (Redis-backed)                                          │
│   └── Request size limits                                                   │
│                                                                              │
│   Layer 3: Authentication                                                   │
│   ├── JWT tokens (RS256)                                                    │
│   ├── Refresh token rotation                                                │
│   ├── Session invalidation                                                  │
│   └── bcrypt password hashing                                               │
│                                                                              │
│   Layer 4: Authorization                                                    │
│   ├── Role-based access control (RBAC)                                      │
│   ├── Resource-level permissions                                            │
│   └── API key scoping                                                       │
│                                                                              │
│   Layer 5: Data Security                                                    │
│   ├── Encryption at rest (PostgreSQL)                                       │
│   ├── Field-level encryption (secrets)                                      │
│   └── Audit logging                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 JWT Implementation

```typescript
// Token structure
interface JWTPayload {
  sub: string;          // User ID
  email: string;
  role: 'user' | 'admin' | 'api';
  permissions: string[];
  iat: number;
  exp: number;
  jti: string;          // Token ID for revocation
}

// Token lifecycle
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check revocation list (Redis)
    const isRevoked = await redisService.get(`revoked:${decoded.jti}`);
    if (isRevoked) {
      return res.status(401).json({ error: 'Token revoked' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 13.3 Webhook Security

```typescript
// Signature verification for DocuSeal webhooks
const verifyWebhookSignature = (payload: string, signature: string): boolean => {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.DOCUSEAL_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

// IP whitelist for webhook sources
const webhookIPWhitelist = [
  '52.22.0.0/16',    // DocuSeal
  '34.192.0.0/12',   // AWS (for various integrations)
];
```

---

## 14. Integration Ecosystem

### 14.1 External Services

| Service | Purpose | Integration Type |
|---------|---------|------------------|
| **OpenRouter** | LLM inference (Claude, GPT-4) | REST API |
| **OpenAI** | Embeddings (text-embedding-3-small) | REST API |
| **Pinecone** | Vector storage for RAG | REST API |
| **DocuSeal** | E-signature workflows | REST API + Webhooks |
| **RapidAPI/Zillow** | Market data (Zestimate, rent estimates) | REST API |
| **Firecrawl** | AI web scraping | REST API |
| **Redis** | Caching and rate limiting | Direct connection |
| **Resend** | Transactional email | REST API |
| **Twilio** | SMS notifications | REST API |
| **Playwright** | Browser automation | Local execution |

### 14.2 Webhook Integrations

```typescript
// Inbound webhooks
interface WebhookHandler {
  path: string;
  validate(req: Request): boolean;
  process(payload: any): Promise<void>;
}

const webhookHandlers: WebhookHandler[] = [
  {
    path: '/api/webhooks/docuseal',
    validate: (req) => verifyDocuSealSignature(req),
    process: async (payload) => {
      await automationEngine.emitEvent({
        type: `docuseal.${payload.event_type}`,
        payload,
      });
    },
  },
  {
    path: '/api/webhooks/generic',
    validate: (req) => verifyAPIKey(req),
    process: async (payload) => {
      await automationEngine.emitEvent({
        type: req.query.event || 'webhook.received',
        payload,
      });
    },
  },
];

// Outbound webhooks (automation actions)
interface OutboundWebhook {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: any;
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
}
```

### 14.3 Data Enrichment Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATA ENRICHMENT PIPELINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Raw Deal                                                                   │
│      │                                                                       │
│      ▼                                                                       │
│   ┌─────────────────┐                                                       │
│   │ Address         │  Standardize & geocode                                │
│   │ Normalization   │  (Google Maps API / Census)                           │
│   └────────┬────────┘                                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                       │
│   │ Market Data     │  Zillow API (via RapidAPI)                            │
│   │ - Zestimate     │  - Current value estimate                             │
│   │ - Rent estimate │  - Rental rate estimate                               │
│   │ - Comparables   │  - Recent sales nearby                                │
│   └────────┬────────┘                                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                       │
│   │ Property Data   │  ATTOM / CoreLogic                                    │
│   │ - Tax records   │  - Owner info, tax history                            │
│   │ - Deed info     │  - Sale history                                       │
│   │ - Liens         │  - Outstanding liens                                  │
│   └────────┬────────┘                                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                       │
│   │ Neighborhood    │  Walk Score / Crime APIs                              │
│   │ - Walk score    │                                                       │
│   │ - Crime index   │                                                       │
│   │ - School rating │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                 │
│            ▼                                                                 │
│   Enriched Deal                                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Deployment & Infrastructure

### 15.1 Docker Architecture

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://dispotree:${DB_PASSWORD}@db:5432/dispotree
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  db:
    image: postgres:14-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=dispotree
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=dispotree

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - backend
      - frontend

volumes:
  postgres_data:
  redis_data:
```

### 15.2 Environment Configuration

```bash
# Production environment variables
NODE_ENV=production
PORT=3001

# Database
DB_HOST=db
DB_PORT=5432
DB_NAME=dispotree
DB_USER=dispotree
DB_PASSWORD=${SECURE_PASSWORD}

# Authentication
JWT_SECRET=${SECURE_JWT_SECRET}

# AI/LLM
OPENROUTER_API_KEY=sk-or-v1-xxx
AGENT_MODEL=anthropic/claude-sonnet-4

# Vector Database
PINECONE_API_KEY=xxx
OPENAI_API_KEY=sk-xxx  # For embeddings

# E-Signature
DOCUSEAL_API_KEY=xxx
DOCUSEAL_API_URL=https://api.docuseal.com
DOCUSEAL_WEBHOOK_SECRET=xxx

# Cache
REDIS_URL=redis://redis:6379

# Market Data
RAPIDAPI_KEY=xxx

# Email
RESEND_API_KEY=xxx

# SMS
TWILIO_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_FROM_NUMBER=+1xxx
```

### 15.3 Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SCALING ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      LOAD BALANCER (nginx/ALB)                       │   │
│   │                                                                      │   │
│   │   Round-robin with health checks                                    │   │
│   │   SSL termination                                                    │   │
│   │   Rate limiting (100 req/s per IP)                                  │   │
│   │                                                                      │   │
│   └───────────────────────────────┬─────────────────────────────────────┘   │
│                                   │                                          │
│              ┌────────────────────┼────────────────────┐                    │
│              ▼                    ▼                    ▼                     │
│   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐           │
│   │  Backend Node 1  │ │  Backend Node 2  │ │  Backend Node 3  │           │
│   │                  │ │                  │ │                  │           │
│   │  - API handlers  │ │  - API handlers  │ │  - API handlers  │           │
│   │  - Agent (shared)│ │  - Agent (shared)│ │  - Agent (shared)│           │
│   │                  │ │                  │ │                  │           │
│   └────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘           │
│            │                    │                    │                      │
│            └────────────────────┼────────────────────┘                      │
│                                 │                                           │
│   ┌─────────────────────────────┼─────────────────────────────────────────┐│
│   │                             ▼                                          ││
│   │   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐    ││
│   │   │   PostgreSQL    │   │     Redis       │   │    Pinecone     │    ││
│   │   │   (Primary +    │   │   (Cluster)     │   │   (Managed)     │    ││
│   │   │    Replicas)    │   │                 │   │                 │    ││
│   │   └─────────────────┘   └─────────────────┘   └─────────────────┘    ││
│   │                                                                        ││
│   │                        DATA LAYER                                      ││
│   └────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Scaling Triggers:
  - CPU > 70% sustained → Add backend node
  - Memory > 80% → Add backend node
  - DB connections > 80% pool → Add read replica
  - Redis memory > 70% → Scale cluster
```

---

## 16. Performance & Scalability

### 16.1 Performance Benchmarks

| Operation | Target | Actual | Notes |
|-----------|--------|--------|-------|
| API Response (p50) | < 100ms | 45ms | Simple CRUD |
| API Response (p99) | < 500ms | 280ms | With DB queries |
| Agent Response | < 3s | 2.1s | First token |
| Deal Scoring | < 200ms | 150ms | Against 100 buy boxes |
| Search Query | < 300ms | 180ms | With filters |
| Webhook Processing | < 1s | 400ms | Including automation |

### 16.2 Optimization Strategies

```typescript
// 1. Redis Caching
const cacheMiddleware = async (req, res, next) => {
  const cacheKey = `cache:${req.originalUrl}`;
  const cached = await redisService.get(cacheKey);

  if (cached) {
    return res.json(JSON.parse(cached));
  }

  res.sendResponse = res.json;
  res.json = async (data) => {
    await redisService.set(cacheKey, JSON.stringify(data), 'EX', 300);  // 5 min
    res.sendResponse(data);
  };

  next();
};

// 2. Database Query Optimization
const getPropertiesOptimized = async (filters: PropertyFilters) => {
  // Use indexed columns in WHERE
  const where: any = {};

  if (filters.state) where.state = filters.state;  // Indexed
  if (filters.minPrice) where.purchaseContractPrice = { [Op.gte]: filters.minPrice };

  // Limit returned fields
  const attributes = ['id', 'address', 'city', 'state', 'purchaseContractPrice', 'bedrooms'];

  // Pagination with cursor (faster than offset for large datasets)
  const cursorWhere = filters.cursor
    ? { id: { [Op.lt]: filters.cursor } }
    : {};

  return Property.findAll({
    where: { ...where, ...cursorWhere },
    attributes,
    order: [['id', 'DESC']],
    limit: filters.limit || 20,
  });
};

// 3. Batch Operations
const batchScoreDeals = async (deals: NormalizedDeal[], buyBoxes: BuyBox[]) => {
  // Process in parallel chunks
  const CHUNK_SIZE = 50;
  const results = [];

  for (let i = 0; i < deals.length; i += CHUNK_SIZE) {
    const chunk = deals.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(deal => scoringEngine.scoreAgainstAll(deal, buyBoxes))
    );
    results.push(...chunkResults);
  }

  return results;
};
```

### 16.3 Monitoring & Observability

```typescript
// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      pinecone: await checkPinecone(),
      docuseal: docuSealService.isReady(),
    },
    metrics: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeConnections: await getActiveConnections(),
    },
  };

  const isHealthy = Object.values(health.checks).every(c => c === true);
  res.status(isHealthy ? 200 : 503).json(health);
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?.id,
    });

    // Track slow requests
    if (duration > 1000) {
      metrics.increment('slow_requests', { path: req.path });
    }
  });

  next();
});
```

---

## 17. Future Roadmap

### 17.1 Short-Term (Q1 2026)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Mobile App** | React Native app for deal swipe | High |
| **SMS 2FA** | Two-factor authentication via SMS | High |
| **Bulk Import UI** | Drag-and-drop CSV with mapping | Medium |
| **Email Templates** | Customizable email templates | Medium |
| **Audit Export** | Export audit logs to CSV/PDF | Medium |

### 17.2 Medium-Term (Q2-Q3 2026)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Multi-Tenant** | Organization/team support | High |
| **Custom Fields** | User-defined property fields | High |
| **Advanced Analytics** | Tableau-style dashboards | Medium |
| **API Marketplace** | Third-party integrations | Medium |
| **White-Label** | Brandable for partners | Low |

### 17.3 Long-Term (Q4 2026+)

| Feature | Description | Priority |
|---------|-------------|----------|
| **AI Co-Pilot** | Proactive deal recommendations | High |
| **Predictive Sourcing** | Identify properties before listing | High |
| **Blockchain Escrow** | Smart contract closing | Medium |
| **International** | Support for non-US markets | Low |

### 17.4 Technical Debt & Improvements

- [ ] Migrate to TypeORM for better type safety
- [ ] Implement GraphQL layer for flexible queries
- [ ] Add WebSocket support for real-time updates
- [ ] Implement event sourcing for pipeline history
- [ ] Add distributed tracing (OpenTelemetry)

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **ARV** | After Repair Value - estimated value after renovations |
| **Buy Box** | Set of criteria defining acceptable deals |
| **Daisy Chain** | Unethical practice of re-wholesaling without disclosure |
| **EMD** | Earnest Money Deposit - good faith payment |
| **MAO** | Maximum Allowable Offer - highest purchase price |
| **RAG** | Retrieval Augmented Generation - AI with document context |
| **Rehab** | Renovation/repair of property |
| **Wholesale** | Assignment of purchase contract to end buyer |

---

## Appendix B: API Rate Limits

| Endpoint Category | Rate Limit | Window |
|-------------------|------------|--------|
| Authentication | 10 req | 1 min |
| Agent Chat | 20 req | 1 min |
| Property CRUD | 100 req | 1 min |
| Search/Filter | 60 req | 1 min |
| Webhooks | 1000 req | 1 min |
| Bulk Operations | 10 req | 1 min |

---

## Appendix C: Compliance

### State-Specific Regulations

| State | Regulation | Requirement |
|-------|------------|-------------|
| Oklahoma | HB1089 | Wholesaler licensing required |
| Maryland | SB0205 | Disclosure requirements |
| Illinois | SB1872 | Consumer protection disclosures |

---

**Document Version:** 1.0
**Last Updated:** December 2025
**Lead Developer:** Ed Duran
**Authors:** Dispotree Engineering Team
**Contact:** engineering@dispotree.com

---

*This document is proprietary and confidential. Distribution is restricted to authorized personnel only.*
