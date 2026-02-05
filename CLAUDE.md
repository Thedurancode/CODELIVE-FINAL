# CLAUDE.md - AI Assistant Guidelines for Dispotree

This document provides guidance for AI assistants working with the Dispotree codebase.

## Project Overview

Dispotree is a **B2B real estate wholesale deal management platform** that connects wholesalers with institutional buyers (hedge funds). It features AI-powered deal analysis, ML-based buyer matching, automated distribution workflows, and comprehensive compliance systems.

### Core Capabilities
- **Deal Processing Pipeline**: Multi-source ingestion (API, email, webhook, CSV, PDF), normalization, scoring, and distribution
- **AI Agent System**: 65+ tools for compliance analysis, buy box matching, content moderation, deal underwriting, and automated workflows
- **ML Prediction Engine**: TensorFlow.js-based scoring that learns from outcomes
- **Swipe-Based Marketplace**: Personalized deal feeds with like/pass/offer workflows
- **Automation Engine**: Event-driven workflows with DocuSeal e-signature integration
- **Compliance System**: Fraud detection, sanctions screening, property/title verification, state rule enforcement, and SOC 2 audit logging

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL with Sequelize ORM |
| Cache | Redis (with in-memory fallback) |
| Vector DB | Pinecone (RAG & memory) |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| AI/LLM | OpenRouter, OpenAI, LangChain |
| ML | TensorFlow.js |
| State | TanStack React Query 5, Zustand 5 |
| E-Signature | DocuSeal |
| Forms | react-hook-form, Zod 4 |
| Drag & Drop | @hello-pangea/dnd |

## Repository Structure

```
Dispotree/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── config/            # Database, Swagger, Supabase config
│   │   ├── controllers/       # API request handlers
│   │   ├── middleware/        # CORS, upload handling
│   │   ├── models/            # Sequelize database models (50+)
│   │   ├── plugins/           # Extensible plugin system
│   │   │   ├── ai/           # AI analysis services
│   │   │   ├── automation/   # Event-driven automation engine
│   │   │   ├── browser/      # Playwright browser automation
│   │   │   ├── ml/           # TensorFlow.js ML services
│   │   │   ├── registry/     # Plugin registry
│   │   │   ├── scoring/      # Buy box scoring engine
│   │   │   ├── sources/      # Deal source plugins (CSV, API, Email, etc.)
│   │   │   ├── types/        # Plugin type definitions
│   │   │   └── workflow/     # Workflow orchestration
│   │   ├── routes/            # API route definitions (35+ route files)
│   │   ├── seeds/             # Database seed scripts
│   │   ├── services/          # Business logic services (55+)
│   │   │   └── knowledge/    # RAG knowledge base service
│   │   ├── tests/             # Jest test suites
│   │   │   ├── unit/         # Unit tests
│   │   │   └── integration/  # Integration tests
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Utility functions
│   │   ├── validation/        # Request validation schemas
│   │   └── validators/        # Custom validators
│   ├── knowledge/             # Knowledge base documents
│   │   └── defaults/         # Default knowledge documents
│   ├── docs/                  # Architecture documentation
│   └── package.json
│
├── frontend/                   # Next.js 16 application
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   │   ├── (auth)/       # Auth-related pages
│   │   │   ├── (dashboard)/  # Dashboard pages (19 sections)
│   │   │   ├── api/          # API route handlers
│   │   │   ├── broker-apply/ # Broker application page
│   │   │   └── fastbuybox/   # Public buy box submission
│   │   ├── components/        # React components
│   │   │   ├── ui/           # shadcn/ui components
│   │   │   ├── layout/       # Layout components
│   │   │   ├── buybox/       # Buy box form components
│   │   │   ├── compliance/   # Compliance UI components
│   │   │   ├── deals/        # Deal management components
│   │   │   └── settings/     # Settings components
│   │   ├── hooks/             # Custom React hooks (25+)
│   │   ├── lib/               # Utility libraries (api.ts)
│   │   ├── stores/            # Zustand state stores
│   │   └── types/             # TypeScript types
│   └── package.json
│
├── docs/                       # Project documentation
│   ├── API-DOCUMENTATION.md
│   ├── COMPLIANCE_USER_GUIDE.md
│   ├── BROKER_MEDIATED_COMPLIANCE_IMPLEMENTATION.md
│   └── WHITEPAPER.md
├── ai-agent-knowledgebase/    # AI agent training resources
├── contracts/                  # Legal document templates
├── data-structure/            # Data schema documentation
├── database/                   # Database scripts
├── docker-compose.yml         # Docker orchestration
├── db-manage.sh               # Database management script
├── start.sh                   # Application startup script
└── .env.example               # Environment template
```

