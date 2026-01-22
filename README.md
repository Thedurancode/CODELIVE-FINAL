  # Dispotree

![License](https://img.shields.io/badge/License-Proprietary-red)
![Dispotech Inc](https://img.shields.io/badge/%C2%A9-Dispotech%20Inc-blue)

A comprehensive real estate wholesale deal management platform with AI-powered deal analysis, ML-based buyer matching, and automated distribution workflows.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DISPOTREE PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐           │
│  │   DEAL SOURCES  │     │  PROCESSING     │     │  DISTRIBUTION   │           │
│  │                 │     │                 │     │                 │           │
│  │  • API          │────▶│  • Normalize    │────▶│  • Marketplace  │           │
│  │  • Email        │     │  • Enrich       │     │  • Hedge Funds  │           │
│  │  • Webhook      │     │  • Score        │     │  • Xome/Hubzu   │           │
│  │  • CSV Upload   │     │  • AI Analysis  │     │  • Email Lists  │           │
│  │  • Manual Entry │     │  • Compliance   │     │                 │           │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘           │
│                                   │                       │                     │
│                                   ▼                       ▼                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         AI AGENT SYSTEM                                  │   │
│  │                                                                          │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │   │
│  │   │  Compliance  │  │   Buy Box    │  │  Guardrail   │  │ Underwrite │  │   │
│  │   │    Agent     │  │    Agent     │  │    Agent     │  │   Agent    │  │   │
│  │   └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      SWIPE-BASED MARKETPLACE                             │   │
│  │                                                                          │   │
│  │   Users ──▶ Buy Boxes ──▶ Matched Feed ──▶ Swipe ──▶ Offer ──▶ Close   │   │
│  │                              │                                           │   │
│  │                              ▼                                           │   │
│  │                     ML Prediction Engine                                 │   │
│  │                   (View Duration Signals)                                │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Key Features

### Deal Processing Pipeline
- **Multi-source ingestion**: API, email parsing, webhooks, CSV, manual entry
- **Data normalization**: Standardize deal data from any source
- **AI enrichment**: Automatic data completion using ML models
- **Extensible scoring**: Pluggable buy box and deal source scoring

### AI Agent System (65+ Tools)
- **Compliance Agent**: Contract analysis and regulatory verification
- **Buy Box Agent**: Intelligent property-to-fund matching
- **Guardrail Agent**: Real-time content moderation
- **Underwriting Agent**: Automated deal analysis and valuation
- **Pipeline Tools**: Manage deals through stages via chat
- **Portfolio Tools**: Track owned properties via chat
- **DocuSeal Tools**: Send contracts for e-signature via chat
- **Knowledge & Memory**: Search knowledge base, remember preferences, recall conversations
- **Browser Automation**: Scrape websites, submit to auction sites (Hubzu, Xome)
- **Market Data**: Zillow enrichment, skip tracing, rental trends
- **Analytics**: Win/loss stats, agent accuracy metrics

### Deal Pipeline & Portfolio
- **7-Stage Pipeline**: new → analyzing → due_diligence → offered → negotiating → under_contract → closed
- **Portfolio Tracking**: Owned properties with valuations, cash flow, ROI
- **Win/Loss Analysis**: Learn from closed deals to improve accuracy
- **Agent Metrics**: Track AI agent performance over time

### E-Signature Integration (DocuSeal)
- **Automated Contracts**: Send contracts via automation triggers
- **Webhook Events**: Auto-update pipeline when documents are signed
- **Chat Interface**: "Send a contract to the seller for 123 Main St"
- **Contract Analytics**: Track signature rates and completion times
- **Reminders**: Automated follow-up for unsigned documents
- **Local Persistence**: Offline contract drafts with sync

### Comprehensive Compliance System
- **Compliance Rules Engine**: Configurable rules by state with operators (required, min/max value, regex, etc.)
- **AI-Powered Rule Generation**: Generate compliance rules from natural language descriptions
- **Compliance Dashboard**: Visual analytics showing pass/fail rates, issues by state, trends over time
- **Auto-Check on Submit**: Automatically run compliance when deals are created or updated
- **Bulk Compliance Check**: Check all deals at once with filtering options
- **Rule Testing**: Preview which existing deals would pass/fail before enabling a rule
- **State Knowledge Base**: Store state-specific laws, regulations, and requirements
- **Document Templates**: State-specific DocuSeal templates with field mappings
- **Severity Levels**: Critical (blockers), Warning (review needed), Info (advisory)
- **Fraud Detection**: Velocity checks, pattern detection, daisy chaining detection, risk scoring (0-100)
- **Sanctions Screening**: OFAC SDN List, UN/EU/UK sanctions, automated screening of all parties
- **Property Verification**: Ownership verification, property details validation, tax status checking
- **Title Verification**: Lien detection (mortgage, tax, judgment), encumbrance checking, lis pendens
- **Compliance Issue Review**: Review panel with approve/reject workflow for flagged issues
- **Compliance Extraction Profiles**: OCR and automated document data extraction
- **SOC 2 Audit Logging**: Complete audit trail for compliance activities
- **Compliance Workflow Automation**: Automated multi-step compliance workflows with human approval gates
- **Compliance Report Generator**: Generate comprehensive compliance reports with export options
- **Status System**: GREEN (pass), YELLOW (review needed), RED (blocked)

### Activity Feed & Notifications
- **Real-time Activity Feed**: Track all platform activities (deals, offers, compliance, messages)
- **Filterable Timeline**: Filter by activity type, user, date range, and entity
- **User Activity Tracking**: See who did what and when across the platform
- **System Events**: Track automated actions, workflow executions, and integrations
- **Activity Analytics**: Insights into platform usage patterns and trends

### Task Management System
- **Task Creation & Assignment**: Create tasks and assign to team members
- **Priority Levels**: Critical, High, Medium, Low priority with visual indicators
- **Due Date Tracking**: Set and track task deadlines with overdue alerts
- **Task Categories**: Organize by deal, property, compliance, or custom categories
- **Status Workflow**: Pending → In Progress → Completed → Archived
- **Task Comments**: Collaborate with threaded comments on tasks
- **Task Dashboard**: Kanban and list views for task management

### Reminder System
- **Scheduled Reminders**: Set one-time or recurring reminders
- **Multiple Channels**: Email, SMS, in-app, and push notification support
- **Entity Linking**: Link reminders to deals, properties, contacts, or tasks
- **Recurrence Patterns**: Daily, weekly, monthly, or custom schedules
- **Smart Scheduling**: Timezone-aware reminder delivery
- **Reminder Templates**: Pre-built templates for common follow-up scenarios

### Document Auto-Classification
- **AI-Powered Classification**: Automatically categorize uploaded documents
- **Document Types**: Contracts, disclosures, title docs, inspection reports, and more
- **Confidence Scoring**: View AI confidence levels for classifications
- **Manual Override**: Correct classifications to improve accuracy over time
- **Batch Processing**: Classify multiple documents at once

### Advanced User Permissions
- **Role-Based Access Control (RBAC)**: Granular permission management
- **Custom Roles**: Create custom roles with specific permission sets
- **Resource-Level Permissions**: Control access at entity level (deals, properties, etc.)
- **Permission Inheritance**: Hierarchical permission structure
- **Audit Trail**: Track permission changes and access patterns
- **Permission Gates**: Frontend components that respect user permissions

### Audit Log Viewer
- **Comprehensive Audit Logs**: View all system activities for SOC 2 compliance
- **Advanced Filtering**: Filter by user, action, resource, date range
- **Export Capabilities**: Export logs for external compliance audits
- **Real-time Updates**: Live log streaming for monitoring
- **Retention Policies**: Configurable log retention periods

### Webhook Management
- **Webhook Configuration UI**: Create and manage webhooks from settings
- **Event Selection**: Subscribe to specific platform events
- **Retry Logic**: Automatic retries with exponential backoff
- **Webhook Logs**: View delivery history and debug failures
- **Signature Verification**: HMAC signatures for webhook security
- **Test Webhooks**: Send test payloads to verify endpoints

### Data Import Wizard
- **Guided Import Flow**: Step-by-step wizard for data imports
- **Multiple Formats**: CSV, Excel, JSON import support
- **Field Mapping**: Map source fields to platform fields
- **Duplicate Detection**: AI-powered duplicate property detection
- **Validation Preview**: Preview and fix errors before import
- **Import History**: Track all imports with rollback capability

### Voice Calling (Beta)
- **Real-time Voice**: Voice calling powered by OpenAI Realtime API
- **Call Recording**: Optional call recording with transcription
- **Call Logs**: Track call history and duration
- **Integration Ready**: Connect with CRM and contact management

### Deals Management
- **Map View**: Interactive map showing deal locations with clustering
- **Google Places Integration**: Address autocomplete and validation
- **Zillow Data Enrichment**: Automatic property data from Zillow API
- **Inline Editing**: Edit deal details directly from the deals list
- **Advanced Filtering**: Filter by status, state, price range, and more

### Payment Processing & ProxyPics Integration
- **Stripe Payment Gateway**: Secure payment processing for professional photo orders
- **ProxyPics Photo Ordering**: Order professional property photos with automated workflow
- **Dynamic Pricing**: Template-based pricing (Exterior: $15, Full Property: $35, Drive-By: $10)
- **3-Step Payment Flow**: Select templates → Pay with Stripe → Confirm & order
- **Admin Order Management**: View all ProxyPics orders across all properties in settings
- **Order Status Tracking**: Real-time status updates (waiting, assigned, uploading, completed)
- **Payment Verification**: Secure payment confirmation before order placement
- **Webhook Integration**: Stripe webhook support for payment events

### Theme Customization
- **Light & Dark Modes**: Full theme switching support across the entire application
- **Instant switching**: Toggle between light and dark modes from Settings
- **Persistent preference**: Theme choice saved to localStorage
- **System theme support**: Optional 'system' mode that follows OS preferences
- **Comprehensive coverage**: All 27 pages and 40+ components are theme-aware
- **Professional design**: Carefully crafted color palettes for both themes

### Email Client Integration
- **IMAP/SMTP Support**: Connect Gmail, Outlook, and custom email accounts
- **Demo Mode**: Test email features without connecting real accounts
- **Inbox Management**: Full-featured email client with folder support
- **Email Threading**: Conversation view with threaded messages
- **Deal Integration**: Link emails to properties and deals
- **App Password Guide**: Step-by-step setup for Gmail app passwords
- **Encrypted Storage**: Secure email credentials with encryption
- **Auto-sync**: Background email synchronization

### Communication & Collaboration
- **Team Chat**: Real-time messaging between team members
- **Messenger Widget**: Persistent chat widget across dashboard
- **Public Property Chat**: Guest chat sessions for property inquiries (no auth required)
- **Conversation Management**: Organize chats by property, deal, or topic
- **Real-time Notifications**: Instant alerts for new messages and updates
- **Notification Bell**: Centralized notification center
- **Supabase Realtime**: WebSocket-based real-time updates
- **Property Preview Cards**: Rich property previews in chat

### Knowledge Base & RAG System
- **Pinecone Vector Storage**: Semantic search across documents
- **Document Management**: Upload and organize knowledge documents
- **Auto-ingestion**: Watch folder for automatic document indexing
- **RAG-powered Agents**: AI agents with access to knowledge base
- **Memory System**: Agent memory for preferences and context
- **Conversation Recall**: Remember past interactions and decisions
- **Knowledge Stats**: Track document usage and search analytics
- **State-specific Knowledge**: Organized by jurisdiction and topic

### Browser Automation
- **Playwright Integration**: Headless browser automation
- **Auction Site Support**: Automated submission to Hubzu, Xome
- **Website Scraping**: Extract data from property listing sites
- **Site Mapping**: Discover and map website structure
- **Automated Distribution**: Send deals to multiple marketplaces
- **Secure Credentials**: Encrypted credential storage for site logins
- **Execution Tracking**: Monitor automation success and failures

### ML & AI Enhancements
- **TensorFlow.js Engine**: Client-side ML predictions
- **Model Training**: Train models on historical deal outcomes
- **Model Versioning**: Track and manage model versions
- **Training Runs**: Monitor training progress and metrics
- **Agent Performance Metrics**: Track AI agent accuracy over time
- **Investor Action Tracking**: Learn from buyer behavior
- **Prediction Logging**: Audit trail for all ML predictions
- **Continuous Learning**: Models improve from user feedback

### Fast Buy Box (Public Onboarding)
- **No authentication required**: Quick investor onboarding at `/fastbuybox`
- **Smart state selection**: Full state names dropdown with checkmarks for selected states
- **Automatic city lookup**: Enter zipcode, instantly see city name (Zippopotam API)
- **Per-zipcode contacts**: Assign specific contacts to individual zipcodes
- **Custom criteria**: Add your own requirements with auto yes/no detection
  - Positive keywords (require, must, allow) auto-enable
  - Negative keywords (no, avoid, exclude) auto-disable
- **Dynamic YES/NO grouping**: All criteria organized into "Allowed" and "Not Allowed" sections
  - Property Features (HOA, pool, solar, septic, well, main road, power lines, double yellow road)
  - Property Issues (flood zone, foundation, structural, fire damage, code violations)
  - Community Restrictions (leasing restrictions, age restrictions)
  - Real-time visual feedback with color-coded badges
  - Sections only show when they have items
- **White paper preview**: Professional offer letter style preview before submission
- **Modern UI**: Sleek toggle switches with instant feedback
- **Investment strategies**: Fix & Flip, Buy & Hold, Short-term Rental, Wholesale, Novation, Subject-To

### Swipe-Based Marketplace
- **User buy boxes**: Define investment criteria
- **Personalized feed**: ML-ranked deals matching user preferences
- **Like/Pass with feedback**: Learn from user behavior
- **ML predictions**: Predict user interest using view duration signals
- **Offer management**: Submit, counter, accept/reject offers

### Workflow & Automation Engine
- **Event-driven automations**: Trigger actions on deal events
- **DocuSeal actions**: Auto-send contracts, check status
- **Conditional branching**: Route deals based on criteria
- **Human-in-the-loop**: Pause for manual review when needed
- **Webhook receivers**: DocuSeal, Zapier, Make, custom integrations

### Document Requirements & Tracking
- **State-specific Checklists**: Required documents by state and deal type
- **Compliance Passport**: Document collection progress tracking
- **Auto-detection**: Automatically mark documents as received
- **Document Templates**: Pre-configured templates for common documents
- **Quality Tracking**: Monitor document completeness and quality
- **Deadline Management**: Track submission deadlines and send reminders
- **Visual Progress**: Color-coded status (complete, pending, missing)

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL 14+, Sequelize ORM |
| **Cache** | Redis (with in-memory fallback) |
| **Vector DB** | Pinecone (RAG & memory) |
| **Frontend** | Next.js 16.1.0, React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| **State Management** | TanStack React Query 5, Zustand 5 |
| **Forms** | react-hook-form, Zod 4 |
| **Drag & Drop** | @hello-pangea/dnd |
| **AI/LLM** | OpenRouter, OpenAI, LangChain |
| **ML** | TensorFlow.js, custom prediction engine |
| **E-Signature** | DocuSeal |
| **Payment Processing** | Stripe |
| **Browser Automation** | Playwright |
| **Realtime** | Supabase Realtime, WebSockets |
| **Email** | IMAP/SMTP integration, Resend |
| **External APIs** | Zippopotam, Zillow/RapidAPI, Google Places, ProxyPics |
| **API Docs** | Swagger/OpenAPI 3.1, Scalar UI |
| **Infrastructure** | Docker, Docker Compose, Nginx |

## Project Structure

```
Dispotree/
├── backend/
│   ├── src/
│   │   ├── config/              # Database, Swagger, Supabase config
│   │   ├── controllers/         # API request handlers (35+)
│   │   │   ├── authController.ts
│   │   │   ├── propertyController.ts
│   │   │   ├── marketplaceController.ts
│   │   │   ├── complianceController.ts
│   │   │   ├── contractController.ts
│   │   │   ├── pluginController.ts
│   │   │   ├── teamChatController.ts
│   │   │   ├── aiComplianceController.ts
│   │   │   ├── aiBuyBoxController.ts
│   │   │   └── aiGuardrailController.ts
│   │   ├── models/              # Sequelize models (50+)
│   │   │   ├── Property.ts
│   │   │   ├── MarketplaceUser.ts
│   │   │   ├── UserBuyBox.ts
│   │   │   ├── DealAction.ts
│   │   │   ├── ComplianceAlert.ts
│   │   │   ├── ComplianceCheck.ts
│   │   │   ├── ComplianceIssueReview.ts
│   │   │   ├── ComplianceExtractionProfile.ts
│   │   │   ├── PropertyFieldQuality.ts
│   │   │   ├── TeamConversation.ts
│   │   │   ├── TeamMessage.ts
│   │   │   ├── Email.ts
│   │   │   ├── UserEmailConfig.ts
│   │   │   ├── GuestSession.ts
│   │   │   ├── DealSource.ts
│   │   │   └── index.ts         # Model associations
│   │   ├── plugins/             # Extensible plugin system
│   │   │   ├── sources/         # Deal source plugins
│   │   │   ├── scoring/         # Scoring engine
│   │   │   ├── workflow/        # Workflow orchestration
│   │   │   ├── automation/      # Automation engine
│   │   │   ├── ai/              # AI analysis services
│   │   │   ├── ml/              # TensorFlow.js ML services
│   │   │   ├── browser/         # Playwright browser automation
│   │   │   ├── registry/        # Plugin registry
│   │   │   └── types/           # Plugin type definitions
│   │   ├── routes/              # API routes (35+ route files)
│   │   │   ├── authRoutes.ts
│   │   │   ├── propertyRoutes.ts
│   │   │   ├── complianceRoutes.ts
│   │   │   ├── contactRoutes.ts
│   │   │   ├── emailClientRoutes.ts
│   │   │   ├── teamChatRoutes.ts
│   │   │   ├── publicChatRoutes.ts
│   │   │   └── ...
│   │   ├── services/            # Business logic (55+ services)
│   │   │   ├── MarketplaceService.ts
│   │   │   ├── ComplianceService.ts
│   │   │   ├── ComplianceOCRService.ts
│   │   │   ├── FraudDetectionService.ts
│   │   │   ├── SanctionsScreeningService.ts
│   │   │   ├── PropertyVerificationService.ts
│   │   │   ├── PropertyFieldQualityService.ts
│   │   │   ├── TeamCommunicationService.ts
│   │   │   ├── EmailClientService.ts
│   │   │   ├── DocuSealService.ts
│   │   │   ├── NotificationService.ts
│   │   │   ├── SupabaseRealtimeService.ts
│   │   │   ├── knowledge/       # RAG knowledge base
│   │   │   └── ...
│   │   ├── seeds/               # Database seed scripts
│   │   ├── tests/               # Jest test suites
│   │   │   ├── unit/           # Unit tests
│   │   │   ├── integration/    # Integration tests
│   │   │   └── ml/             # ML-specific tests
│   │   ├── types/               # TypeScript type definitions
│   │   ├── utils/               # Utility functions
│   │   │   ├── documentFields.ts
│   │   │   ├── emailPasswordEncryption.ts
│   │   │   └── ...
│   │   ├── validation/          # Request validation schemas
│   │   └── validators/          # Custom validators
│   ├── knowledge/               # Knowledge base documents
│   │   └── defaults/           # Default knowledge
│   ├── docs/                    # Architecture docs
│   │   ├── openapi.json
│   │   └── openapi.yaml
│   ├── migrations/              # Database migrations
│   └── package.json
│
├── frontend/                    # Next.js 16 application
│   ├── src/
│   │   ├── app/                 # Next.js App Router
│   │   │   ├── (auth)/         # Auth pages
│   │   │   ├── (dashboard)/    # Dashboard pages (19 sections)
│   │   │   │   ├── dashboard/
│   │   │   │   ├── deals/
│   │   │   │   ├── pipeline/
│   │   │   │   ├── marketplace/
│   │   │   │   ├── buyboxes/
│   │   │   │   ├── buyers/
│   │   │   │   ├── buyer-chat/
│   │   │   │   ├── chat/
│   │   │   │   ├── compliance/
│   │   │   │   ├── contacts/
│   │   │   │   ├── email/
│   │   │   │   ├── inquiries/
│   │   │   │   ├── import/
│   │   │   │   ├── knowledge/
│   │   │   │   ├── ml-training/
│   │   │   │   ├── newdeal/
│   │   │   │   ├── profile/
│   │   │   │   ├── scoring/
│   │   │   │   └── settings/
│   │   │   ├── api/            # API route handlers
│   │   │   ├── broker-apply/   # Broker application
│   │   │   ├── fastbuybox/     # Public buy box
│   │   │   ├── property-chat/  # Public property chat
│   │   │   └── layout.tsx
│   │   ├── components/          # React components
│   │   │   ├── ui/             # shadcn/ui components (28)
│   │   │   ├── layout/         # Layout components
│   │   │   ├── providers/      # Context providers
│   │   │   ├── buybox/         # Buy box forms
│   │   │   ├── compliance/     # Compliance UI
│   │   │   │   ├── ComplianceIssueReviewPanel.tsx
│   │   │   │   └── DocuSealEmbed.tsx
│   │   │   ├── deals/          # Deal components
│   │   │   │   ├── DocumentRequirementsChecklist.tsx
│   │   │   │   └── PublicPropertyChat.tsx
│   │   │   ├── messenger/      # Chat widget
│   │   │   ├── settings/       # Settings components
│   │   │   │   ├── EmailAccountSettings.tsx
│   │   │   │   └── AppPasswordGuide.tsx
│   │   │   └── layout/
│   │   │       ├── header.tsx
│   │   │       ├── sidebar.tsx
│   │   │       └── NotificationBell.tsx
│   │   ├── hooks/               # Custom hooks (25+)
│   │   │   ├── use-properties.ts
│   │   │   ├── use-contacts.ts
│   │   │   ├── use-compliance-rules.ts
│   │   │   ├── use-email-client.ts
│   │   │   ├── use-team-chat.ts
│   │   │   ├── use-public-chat.ts
│   │   │   ├── use-document-checklist.ts
│   │   │   ├── use-user-email-config.ts
│   │   │   └── ...
│   │   ├── lib/                 # Utilities
│   │   │   ├── api.ts          # API client
│   │   │   ├── utils.ts        # Helper functions
│   │   │   └── notifications.ts
│   │   ├── stores/              # Zustand stores
│   │   │   └── app-store.ts    # Global state
│   │   └── types/               # TypeScript types
│   │       └── index.ts
│   ├── public/                  # Static assets
│   └── package.json
│
├── docs/                        # Project documentation
│   ├── API-DOCUMENTATION.md
│   ├── COMPLIANCE_USER_GUIDE.md
│   ├── BROKER_MEDIATED_COMPLIANCE_IMPLEMENTATION.md
│   ├── WHITEPAPER.md
│   └── PROPERTY_FULL_EXAMPLE.md
├── ai-agent-knowledgebase/      # AI agent training resources
├── contracts/                   # Legal document templates
├── data-structure/              # Data schema documentation
├── database/                    # Database scripts
├── docker-compose.yml           # Docker orchestration
├── db-manage.sh                 # Database management
├── start.sh                     # Application startup
├── .env.example                 # Environment template
├── CLAUDE.md                    # AI assistant guidelines
└── README.md
```

## API Endpoints

### Core APIs

| Endpoint Group | Base Path | Endpoints | Description |
|----------------|-----------|-----------|-------------|
| Auth | `/api/auth` | 6 | User authentication (JWT) |
| Properties | `/api/listings` | 5 | Property CRUD operations |
| Plugins | `/api/plugins` | 50+ | Plugin system management |
| AI Agents | `/api/ai` | 12 | AI agent interactions |
| Agent Chat | `/api/agent` | 6 | Conversational AI with 65+ tools |
| Marketplace | `/api/marketplace` | 25+ | Swipe-based marketplace |
| Fast Buy Box | `/api/fastbuybox` | 2 | Public buy box submission |
| Compliance | `/api/compliance` | 20+ | Compliance rules, fraud detection, sanctions |
| Pipeline | `/api/pipeline` | 10 | Deal stage tracking |
| Portfolio | `/api/portfolio` | 10 | Property portfolio management |
| Analytics | `/api/analytics` | 15 | Win/loss & agent metrics |
| Knowledge | `/api/knowledge` | 8 | RAG document management |
| Webhooks | `/api/webhooks` | 3 | DocuSeal & generic receivers |
| Hedge Funds | `/api/hedgefunds` | 5 | Fund distribution |
| Contacts | `/api/contacts` | 10 | Contact management & linking |
| Buyers | `/api/buyers` | 8 | Buyer management |
| Email Client | `/api/email-client` | 12 | Email inbox, sending, configuration |
| Team Chat | `/api/team-chat` | 10 | Team messaging & conversations |
| Public Chat | `/api/public-chat` | 5 | Guest property chat sessions |
| Broker | `/api/broker` | 8 | Broker management & approvals |
| MSA | `/api/msa` | 6 | Master Service Agreements |
| Contracts | `/api/contracts` | 8 | Contract/e-signature integration |
| Payments | `/api/payments` | 5 | Stripe payment processing, ProxyPics orders |
| ProxyPics | `/api/proxypics` | 4 | Professional photo ordering |
| Inquiries | `/api/inquiries` | 7 | Property inquiry management |
| Follow-ups | `/api/follow-up` | 6 | Follow-up chain management |
| Dead Letters | `/api/dead-letters` | 4 | Failed automation retries |
| Market Data | `/api/market-data` | 5 | Zillow enrichment (cached) |
| ML | `/api/ml` | 6 | ML model training & predictions |
| Settings | `/api/settings` | 4 | System settings |
| OpenAI-compat | `/v1` | 3 | OpenAI-compatible API for external tools |
| Activity Feed | `/api/activity-feed` | 6 | Activity timeline & tracking |
| Tasks | `/api/tasks` | 10 | Task management & assignment |
| Reminders | `/api/reminders` | 8 | Reminder scheduling & notifications |
| Audit Logs | `/api/audit-logs` | 6 | SOC 2 compliant audit log access |
| Permissions | `/api/permissions` | 12 | Role & permission management |
| Health | `/api/health` | 3 | System health monitoring |
| Webhooks Mgmt | `/api/webhooks/manage` | 8 | Webhook configuration & logs |
| Import Wizard | `/api/import` | 6 | Guided data import with validation |
| Classification | `/api/classification` | 4 | Document auto-classification |
| Voice | `/api/voice` | 5 | Real-time voice calling |
| Conversations | `/api/conversations` | 4 | Conversation management & titles |
| Compliance Workflows | `/api/compliance-workflows` | 8 | Automated compliance workflows |

### Fast Buy Box API

```
# Public endpoints (no authentication required)
POST   /api/fastbuybox                           # Submit buy box criteria
GET    /api/fastbuybox/options                   # Get available options (states, property types, strategies)

# Request body for POST /api/fastbuybox
{
  "name": "My Buy Box",
  "fundName": "ABC Investments",
  "contactEmail": "investor@example.com",
  "contactPhone": "555-123-4567",
  "states": ["TX", "FL", "AZ"],
  "zipcodes": [
    { "zipcode": "75201", "city": "Dallas", "state": "TX" },
    { "zipcode": "33101", "city": "Miami", "state": "FL", "contact": { "name": "John", "email": "john@example.com" } }
  ],
  "propertyTypes": ["single_family", "townhouse"],
  "minPrice": 50000,
  "maxPrice": 300000,
  "investmentStrategies": ["fix_and_flip", "long_term_rental"],
  "allowHoa": true,
  "allowFloodZone": false,
  "customCriteria": [
    { "name": "MUST HAVE GARAGE", "enabled": true },
    { "name": "NO CORNER LOTS", "enabled": false }
  ]
}
```

### Marketplace API Detail

```
# Users
POST   /api/marketplace/users                    # Create user
GET    /api/marketplace/users/:userId            # Get user profile

# Buy Boxes
POST   /api/marketplace/users/:userId/buyboxes   # Create buy box
GET    /api/marketplace/users/:userId/buyboxes   # List buy boxes
PUT    /api/marketplace/buyboxes/:buyBoxId       # Update buy box

# Deal Feed
GET    /api/marketplace/users/:userId/feed       # Personalized deal feed

# Swipe Actions
POST   /api/marketplace/users/:userId/deals/:dealId/swipe  # Like/Pass
POST   /api/marketplace/users/:userId/deals/:dealId/view   # Record view

# Offers
POST   /api/marketplace/users/:userId/deals/:dealId/offers # Submit offer
GET    /api/marketplace/users/:userId/offers     # List user offers
POST   /api/marketplace/offers/:offerId/respond  # Respond to offer

# ML Predictions
GET    /api/marketplace/users/:userId/profile    # Behavior profile
GET    /api/marketplace/users/:userId/deals/:dealId/predict  # Predict interest
```

### Plugin System API

```
# Deal Sources
GET    /api/plugins/sources                      # List all sources
POST   /api/plugins/sources/:id/deals            # Submit deal
GET    /api/plugins/sources/:id/config           # Get source config

# Workflows
GET    /api/plugins/workflows                    # List workflows
POST   /api/plugins/workflows/:id/start          # Start workflow
POST   /api/plugins/workflows/:id/resume         # Resume paused workflow

# Automation
GET    /api/plugins/automation/rules             # List rules
POST   /api/plugins/automation/rules             # Create rule
```

### Pipeline API

```
GET    /api/pipeline                    # Get user's pipeline
POST   /api/pipeline                    # Add deal to pipeline
PATCH  /api/pipeline/:id/stage          # Update stage
POST   /api/pipeline/:id/close          # Mark as closed
POST   /api/pipeline/:id/to-portfolio   # Move to portfolio
GET    /api/pipeline/stats              # Pipeline statistics
```

### Portfolio API

```
GET    /api/portfolio                   # Get user's portfolio
POST   /api/portfolio                   # Add property
PATCH  /api/portfolio/:id               # Update property
POST   /api/portfolio/:id/valuation     # Update valuation
GET    /api/portfolio/summary           # Portfolio summary
GET    /api/portfolio/performance       # Performance metrics
```

### Webhooks API

```
POST   /api/webhooks/docuseal           # DocuSeal e-signature events
POST   /api/webhooks/generic            # Generic webhook receiver
```

### Compliance API

```
# Rules Management
GET    /api/compliance/rules            # List all compliance rules
POST   /api/compliance/rules            # Create new rule
PUT    /api/compliance/rules/:id        # Update rule
DELETE /api/compliance/rules/:id        # Delete rule
GET    /api/compliance/rules/:id/test   # Test rule against existing properties

# Compliance Checks
POST   /api/compliance/check/:propertyId      # Check property compliance
POST   /api/compliance/bulk-check             # Bulk check multiple properties
GET    /api/compliance/dashboard              # Dashboard statistics

# AI Generation
POST   /api/compliance/rules/generate         # AI-generate rules from description

# State Knowledge Base
GET    /api/compliance/knowledge              # List knowledge entries
POST   /api/compliance/knowledge              # Add knowledge entry
PUT    /api/compliance/knowledge/:id          # Update entry
DELETE /api/compliance/knowledge/:id          # Delete entry

# Document Templates
GET    /api/compliance/templates              # List document templates
POST   /api/compliance/templates              # Create template
PUT    /api/compliance/templates/:id          # Update template
DELETE /api/compliance/templates/:id          # Delete template
```

### Payment API (Stripe Integration)

```
# Payment Intents
POST   /api/payments/create-intent/proxypics     # Create payment intent for photo orders
Request: { propertyId: string, templateTokens: string[] }
Response: { clientSecret: string, amount: number, currency: string }

# Order Processing
POST   /api/payments/confirm-and-order/proxypics # Confirm payment and place order
Request: { paymentIntentId: string }
Response: { ordersPlaced: number, order: ProxyPicsOrder }

# Refunds
POST   /api/payments/refund/:paymentIntentId     # Create refund
Request: { reason?: string }
Response: { refundId: string, amount: number, status: string }

# Admin Management
GET    /api/payments/orders/proxypics            # List all ProxyPics orders (admin)
Response: { data: Order[], count: number }

# Webhooks (No Authentication)
POST   /api/payments/webhook                     # Stripe webhook events
Headers: { stripe-signature: string }
```

**Payment Flow:**
```
1. Create Intent → 2. User Pays → 3. Confirm & Order → 4. Property Updated
```

**Template Pricing:**
| Template | Price |
|----------|-------|
| exterior-standard | $15.00 |
| full-property | $35.00 |
| drive-by | $10.00 |
| default | $20.00 |

## Database Schema

### Core Models (70+ Tables)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE MODELS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Property (90+ fields)                                                       │
│  ├── Address, location, geo-coordinates                                      │
│  ├── Physical: beds, baths, sqft, lot, year built                           │
│  ├── Financial: price, ARV, rehab cost, equity                              │
│  ├── Condition: roof, HVAC, plumbing, electrical                            │
│  └── Status: listing status, days on market                                 │
│                                                                              │
│  MarketplaceUser                                                             │
│  ├── Profile: email, name, company, role                                    │
│  ├── Preferences: notification settings                                      │
│  └── Stats: views, likes, passes, offers, accepted                          │
│                                                                              │
│  UserBuyBox                                                                  │
│  ├── Geographic: states, cities, zip codes                                  │
│  ├── Price: min/max price, ARV, equity                                      │
│  ├── Property: types, beds, baths, sqft, year                               │
│  └── Features: pool, garage, HOA requirements                               │
│                                                                              │
│  DealAction (ML Training Data)                                               │
│  ├── Action: view, like, pass, save, share, offer                           │
│  ├── Feedback: pass reason, custom reason                                    │
│  ├── Engagement: view duration, position in feed                            │
│  └── Snapshot: deal data at time of action                                  │
│                                                                              │
│  DealOffer                                                                   │
│  ├── Terms: amount, earnest money, closing days                             │
│  ├── Finance: type (cash/hard money), proof of funds                        │
│  ├── Status: pending → viewed → countered → accepted/rejected               │
│  └── Counter: counter amount, notes                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMPLIANCE MODELS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ComplianceCheck                  Compliance check results                  │
│  ComplianceEvent                  Compliance event stream                   │
│  ComplianceAlert                  Active compliance alerts                  │
│  ComplianceAuditLog               SOC 2 audit trail                         │
│  ComplianceRuleVersion            Rule versioning                           │
│  ComplianceWebhook                Webhook configurations                    │
│  ComplianceIssueReview            Issue review workflow                     │
│  ComplianceExtractionProfile      OCR extraction profiles                   │
│  FraudSignal                      Detected fraud indicators                 │
│  SanctionsScreening               OFAC/sanctions checks                     │
│  EscalationPolicy                 Alert escalation rules                    │
│  StateComplianceRule              State-specific rules                      │
│  StateDocumentTemplate            State document requirements               │
│  StateKnowledge                   State-specific knowledge                  │
│  PropertyFieldQuality             Field quality tracking                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMMUNICATION & COLLABORATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TeamConversation                 Team chat conversations                   │
│  TeamMessage                      Chat messages                             │
│  Contact                          General contacts                          │
│  Email                            Email messages                            │
│  UserEmailConfig                  User email configurations                 │
│  GuestSession                     Public chat guest sessions                │
│  PropertyInquiry                  Property inquiries                        │
│  DealCommunication               Deal communication history                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         TRANSACTION MODELS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DealPipeline                     Pipeline stage tracking                   │
│  DealMatch                        Deal-buybox matches                       │
│  DealFeeTracking                  Fee tracking                              │
│  DealBrokerMSA                    Broker MSA assignments                    │
│  DealSource                       Deal source tracking                      │
│  Portfolio                        Owned properties                          │
│  DocuSealSubmission               E-signature tracking                      │
│  PropertyDocument                 Document storage                          │
│  PropertyLookup                   Property lookup cache                     │
│  PropertyContact                  Property contact info                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           ML & AI MODELS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FundFeedback                     Outcome feedback for training             │
│  MLPrediction                     Prediction logs                           │
│  ModelVersion                     ML model versioning                       │
│  TrainingRun                      Training job tracking                     │
│  AgentMetric                      Agent performance metrics                 │
│  InvestorAction                   Investor activity tracking                │
│  ConversationHistory              Chat history                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROKER & USER MODELS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BrokerProfile                    Broker information                        │
│  BrokerAssistant                  Broker assistant relationships            │
│  TransactionCoordinator           Transaction coordination                  │
│  Fund                             Hedge fund organizations                  │
│  HedgeFundBuyBox                  Institutional fund criteria               │
│  Buyer                            Buyer entities                            │
│  BuyerContact                     Buyer contact information                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          AUTOMATION MODELS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Automation                       Automation rules                          │
│  AutomationExecution              Automation execution logs                 │
│  WorkflowExecution                Workflow state                            │
│  FollowUpChain                    Follow-up management                      │
│  FollowUpExecution                Follow-up execution logs                  │
│  DeadLetterQueue                  Failed automation retries                 │
│  EmailInbox                       Email source configurations               │
│  Settings                         System settings                           │
│  ScheduledTask                    Scheduled background tasks                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       TASK & ACTIVITY MODELS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task                             Task management & assignment              │
│  Reminder                         Scheduled reminders                       │
│  ActivityFeed                     Platform activity timeline                │
│  Conversation                     Chat conversations                        │
│  HumanApprovalRequest             Workflow approval requests                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        PERMISSION & AUDIT MODELS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Role                             User roles                                │
│  Permission                       Granular permissions                      │
│  UserRole                         User-role assignments                     │
│  ComplianceAuditLog               SOC 2 audit trail                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         WEBHOOK & INTEGRATION MODELS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Webhook                          Webhook configurations                    │
│  ComplianceWorkflow               Compliance workflow definitions           │
│  ComplianceReport                 Generated compliance reports              │
│  ComplianceReportSchedule         Scheduled report generation               │
│  CalendarConnection               Calendar integrations                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Model Relationships

```
MarketplaceUser
    │
    ├──< UserBuyBox      (one-to-many)
    ├──< DealAction      (one-to-many)
    └──< DealOffer       (one-to-many)

DealAction
    ├──> MarketplaceUser (belongs-to)
    ├──> DealOffer       (optional)
    └──> Property        (optional)
```

## ML Prediction System

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ML PREDICTION PIPELINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. DATA COLLECTION                                                         │
│      Every swipe records:                                                    │
│      • Action (like/pass)                                                    │
│      • View duration (milliseconds)                                          │
│      • Pass reason (if applicable)                                           │
│      • Deal snapshot (price, state, type, etc.)                              │
│                                                                              │
│   2. BEHAVIOR PROFILE                                                        │
│      Computed from user history:                                             │
│      • avgLikedPrice / avgPassedPrice                                        │
│      • Preferred states, property types                                      │
│      • Top pass reasons                                                      │
│      • Like rate, offer rate                                                 │
│      • avgViewDurationLiked / avgViewDurationPassed                          │
│                                                                              │
│   3. PREDICTION SCORING                                                      │
│      For each deal:                                                          │
│      ┌────────────────────────────────────────────────────────────────┐     │
│      │  Base Score: 50 (neutral)                                       │     │
│      │                                                                 │     │
│      │  POSITIVE FACTORS                    NEGATIVE FACTORS          │     │
│      │  ───────────────────                 ─────────────────          │     │
│      │  +15 Price in range                  -10 Price too high         │     │
│      │  +10 Preferred state                 -8  Quick-dismiss state    │     │
│      │  +10 Preferred type                  -6  Quick-dismiss type     │     │
│      │  +8  Similar to "almost liked"       -15 Matches pass pattern   │     │
│      │  +7  Better than passed deals                                   │     │
│      └────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│   4. "ALMOST LIKED" DETECTION                                                │
│      Deals where user:                                                       │
│      • Viewed 70%+ of their average like duration                           │
│      • But ultimately passed                                                 │
│      • These are high-signal for preferences                                 │
│                                                                              │
│   5. QUICK-DISMISS PATTERNS                                                  │
│      Deals user views < 5 seconds then passes                               │
│      → Learn what to avoid showing                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prediction Output

```json
{
  "predictedAction": "like",
  "confidence": 78,
  "factors": [
    { "factor": "Price in preferred range", "impact": "positive", "weight": 15 },
    { "factor": "Similar to deals you carefully considered", "impact": "positive", "weight": 8 },
    { "factor": "Previously liked TX properties", "impact": "positive", "weight": 10 }
  ]
}
```

## Buy Box Matching System

### Overview

The buy box matching system uses a multi-layer scoring approach:

1. **Hard Requirements** - Configurable deal-breakers that exclude properties entirely
2. **Weighted Scoring** - Soft preferences that affect the match score (0-100)
3. **Behavior Learning** - Learns from investor actions to optimize weights
4. **Probability Predictions** - Twitter-inspired engagement probabilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BUY BOX MATCHING PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Property ──▶ Hard Requirements ──▶ Weighted Scoring ──▶ Probabilities     │
│                      │                     │                    │            │
│                      ▼                     ▼                    ▼            │
│                  EXCLUDED              SCORE: 85           probClose: 12%    │
│                  (if fail)            matchType: strong    probBid: 35%      │
│                                                            probSave: 58%     │
│                                                            probPass: 22%     │
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                    BEHAVIOR LEARNING LOOP                           │    │
│   │                                                                     │    │
│   │   Investor Actions ──▶ Pattern Analysis ──▶ Weight Optimization    │    │
│   │   (viewed, bid, closed, passed)                                     │    │
│   │                                                                     │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hard Requirements (Configurable Deal-Breakers)

Configure which criteria are absolute deal-breakers vs soft preferences:

```json
{
  "hardRequirements": {
    "state": true,              // Wrong state = excluded (recommended)
    "maxPrice": true,           // Over budget = excluded
    "propertyType": false,      // Wrong type = reduced score only
    "minBedrooms": false,       // Too few bedrooms = reduced score only
    "allowFloodZone": false,    // In flood zone = reduced score only
    "allowStructuralIssues": true  // Structural issues = excluded
  }
}
```

**Available Hard Requirements:**
| Category | Options |
|----------|---------|
| Geographic | `state`, `county`, `city`, `zipCode` |
| Financial | `maxPrice`, `minPrice` |
| Property | `propertyType`, `minBedrooms`, `maxBedrooms`, `minBathrooms`, `maxBathrooms`, `minSqft`, `maxSqft`, `minYearBuilt`, `maxYearBuilt` |
| Risk Factors | `allowHoa`, `allowPool`, `allowSeptic`, `allowWell`, `allowFloodZone`, `allowStructuralIssues`, `allowFoundationIssues`, `allowFireDamage` |
| Occupancy | `occupancyStatus` |

### Behavior-Based Learning

Track investor actions to learn what criteria actually matter for deal success:

```bash
# Record investor action
POST /api/ai/buybox/action
{
  "investorId": "fund-blackstone-001",
  "investorType": "fund",
  "buyBoxId": "bb-blackstone-sfr",
  "propertyId": "prop-tx-dallas-205",
  "action": "closed",
  "metadata": { "closingPrice": 182000 }
}
```

**Action Types:**
| Action | Outcome | Description |
|--------|---------|-------------|
| `viewed` | positive | Investor looked at property |
| `saved` | positive | Investor bookmarked |
| `requested_info` | positive | Investor requested more info |
| `bid` | positive | Investor placed a bid |
| `offer_accepted` | positive | Offer was accepted |
| `closed` | positive | Deal closed successfully |
| `passed` | negative | Investor explicitly passed |
| `rejected` | negative | Investor rejected after review |
| `expired` | neutral | Deal expired without action |
| `lost_to_competitor` | neutral | Lost to another buyer |

**Learning Insights:**
```bash
GET /api/ai/buybox/{buyBoxId}/insights
```
Returns:
```json
{
  "buyBoxId": "bb-blackstone-sfr",
  "totalActions": 127,
  "conversionFunnel": {
    "viewed": 100,
    "saved": 45,
    "bid": 12,
    "closed": 5
  },
  "successRate": 0.05,
  "patterns": {
    "closedProperties": {
      "avgArvSpread": 0.28,
      "commonTraits": ["vacant", "no_hoa", "sfr"]
    },
    "passedProperties": {
      "commonTraits": ["has_hoa", "occupied"]
    }
  },
  "weightRecommendations": {
    "noHoaMatch": { "increase": true, "reason": "90% of closed deals had no HOA" }
  }
}
```

**Apply Learned Weights:**
```bash
POST /api/ai/buybox/{buyBoxId}/learn
{
  "apply": true
}
```

### Twitter-Inspired Probability Scoring

Instead of arbitrary scores (85 points), get calibrated probability predictions:

```json
{
  "fundName": "Blackstone Residential",
  "score": 85,
  "matchType": "strong",
  "engagement": {
    "probClose": 0.12,
    "probBid": 0.35,
    "probSave": 0.58,
    "probPass": 0.22,
    "confidence": 0.75,
    "modelVersion": "1.0.0",
    "factors": [
      {
        "name": "price_alignment",
        "contribution": 0.35,
        "description": "Price $185,000 is well within budget"
      },
      {
        "name": "state_match",
        "contribution": 0.30,
        "description": "Property in target state: TX"
      },
      {
        "name": "arv_spread",
        "contribution": 0.25,
        "description": "Strong ARV spread: 28%"
      },
      {
        "name": "vacancy",
        "contribution": 0.12,
        "description": "Property is vacant as preferred"
      }
    ]
  }
}
```

**How Probabilities Are Calculated:**
1. **Base Rates**: Historical action rates from investor behavior
2. **Feature Extraction**: Property and criteria comparison
3. **Logistic Regression**: Convert features to log-odds, then probabilities
4. **Calibration**: Blend with raw scores for stability
5. **Confidence**: Based on historical data availability

### Example: Complete Investor Workflow

```bash
# 1. Create a buy box with hard requirements
POST /api/fastbuybox
{
  "name": "Texas SFR Portfolio",
  "fundName": "ABC Capital",
  "states": ["TX"],
  "minPrice": 100000,
  "maxPrice": 300000,
  "propertyTypes": ["single_family"],
  "allowHoa": false,
  "hardRequirements": {
    "state": true,
    "maxPrice": true,
    "propertyType": true,
    "allowHoa": false
  }
}

# 2. Match a property to buy boxes
POST /api/ai/buybox/match/prop-tx-austin-101
# Returns matches with scores AND probability predictions

# 3. Record investor actions over time
POST /api/ai/buybox/action
{
  "investorId": "fund-abc-001",
  "buyBoxId": "bb-abc-texas",
  "propertyId": "prop-tx-austin-101",
  "action": "viewed"
}

POST /api/ai/buybox/action
{
  "investorId": "fund-abc-001",
  "buyBoxId": "bb-abc-texas",
  "propertyId": "prop-tx-austin-101",
  "action": "bid",
  "metadata": { "bidAmount": 175000 }
}

POST /api/ai/buybox/action
{
  "investorId": "fund-abc-001",
  "buyBoxId": "bb-abc-texas",
  "propertyId": "prop-tx-austin-101",
  "action": "closed",
  "metadata": { "closingPrice": 172000 }
}

# 4. Get learning insights
GET /api/ai/buybox/bb-abc-texas/insights

# 5. Learn and apply optimized weights
POST /api/ai/buybox/bb-abc-texas/learn
{
  "apply": true
}
```

### Buy Box API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/buybox/match/:propertyId` | POST | Match property to all active buy boxes |
| `/api/ai/buybox/list` | GET | List all active buy boxes |
| `/api/ai/buybox/create` | POST | Create new buy box |
| `/api/ai/buybox/:id` | PUT | Update buy box |
| `/api/ai/buybox/:id` | DELETE | Deactivate buy box |
| `/api/ai/buybox/action` | POST | Record investor action |
| `/api/ai/buybox/:id/insights` | GET | Get learning insights |
| `/api/ai/buybox/:id/learn` | POST | Learn and apply weights |
| `/api/ai/buybox/:id/actions` | GET | Get action history |

---

## Workflow Engine

### Built-in Workflow Templates

| Template | Description |
|----------|-------------|
| `template-standard` | Full review workflow with scoring and human approval |
| `template-fasttrack` | Streamlined for pre-approved wholesalers |
| `template-highvalue` | Comprehensive review for deals > $500k |
| `template-marketplace` | Distribution to swipe-based marketplace |

### Marketplace Distribution Workflow

```
Start → Enrich → Compliance → Match Buyers → Publish → Notify → Monitor → Process Offers
                    │                                              │
                    ▼                                              ▼
              Human Review                                   Boost Deal
              (if red status)                               (if no offers)
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Docker (optional)

### Development Setup

```bash
# Clone repository
git clone https://github.com/your-repo/dispotree.git
cd dispotree

# Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run dev

# Frontend setup (new terminal)
cd frontend
npm install
npm start
```

### Docker Setup

```bash
# Copy environment file
cp .env.example .env

# Start all services
docker-compose up -d

# Access:
# - Frontend: http://localhost:3000
# - Backend API: http://localhost:3001
# - API Docs: http://localhost:3001/api-docs
# - Adminer: http://localhost:8080
```

### Test ML Predictions

```bash
cd backend
npm run test:ml
```

## Development Commands

### Backend Commands

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

### Frontend Commands

```bash
cd frontend
npm install              # Install dependencies
npm run dev              # Start dev server (port 3000)
npm run build            # Build for production
npm run lint             # Run ESLint
npm start                # Start production server
```

## Environment Variables

### Required Variables

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
JWT_SECRET=your_jwt_secret_here
```

### Optional Variables (Enable Features)

```bash
# AI/ML
OPENAI_API_KEY=sk-...              # AI agents + embeddings
OPENROUTER_API_KEY=...             # Alternative LLM provider
AGENT_MODEL=gpt-4o                 # Default agent model

# Cache
REDIS_URL=redis://localhost:6379   # Falls back to in-memory

# Market Data
RAPIDAPI_KEY=...                   # Zillow enrichment

# Knowledge Base (RAG)
PINECONE_API_KEY=...               # RAG vector storage
PINECONE_ENVIRONMENT=...           # Pinecone environment
PINECONE_INDEX_NAME=...            # Index name
KNOWLEDGE_FOLDER=./knowledge       # Document watch folder

# Email
RESEND_API_KEY=...                 # Email sending
IMAP_HOST=imap.gmail.com           # Email receiving
IMAP_PORT=993
SMTP_HOST=smtp.gmail.com           # Email sending
SMTP_PORT=587

# Integrations
DOCUSEAL_API_KEY=...               # E-signatures
DOCUSEAL_API_URL=https://api.docuseal.com
DOCUSEAL_WEBHOOK_SECRET=...        # Webhook verification
TWILIO_SID=...                     # SMS
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...

# Stripe Payment Processing
STRIPE_SECRET_KEY=sk_test_...      # Backend: Stripe secret key for payments
STRIPE_WEBHOOK_SECRET=whsec_...    # Backend: Webhook signature verification
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...  # Frontend: Stripe publishable key

# ProxyPics Photo Services
PROXYPICS_API_KEY=...              # Professional photo ordering
PROXYPICS_API_URL=https://api.proxypics.com

# Supabase (Realtime)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...

# Browser Automation
BROWSER_AUTOMATION_ENABLED=true    # Enable Playwright
```

## Testing

### Test Structure

```
backend/src/tests/
├── unit/                          # Unit tests
│   ├── ComplianceService.test.ts
│   ├── FraudDetectionService.test.ts
│   └── MarketplaceService.test.ts
├── integration/                   # Integration tests
│   ├── api/
│   └── workflows/
└── ml/                            # ML tests (separate)
```

### Running Tests

```bash
# All tests with coverage
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# ML tests (uses real database)
npm run test:ml

# Watch mode
npm test -- --watch

# Specific test file
npm test -- ComplianceService.test.ts
```

### Test Configuration

- **Framework**: Jest
- **Coverage**: Istanbul
- **Mocking**: jest.mock() for services, chokidar auto-mocked
- **Database**: In-memory SQLite for unit tests, PostgreSQL for integration tests

## API Documentation

Interactive API documentation available at:
```
http://localhost:3001/api-docs
```

Includes 14 schema definitions:
- Property, MarketplaceUser, UserBuyBox
- DealOffer, DealAction
- UserBehaviorProfile, DealPrediction
- SwipeRequest, FeedResponse, DealAnalytics
- PassReason, Error, HealthCheck

---

# Developer Glossary

## 1. Wholesaler (The Seller)

A wholesaler submits deals into DispoTree. They put properties under contract with homeowners and sell the contract rights to investor buyers.

**What they provide:**
- Property details (beds, baths, sqft, year built)
- Photos, videos, condition information
- Seller situation (motivation, timeline, condition)

## 2. Deal

The core data unit representing a property submission. Contains:
- Property characteristics
- Condition details
- Pricing (asking price, ARV, rehab cost)
- Seller situation
- Contract details

## 3. Buy Box

A detailed "shopping list" defining what an investor wants to buy:
- Location (states, cities, zips)
- Price range, equity requirements
- Property type, size, age
- Condition preferences
- Return expectations

## 4. ARV (After Repair Value)

Estimated market value of the property after full renovation. Used for:
- Calculating potential profit
- Fund matching
- Pricing recommendations

## 5. Rehab Budget

Estimated cost to repair/renovate, including:
- Roof, HVAC, plumbing, electrical
- Kitchen, bathrooms, flooring
- Foundation repairs

## 6. Daisy Chain (Avoid)

When a wholesaler submits another wholesaler's deal without direct control. Causes:
- Inaccurate information
- Contract conflicts
- Trust issues with marketplaces

**Prevention:** Enforce direct-to-seller requirements, detect duplicates.

## 7. Auction Marketplaces

- **Hubzu**: 2M+ users, owned by Altisource
- **Xome**: 1M+ users, owned by Rocket Mortgage

## 8. Institutional Funds / Hedge Funds

Companies buying homes in high volume with cash. They provide buy box criteria for automated deal matching.

---

## Dashboard Sections

The platform includes 24 comprehensive dashboard sections:

| Section | Route | Description |
|---------|-------|-------------|
| **Dashboard** | `/dashboard` | Main overview with metrics, recent activity, analytics |
| **Deals** | `/deals` | Deal management with map view, filtering, inline editing |
| **Pipeline** | `/pipeline` | 7-stage deal pipeline with drag-and-drop |
| **Marketplace** | `/marketplace` | Swipe-based deal feed with ML predictions |
| **Buy Boxes** | `/buyboxes` | Investment criteria management |
| **Buyers** | `/buyers` | Buyer management and profiles |
| **Buyer Chat** | `/buyer-chat` | Dedicated buyer communication interface |
| **AI Agent Chat** | `/chat` | Conversational AI with 65+ tools |
| **Compliance** | `/compliance` | Compliance dashboard, rules, fraud detection |
| **Contacts** | `/contacts` | Contact management with linking |
| **Email** | `/email` | Full email client with IMAP/SMTP integration |
| **Inquiries** | `/inquiries` | Property inquiry tracking |
| **Import** | `/import` | Bulk data import from CSV, APIs |
| **Knowledge Base** | `/knowledge` | RAG document management |
| **ML Training** | `/ml-training` | ML model training and evaluation |
| **New Deal** | `/newdeal` | Quick deal entry form |
| **Profile** | `/profile` | User profile and preferences |
| **Scoring** | `/scoring` | Deal scoring configuration |
| **Settings** | `/settings` | System settings, theme, integrations |
| **Activity Feed** | `/activity-feed` | Real-time platform activity timeline |
| **Tasks** | `/tasks` | Task management with kanban and list views |
| **Reminders** | `/reminders` | Reminder scheduling and management |
| **Audit Logs** | `/audit-logs` | SOC 2 compliant audit log viewer |
| **Calls** | `/calls` | Voice calling interface (Beta) |

## Plugin System Architecture

DispoTree features an extensible plugin system for customization:

### Plugin Types

```typescript
// Deal Source Plugins
interface IDealSourcePlugin {
  name: string;
  version: string;
  initialize(): Promise<void>;
  ingestDeals(): Promise<Property[]>;
  getConfig(): Record<string, any>;
}

// Scoring Plugins
interface IScoringPlugin {
  name: string;
  score(property: Property, criteria: any): number;
  explain(property: Property): string[];
}

// Automation Actions
interface IAutomationAction {
  type: string;
  execute(context: AutomationContext): Promise<void>;
  validate(config: any): boolean;
}
```

### Built-in Plugins

| Plugin Type | Name | Description |
|-------------|------|-------------|
| **Deal Sources** | CSV Upload | Import from CSV files |
| | API Source | RESTful API ingestion |
| | Email Parser | Parse deals from emails |
| | Webhook Receiver | Real-time webhooks |
| | Manual Entry | Dashboard forms |
| **Scoring** | Buy Box Matcher | Score against investment criteria |
| | ML Predictor | ML-based scoring |
| | Custom Rules | User-defined rule engine |
| **Automation** | DocuSeal | Send e-signature contracts |
| | Email Notify | Send email notifications |
| | SMS Notify | Send SMS via Twilio |
| | Webhook Call | HTTP webhook calls |
| | Pipeline Move | Auto-move deals in pipeline |
| **AI Services** | Compliance Agent | Contract analysis |
| | Buy Box Agent | Matching optimization |
| | Guardrail Agent | Content moderation |

### Creating Custom Plugins

```typescript
// Example: Custom deal source plugin
import { BaseDealSourcePlugin } from './plugins/types';

export class MyCustomSource extends BaseDealSourcePlugin {
  name = 'my-custom-source';
  version = '1.0.0';

  async initialize(): Promise<void> {
    // Setup logic
  }

  async ingestDeals(): Promise<Property[]> {
    // Fetch deals from your source
    const deals = await this.fetchFromSource();
    return deals.map(this.transformToProperty);
  }
}

// Register plugin
import { pluginRegistry } from './plugins/registry';
pluginRegistry.registerSource(new MyCustomSource());
```

## OpenAI-Compatible API

The `/v1` endpoint provides OpenAI API compatibility for external tools:

### Purpose
- Allow external tools (like Continue, Cursor, etc.) to use DispoTree's AI capabilities
- Provide familiar OpenAI API interface
- Enable custom integrations with standard tooling

### Endpoints

```bash
# Chat completions
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN

{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "Analyze property at 123 Main St"}
  ]
}

# List models
GET /v1/models

# Model details
GET /v1/models/gpt-4o
```

### Use Cases
- IDE integrations (VS Code, Cursor)
- Custom scripts and automation
- Third-party AI tools
- Testing and development

---

## User Workflows & Roles

DispoTree supports 9 user roles with distinct workflows and permissions:

### Role Overview

| Role | Description | Key Capabilities |
|------|-------------|------------------|
| **buyer** | Individual property purchasers | Browse marketplace, submit offers, manage buy boxes |
| **investor** | Institutional buyers (funds) | Same as buyer + fund-level buy boxes, bulk operations |
| **wholesaler** | Deal submitters | Submit deals, manage listings, track approvals |
| **agent** | Real estate agents | Represent buyers/sellers, access transaction tools |
| **broker** | Licensed real estate brokers | Approve deals, compliance oversight, manage agents |
| **broker_assistant** | Broker support staff | Help with approvals under broker supervision |
| **transaction_coordinator** | Transaction management | Manage contracts, coordinate closings |
| **admin** | Platform administrators | Full system access, user management |
| **super_admin** | Super administrators | All admin rights + system configuration |

### Deal Approval Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEAL APPROVAL WORKFLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   WHOLESALER                    SYSTEM                      BROKER          │
│   ──────────                    ──────                      ──────          │
│                                                                              │
│   Submit Deal ──────────▶ Compliance Check                                  │
│                                   │                                          │
│                          ┌────────┴────────┐                                │
│                          ▼                 ▼                                │
│                        GREEN            YELLOW/RED                          │
│                          │                 │                                │
│                          ▼                 ▼                                │
│                   Auto-queue for      Stay in Draft                         │
│                   Broker Approval     (fix issues)                          │
│                          │                                                   │
│                          ▼                                                   │
│                   ┌─────────────────────────────┐                           │
│                   │   BROKER REVIEW QUEUE       │                           │
│                   └─────────────────────────────┘                           │
│                          │                                                   │
│                 ┌────────┼────────┐                                         │
│                 ▼        ▼        ▼                                         │
│             APPROVE   REJECT   REQUEST                                      │
│                │        │      CHANGES                                      │
│                ▼        ▼        │                                          │
│              LIVE    Rejected    │                                          │
│          (Marketplace) (Closed)  │                                          │
│                                  ▼                                          │
│   ◀──────────────────── Back to Draft                                       │
│   (Fix & Resubmit)                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workflow by Role

#### Buyer / Investor Workflow
```
1. Register & Verify ──▶ 2. Create Buy Box ──▶ 3. Browse Marketplace
                                                        │
                              ┌─────────────────────────┘
                              ▼
                    4. Swipe (Like/Pass) ──▶ 5. Submit Offer
                                                    │
                                    ┌───────────────┴───────────────┐
                                    ▼                               ▼
                            Offer Accepted                    Offer Rejected
                                    │                          (Continue
                                    ▼                           browsing)
                         6. Contract Sent ──▶ 7. Sign ──▶ 8. Close
```

**Key Actions:**
- Create/manage buy boxes (investment criteria)
- Browse personalized deal feed
- Like/pass deals with feedback
- Submit offers with proof of funds
- Negotiate counter-offers
- Sign contracts via DocuSeal
- Track deals in pipeline

#### Wholesaler Workflow
```
1. Submit Deal ──▶ 2. Auto Compliance Check ──▶ 3. Wait for Approval
       │                    │                            │
       ▼                    ▼                            ▼
   Add details         GREEN: Queue           Broker Approves/Rejects
   Upload docs         for approval                      │
                       YELLOW/RED:            ┌──────────┴──────────┐
                       Fix issues             ▼                     ▼
                                         APPROVED ──▶ LIVE    Request Changes
                                                                    │
                                                                    ▼
                                                              Fix & Resubmit
```

**Key Actions:**
- Submit deals with property details
- Upload photos, documents, contracts
- Fix compliance issues
- Respond to broker change requests
- Track deal status and approval history
- View marketplace activity on their deals

#### Broker Workflow
```
1. View Approval Queue ──▶ 2. Review Deal Details ──▶ 3. Take Action
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
                APPROVE         REJECT        REQUEST CHANGES
                    │               │               │
                    ▼               ▼               ▼
              Deal goes         Close deal      Send back to
               LIVE             with reason      wholesaler
```

**Key Actions:**
- Review pending deal approvals
- Verify compliance with state regulations
- Approve deals (auto-goes live)
- Reject with documented reasons
- Request specific changes before approval
- View approval statistics and history
- Manage assigned deals by state

#### Admin Workflow
```
Full platform access:
├── User Management (create, edit, suspend users)
├── System Configuration (settings, integrations)
├── Compliance Rules (create, edit state rules)
├── Analytics Dashboard (platform-wide metrics)
├── Knowledge Base (manage documents)
└── Automation Rules (configure triggers)
```

### Broker Approval API

```
# Get pending approvals for broker
GET /api/broker/approvals

# Get approval statistics
GET /api/broker/approvals/stats
Response: { pending, approvedThisWeek, rejectedThisWeek, avgApprovalTimeHours }

# Approve deal (auto-goes live)
PUT /api/broker/approvals/:propertyId/approve
Body: { notes?: string }

# Reject deal
PUT /api/broker/approvals/:propertyId/reject
Body: { reason: string }

# Request changes
PUT /api/broker/approvals/:propertyId/request-changes
Body: { changes: string }

# Get approval history/audit trail
GET /api/broker/approvals/:propertyId/history
```

### Deal Status Flow

| Status | Description | Visible in Marketplace |
|--------|-------------|------------------------|
| `draft` | Initial state, being edited | No |
| `pending_broker_approval` | Compliance passed, awaiting broker | No |
| `approved` | Broker approved (transitions immediately to live) | No |
| `rejected` | Broker rejected with reason | No |
| `live` | Active in marketplace | **Yes** |

### Permissions Matrix

| Action | buyer | investor | wholesaler | broker | admin |
|--------|-------|----------|------------|--------|-------|
| Browse marketplace | ✓ | ✓ | ✗ | ✓ | ✓ |
| Submit offers | ✓ | ✓ | ✗ | ✗ | ✓ |
| Create buy box | ✓ | ✓ | ✗ | ✗ | ✓ |
| Submit deals | ✗ | ✗ | ✓ | ✗ | ✓ |
| Approve deals | ✗ | ✗ | ✗ | ✓ | ✓ |
| Reject deals | ✗ | ✗ | ✗ | ✓ | ✓ |
| Manage compliance rules | ✗ | ✗ | ✗ | ✗ | ✓ |
| Manage users | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## License

[Add license information]