## Development Commands

### Backend
```bash
cd backend
npm install              # Install dependencies
npm run dev              # Start dev server with hot reload (port 3001)
npm run build            # Build TypeScript + generate docs
npm start                # Start production server
npm test                 # Run all tests with coverage
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:ml          # Run ML prediction tests (uses real DB)
npm run migrate          # Run database migrations
npm run seed             # Seed database
npm run seed:automations # Seed default automations
npm run docs:generate    # Generate Swagger docs
npm run docs:serve       # Generate docs + start dev server
```

### Frontend
```bash
cd frontend
npm install              # Install dependencies
npm run dev              # Start dev server (port 3000)
npm run build            # Build for production
npm run lint             # Run ESLint
npm start                # Start production server
```

### Docker
```bash
cp .env.example .env     # Copy environment template
docker-compose up -d     # Start all services
# Access points:
# - Frontend: http://localhost:3000
# - Backend API: http://localhost:3001
# - API Docs: http://localhost:3001/api-docs
# - Adminer: http://localhost:8080
```

## Code Conventions

### Backend Patterns

**Services Architecture**: Business logic lives in `src/services/`. Services are singletons exported as instances.
```typescript
// Service pattern
class MyService {
  private initialized = false;

  async initialize(): Promise<void> {
    // Initialization logic
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }
}
export const myService = new MyService();
```

**Plugin System**: Plugins in `src/plugins/` extend functionality via interfaces.
- Deal Sources: Extend `BaseDealSourcePlugin` for new ingestion methods
- Scoring: Add criteria in `ScoringEngine.ts`
- Automation: Register actions in `AutomationEngine.ts`
- ML Models: Add models in `plugins/ml/models/`

**Controllers**: Thin controllers that delegate to services.
```typescript
export const myController = {
  async getSomething(req: Request, res: Response) {
    try {
      const result = await myService.getSomething(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },
};
```

**Models**: Sequelize models with associations defined in `models/index.ts`.

**API Response Format**:
```typescript
// Success
{ success: true, data: T }

// Paginated
{ success: true, data: T[], pagination: { page, limit, total, totalPages } }

// Error
{ success: false, error: string, message?: string }
```

### Frontend Patterns

**React Query Hooks**: Data fetching uses TanStack Query with custom hooks.
```typescript
// hooks/use-something.ts
export function useSomething(id: string) {
  return useQuery({
    queryKey: ['something', id],
    queryFn: () => api.get<Something>(`/api/something/${id}`),
    enabled: !!id,
  });
}

export function useCreateSomething() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Something>) => api.post('/api/something', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['something'] });
    },
  });
}
```

**API Client**: Centralized in `lib/api.ts` with automatic token handling.

**Components**: Use shadcn/ui components from `components/ui/`. Follow existing patterns:
- Path aliases: `@/` maps to `src/`
- Form handling: react-hook-form with zod validation
- State: Zustand for global state (`stores/`), React Query for server state

**App Router**: Next.js 16 App Router with route groups:
- `(auth)/` - Authentication pages
- `(dashboard)/` - Protected dashboard pages with 19 sections

### TypeScript

**Backend**: Strict mode enabled, ES2022 target
- Use explicit types for function parameters and returns
- Sequelize models use decorators

**Frontend**: Strict mode, bundler module resolution
- Types in `src/types/index.ts`
- Interface over type when possible

## Key API Endpoints

| Endpoint Group | Base Path | Purpose |
|----------------|-----------|---------|
| Auth | `/api/auth` | User authentication (JWT) |
| Properties | `/api/listings` | Property CRUD |
| Hedge Funds | `/api/hedgefunds` | Buy box management |
| AI Agents | `/api/ai` | Compliance, buy box, guardrail agents |
| Agent Chat | `/api/agent` | Conversational AI with 65+ tools |
| Marketplace | `/api/marketplace` | Swipe-based marketplace |
| Fast Buy Box | `/api/fastbuybox` | Public buy box submission (no auth) |
| Pipeline | `/api/pipeline` | 7-stage deal tracking |
| Portfolio | `/api/portfolio` | Owned property tracking |
| Analytics | `/api/analytics` | Win/loss & agent metrics |
| Knowledge | `/api/knowledge` | RAG document management |
| Market Data | `/api/market-data` | Zillow enrichment (cached) |
| ML | `/api/ml` | ML model training & predictions |
| Compliance | `/api/compliance` | Fraud, sanctions, verification |
| Broker | `/api/broker` | Broker management |
| MSA | `/api/msa` | Master Service Agreements |
| Contacts | `/api/contacts` | Contact management |
| Buyers | `/api/buyers` | Buyer management |
| Buyer Agent | `/api/buyer` | Buyer-side agent tools |
| Seller Agent | `/api/seller` | Seller-side agent tools |
| Inquiries | `/api/inquiries` | Property inquiry management |
| Contracts | `/api/contracts` | Contract/e-signature integration |
| Follow-ups | `/api/follow-up` | Follow-up chain management |
| Dead Letters | `/api/dead-letters` | Failed automation retries |
| Webhooks | `/api/webhooks` | External webhook handling |
| Proxy Pics | `/api/proxypics` | Property photo service |
| Settings | `/api/settings` | System settings |
| OpenAI-compat | `/v1` | OpenAI-compatible API for external tools |

Interactive API docs: `http://localhost:3001/api-docs`

## Database Models

### Core Models
- `Property` - Real estate deals (90+ fields)
- `MarketplaceUser` - Platform users
- `UserBuyBox` - User investment criteria
- `HedgeFundBuyBox` - Institutional fund criteria
- `Fund` - Hedge fund organizations
- `Buyer` - Buyer entities
- `BuyerContact` - Buyer contact information

### Transaction Models
- `DealAction` - Swipe/view/offer events (ML training data)
- `DealOffer` - Purchase offers
- `DealPipeline` - Pipeline stage tracking
- `DealMatch` - Deal-buybox matches
- `DealCommunication` - Communication history
- `DealFeeTracking` - Fee tracking
- `DealBrokerMSA` - Broker MSA assignments
- `Portfolio` - Owned properties
- `PropertyInquiry` - Property inquiries

### Compliance Models
- `ComplianceCheck` - Compliance check results
- `ComplianceEvent` - Compliance event stream
- `ComplianceAlert` - Active alerts
- `ComplianceAuditLog` - SOC 2 audit trail
- `ComplianceRuleVersion` - Rule versioning
- `ComplianceWebhook` - Webhook configurations
- `FraudSignal` - Detected fraud indicators
- `SanctionsScreening` - OFAC/sanctions checks
- `EscalationPolicy` - Alert escalation rules
- `StateComplianceRule` - State-specific rules
- `StateDocumentTemplate` - State document requirements
- `StateKnowledge` - State-specific knowledge

### ML Models
- `FundFeedback` - Outcome feedback for training
- `MLPrediction` - Prediction logs
- `ModelVersion` - ML model versioning
- `TrainingRun` - Training job tracking
- `AgentMetric` - Agent performance metrics
- `InvestorAction` - Investor activity tracking

### Broker Models
- `BrokerProfile` - Broker information
- `BrokerAssistant` - Broker assistant relationships
- `TransactionCoordinator` - Transaction coordination

### System Models
- `Automation` / `AutomationExecution` - Automation rules & logs
- `WorkflowExecution` - Workflow state
- `ConversationHistory` - Chat history
- `PropertyDocument` - Document storage
- `PropertyLookup` - Property lookup cache
- `PropertyContact` - Property contact info
- `DeadLetterQueue` - Failed automation retries
- `FollowUpChain` / `FollowUpExecution` - Follow-up management
- `DocuSealSubmission` - E-signature tracking
- `Contact` - General contacts
- `EmailInbox` - Email source configurations
- `Settings` - System settings

## Testing

### Jest Configuration
- Unit tests: `src/tests/unit/**/*.test.ts`
- Integration tests: `src/tests/integration/**/*.test.ts`
- ML tests run separately: `npm run test:ml`

### Writing Tests
```typescript
import { myService } from '../services/MyService';

describe('MyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', async () => {
    const result = await myService.doSomething();
    expect(result).toBeDefined();
  });
});
```

### Mocking
- Chokidar is auto-mocked for tests
- Mock database connections in tests

## Environment Variables

### Required
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dispotree
# OR
DB_USER=dispotree_user
DB_PASSWORD=password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dispotree_db

# Auth
JWT_SECRET=your_jwt_secret
```

### Optional (enable features)
```bash
# AI/ML
OPENAI_API_KEY=sk-...              # AI agents + embeddings
OPENROUTER_API_KEY=...             # Alternative LLM provider
AGENT_MODEL=gpt-4o                 # Default agent model

# Cache
REDIS_URL=redis://localhost:6379   # Falls back to in-memory

# Market Data
RAPIDAPI_KEY=...                   # Zillow enrichment

# Knowledge Base
PINECONE_API_KEY=...               # RAG vector storage
KNOWLEDGE_FOLDER=./knowledge       # Document watch folder

# Integrations
DOCUSEAL_API_KEY=...               # E-signatures
DOCUSEAL_API_URL=https://api.docuseal.com
DOCUSEAL_WEBHOOK_SECRET=...        # Webhook verification
RESEND_API_KEY=...                 # Email
TWILIO_SID=...                     # SMS
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
```

## Common Tasks

### Adding a New API Endpoint

1. Create/update route in `backend/src/routes/`
2. Add controller logic in `backend/src/controllers/`
3. Add service logic in `backend/src/services/`
4. Add Swagger JSDoc comments for documentation
5. Update frontend hooks if needed

### Adding a New Database Model

1. Create model in `backend/src/models/MyModel.ts`
2. Import and export in `backend/src/models/index.ts`
3. Define associations in `models/index.ts`
4. Add to sync array if needed

### Adding a New Deal Source Plugin

1. Create plugin extending `BaseDealSourcePlugin`
2. Implement `ingestDeals()` method
3. Register in `plugins/index.ts`
4. Add configuration endpoints if needed

### Adding a New Frontend Page

1. Create page in `frontend/src/app/(dashboard)/page-name/page.tsx`
2. Create custom hooks in `frontend/src/hooks/` if needed
3. Add navigation in sidebar component

### Adding Agent Tools

1. Define tool in `backend/src/services/agentService.ts` with name, description, parameters
2. Implement handler function
3. Register in tools array
4. Test via `/api/agent/chat` endpoint

## Error Handling

### Backend
- Use try/catch in controllers
- Return `{ success: false, error: message }` for errors
- Security: `errorSanitizer` middleware strips stack traces in production

### Frontend
- API errors throw `ApiError` with status code
- 401 errors auto-redirect to login
- Use React Query error states for UI feedback

## Security Considerations

- JWT tokens stored in localStorage
- Helmet.js for security headers
- Input validation with Joi/Zod
- CORS configured in `middleware/cors.ts`
- Credentials stored in `SecureCredentialStore` (browser automation)
- Error messages sanitized in production
- SOC 2 compliant audit logging

## Compliance System

The compliance system provides comprehensive deal verification:

### Fraud Detection
- Velocity checks (submission frequency limits)
- Pattern detection (daisy chaining, price manipulation)
- Entity mismatch detection
- Known fraud network tracking
- Risk scoring (0-100)

### Sanctions Screening
- OFAC SDN List
- UN/EU/UK sanctions lists
- Automatic screening of all parties
- Match scoring and resolution workflow

### Property Verification
- Ownership verification against public records
- Property details verification
- Tax status checking
- Automated valuation (AVM)

### Title Verification
- Lien detection (mortgage, tax, judgment)
- Encumbrance checking
- Lis pendens detection

### State Compliance
- State-specific rule enforcement
- Licensing requirements
- Documentation requirements

### Status System
- **GREEN**: All checks passed, deal proceeds
- **YELLOW**: Minor issues, needs review
- **RED**: Critical issues, deal blocked

## AI Agent Tools

The AI agent at `/api/agent/chat` has 65+ tools organized by category:

### Property Management
- search_properties, get_property_details, get_property_count
- create_property, update_property, delete_property
- get_recent_deals, find_similar_properties, compare_deals
- enrich_property, import_from_url

### Deal Analysis
- analyze_deal, quick_deal_assessment, quick_deal_score
- score_deal_against_buyboxes, get_deal_intelligence
- get_pricing_strategy, find_best_funds, process_new_deal
- batch_process_deals

### Buy Box Management
- list_buyboxes, get_buybox_details, create_buybox
- update_buybox, delete_buybox

### Pipeline & Portfolio
- add_to_pipeline, update_pipeline_stage, get_my_pipeline
- close_deal, add_to_portfolio, get_my_portfolio
- get_portfolio_value, update_property_value

### Market Data
- lookup_market_data, get_market_stats, skip_trace_property
- get_rental_market_trends, get_recent_market_lookups

### Offers
- create_offer, list_offers

### Contracts & E-Signatures
- list_contract_templates, send_contract
- get_contract_status, resend_contract_reminder

### Knowledge & Memory
- search_knowledge, get_knowledge_stats
- remember_preference, recall_memories
- get_memory_stats, clear_memories

### Automations
- list_automations, get_automation, toggle_automation
- create_automation, delete_automation, get_automation_history

### Settings
- get_settings, update_setting, reset_setting

### Analytics
- get_win_loss_stats, get_agent_accuracy

### Browser Automation
- scrape_website, map_website, list_auction_sites
- submit_property_to_site, send_deal_to_fund

## Frontend Dashboard Pages

The dashboard includes these main sections:
- `dashboard/` - Main dashboard overview
- `deals/` - Deal management
- `pipeline/` - Deal pipeline view
- `marketplace/` - Swipe marketplace
- `buyboxes/` - Buy box management
- `buyers/` - Buyer management
- `buyer-chat/` - Buyer chat interface
- `chat/` - AI agent chat
- `compliance/` - Compliance dashboard
- `contacts/` - Contact management
- `inquiries/` - Property inquiries
- `import/` - Data import
- `knowledge/` - Knowledge base
- `ml-training/` - ML model training
- `newdeal/` - New deal entry
- `profile/` - User profile
- `scoring/` - Deal scoring
- `settings/` - System settings
- `broker/` - Broker management

## Performance Notes

| Operation | Typical Latency |
|-----------|-----------------|
| Deal ingestion | <100ms |
| Buy box scoring | <50ms |
| ML prediction | <20ms |
| Full enrichment | 2-5s |
| Browser automation | 30-120s |
| Compliance check | 1-3s |
| Sanctions screening | 500ms-2s |

## Troubleshooting

### Database Connection Failed
- Check `DATABASE_URL` or individual `DB_*` vars
- Server continues running without DB (limited functionality)

### Redis Not Available
- Falls back to in-memory cache automatically
- Check `REDIS_URL` for connection issues

### AI Agent Not Working
- Verify `OPENAI_API_KEY` or `OPENROUTER_API_KEY`
- Agent initializes with warning if keys missing

### Knowledge Base Issues
- Verify `PINECONE_API_KEY` for vector storage
- Check `KNOWLEDGE_FOLDER` path exists

### Compliance System Issues
- Check external verification service availability
- Review dead letter queue for failed actions
- Check audit logs for error patterns

## Quick Reference

### Pipeline Stages
`new` → `analyzing` → `due_diligence` → `offered` → `negotiating` → `under_contract` → `closed`

### Match Types
- `strong`: 75%+ score
- `moderate`: 50-75% score
- `weak`: 25-50% score
- `no_match`: <25% or failed hard requirements

### Property Status
`new` → `enriched` → `scored` → `submitted` → `accepted` | `rejected`

### Compliance Status
- `GREEN` (pass): All clear, proceed
- `YELLOW` (warning): Minor issues, review needed
- `RED` (fail): Critical issues, blocked

### Risk Levels
| Level | Score Range |
|-------|-------------|
| Low | 0-39 |
| Medium | 40-59 |
| High | 60-79 |
| Critical | 80-100 |

### Investment Strategies
- Fix & Flip
- Buy & Hold (Long-term Rental)
- Short-term Rental
- Wholesale
- Novation
- Subject-To

## Documentation

Additional documentation is available in the `docs/` folder:
- `API-DOCUMENTATION.md` - API reference
- `COMPLIANCE_USER_GUIDE.md` - Complete compliance system guide
- `BROKER_MEDIATED_COMPLIANCE_IMPLEMENTATION.md` - Broker compliance implementation
- `WHITEPAPER.md` - Platform whitepaper

## GitHub Actions Integration

### Claude Autonomous Agent

This repository uses **Anthropic's official Claude Code action** to automatically work on GitHub issues and create pull requests. When you're triggered via GitHub Actions, follow these guidelines:

#### When Working on Issues

1. **Understand the Issue Completely**
   - Read the full issue description and all comments
   - Identify the type: bug fix, feature request, refactoring, documentation
   - Look for related issues or PRs mentioned
   - Check acceptance criteria if provided

2. **Analyze the Codebase**
   - Use Grep/Glob to find relevant files
   - Read existing implementations to understand patterns
   - Check for similar features or fixes in the codebase
   - Review related tests

3. **Plan Your Changes**
   - Identify all files that need modification
   - Consider backward compatibility
   - Plan test coverage
   - Think about edge cases

4. **Implement Changes**
   - Follow existing code style and patterns
   - Add proper TypeScript types
   - Include comprehensive error handling
   - Add JSDoc comments for complex logic
   - Update related documentation

5. **Testing Requirements**
   - Add or update unit tests for backend changes
   - Test API endpoints if modified
   - Verify frontend components render correctly
   - Check database migrations if models changed
   - Run existing tests to ensure no regressions

6. **Create Quality PRs**
   - Write clear, descriptive PR titles
   - Include detailed description of changes
   - Reference the original issue number
   - Add "Fixes #123" to auto-close issues
   - List testing steps performed
   - Note any breaking changes

#### Code Review Guidelines

When reviewing PRs:
- Check TypeScript type safety
- Verify error handling
- Review security implications
- Check for SQL injection, XSS, auth bypasses
- Validate input sanitization
- Assess performance impact
- Suggest optimizations for database queries
- Review code readability and maintainability

#### Common Patterns to Follow

**Backend Services**:
```typescript
// Services are singletons with initialize()
class MyService {
  private initialized = false;

  async initialize(): Promise<void> {
    // Setup logic
    this.initialized = true;
  }
}
export const myService = new MyService();
```

**API Responses**:
```typescript
// Always return consistent format
{ success: true, data: result }
{ success: false, error: "message" }
```

**Frontend Hooks**:
```typescript
// Use React Query for data fetching
export function useMyData(id: string) {
  return useQuery({
    queryKey: ['mydata', id],
    queryFn: () => api.get(`/api/mydata/${id}`),
  });
}
```

#### Issue Triage

When triaging issues, provide:
- **Category**: bug | feature | docs | question
- **Priority**: low | medium | high | critical
- **Complexity**: simple | medium | complex
- **Affected Components**: List relevant services/components
- **Suggested Labels**: Appropriate GitHub labels
- **Questions**: Any clarifications needed

#### Commit Message Format

Follow this format:
```
<type>: <short description>

<detailed description if needed>

Fixes #<issue-number>

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
```

Types: feat, fix, docs, refactor, test, chore

#### Environment Awareness

- Backend runs on port 3001
- Frontend runs on port 3000
- Database is PostgreSQL
- Redis is optional (falls back to in-memory)
- Check `.env.example` for required variables

#### When Stuck

If you encounter issues:
1. Leave detailed comments in the PR
2. Add TODO comments in code for unresolved items
3. Request clarification in the issue
4. Suggest alternative approaches
5. Document assumptions made

---
*Last Updated: February 2026*
