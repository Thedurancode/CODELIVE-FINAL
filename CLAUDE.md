# CLAUDE.md - AI Assistant Guidelines for CodeLive

This document provides guidance for AI assistants working with the CodeLive codebase.

## Project Overview

CodeLive is an **AI-powered development platform** for software teams. It combines project management, AI coding agents (Sprites), GitHub integration, real-time collaboration, and TV display dashboards into a unified developer operating system.

### Core Capabilities
- **Project Management**: Full lifecycle tracking with GitHub bidirectional sync, Vercel/Fly.io deployment integration, brand assets, and client portals
- **Sprite System**: Claude Code agents running in isolated containers with terminal access, file browsers, task queues, and MCP server integration
- **AI Agent Chat**: 65+ tools for project analysis, code tasks, knowledge search, and workflow automation
- **Real-time Collaboration**: Team chat, email client, calendar, meetings with video rooms, audio notes with Whisper transcription
- **TV Display Ecosystem**: Native Roku and Fire TV apps plus web-based TV displays for office dashboards showing project status, AI activity, and news feeds
- **Client Portal**: External-facing portal for clients to view project progress, issues, PRs, and commits
- **Document & Contract Management**: DocuSeal e-signatures, signature capture, unified document system

> **Note**: This codebase evolved from "Dispotree" (a real estate wholesale platform). Some legacy models, routes, and services from that era remain in the codebase but are not the primary focus of active development.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL with Sequelize ORM |
| Auth | Supabase Auth + JWT |
| Cache | Redis (with in-memory fallback) |
| Vector DB | Pinecone (RAG & memory) |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| AI/LLM | OpenRouter, OpenAI, LangChain |
| State | TanStack React Query 5, Zustand 5 |
| E-Signature | DocuSeal |
| Forms | react-hook-form, Zod 4 |
| Real-time | Supabase Realtime, WebSockets |
| Cloud | Fly.io, Vercel |
| File Storage | Wasabi (S3-compatible), Supabase Storage |
| Video | Remotion (video generation) |
| Terminal | @xterm/xterm |

## Repository Structure

```
CodeLive/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── config/            # Database, Swagger, Supabase config
│   │   ├── controllers/       # API request handlers (39 files)
│   │   ├── middleware/        # Auth, CORS, permissions, upload, error handling
│   │   ├── models/            # Sequelize database models (123 models)
│   │   ├── plugins/           # Extensible plugin system
│   │   │   ├── ai/           # AI analysis services
│   │   │   ├── automation/   # Event-driven automation engine
│   │   │   ├── browser/      # Playwright browser automation
│   │   │   ├── ml/           # TensorFlow.js ML services
│   │   │   ├── scoring/      # Scoring engine
│   │   │   ├── sources/      # Deal source plugins (CSV, API, Email, etc.)
│   │   │   ├── workflow/     # Workflow orchestration
│   │   │   └── registry/     # Plugin registry
│   │   ├── routes/            # API route definitions (80 route files)
│   │   ├── services/          # Business logic services (149+ files)
│   │   │   ├── agent/        # Agent-specific services (22 files)
│   │   │   ├── knowledge/    # RAG knowledge base service
│   │   │   ├── compliance-spec/ # Compliance specification services
│   │   │   └── marketplace/  # Marketplace services
│   │   ├── tests/             # Jest test suites
│   │   │   ├── unit/         # Unit tests (33 files)
│   │   │   └── integration/  # Integration tests (11 files)
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Utility functions
│   │   ├── validation/        # Request validation schemas
│   │   ├── validators/        # Custom validators
│   │   └── voice/             # Voice calling module
│   ├── knowledge/             # Knowledge base documents
│   └── package.json
│
├── frontend/                   # Next.js 16 application
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   │   ├── (auth)/       # Auth pages (login, magic link)
│   │   │   ├── (dashboard)/  # Protected dashboard pages
│   │   │   ├── (client-portal)/ # Client-facing portal
│   │   │   ├── tv/           # TV display pages
│   │   │   ├── ipad/         # iPad remote controller
│   │   │   ├── p/[id]/       # Public project share pages
│   │   │   ├── setup/        # Organization onboarding
│   │   │   ├── signature/    # Signature capture
│   │   │   ├── upload/       # Public file upload
│   │   │   └── api/          # API route handlers
│   │   ├── components/        # React components (142 files)
│   │   │   ├── ui/           # shadcn/ui components (31)
│   │   │   ├── sprites/      # Sprite system components (36)
│   │   │   ├── projects/     # Project management components (17)
│   │   │   ├── chat/         # AI chat components (14)
│   │   │   ├── settings/     # Settings components (12)
│   │   │   ├── layout/       # Layout components (dock, header, sidebar)
│   │   │   ├── meetings/     # Meeting & video components
│   │   │   ├── tv/           # TV display components
│   │   │   └── providers/    # Context providers
│   │   ├── hooks/             # Custom React hooks (66)
│   │   ├── lib/               # Utility libraries (api.ts, auth, chat parsers)
│   │   ├── stores/            # Zustand state stores (3)
│   │   ├── types/             # TypeScript types (11 files)
│   │   ├── contexts/          # React contexts
│   │   └── remotion/          # Video composition framework
│   └── package.json
│
├── agentos/                    # Python agent system (Agno framework)
│   ├── agents/                # Knowledge + MCP agents
│   ├── app/                   # FastAPI entry point
│   ├── db/                    # PostgreSQL + pgvector
│   ├── Dockerfile
│   └── compose.yaml
│
├── roku-app/                   # Native Roku TV app (BrightScript)
│   ├── source/                # Main app logic
│   ├── components/            # Slides, controls, tasks
│   └── manifest
│
├── fire-tv-app/                # Fire TV app (Android/Kotlin WebView)
│   ├── app/src/main/          # MainActivity, BootReceiver
│   └── build.gradle
│
├── docs/                       # Project documentation (14 files)
├── ai-agent-knowledgebase/    # AI agent training resources
├── contracts/                  # Legal document templates
├── data-structure/            # Data schema documentation
├── database/                   # Database scripts
├── .github/workflows/         # GitHub Actions (7 workflows)
├── docker-compose.yaml        # Docker orchestration
├── docker-compose.prod.yml    # Production Docker config
├── fly-deploy.sh              # Fly.io deployment script
├── start.sh                   # Application startup script
└── start-local.sh             # Local development startup
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
npm run lint             # Run ESLint
npm run typecheck        # TypeScript type checking
```

### Frontend
```bash
cd frontend
npm install              # Install dependencies
npm run dev              # Start dev server (port 3000, binds 0.0.0.0)
npm run build            # Build for production
npm run lint             # Run ESLint
npm start                # Start production server
npm run remotion:studio  # Open Remotion video editor
```

### Docker
```bash
docker-compose up -d     # Start all services
# Access points:
# - Frontend: http://localhost:3000
# - Backend API: http://localhost:3001
# - API Docs: http://localhost:3001/api-docs
```

### AgentOS
```bash
cd agentos
docker compose up -d     # Start AgentOS + PostgreSQL (port 8000)
```

## Code Conventions

### Backend Patterns

**Services Architecture**: Business logic lives in `src/services/`. Services are singletons exported as instances.
```typescript
class MyService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized;
  }
}
export const myService = new MyService();
```

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

**API Client**: Centralized in `lib/api.ts` with Supabase JWT token handling, automatic 401 redirects, file upload support, and SSE streaming for AI chat.

**Components**: Use shadcn/ui components from `components/ui/`. Follow existing patterns:
- Path aliases: `@/` maps to `src/`
- Form handling: react-hook-form with zod validation
- State: Zustand for global state (`stores/`), React Query for server state
- Styling: Tailwind CSS 4 with CSS variables, dark mode via theme-provider

**App Router**: Next.js 16 App Router with route groups:
- `(auth)/` — Authentication pages
- `(dashboard)/` — Protected dashboard pages
- `(client-portal)/` — Client-facing portal pages

### TypeScript

**Backend**: Strict mode enabled, ES2022 target
- Use explicit types for function parameters and returns
- Sequelize models use class-based definitions

**Frontend**: Strict mode, bundler module resolution
- Types in `src/types/` (11 type files)
- Interface over type when possible

## Key API Endpoints

### Project Management
| Endpoint Group | Base Path | Purpose |
|----------------|-----------|---------|
| Projects | `/api/projects` | Project CRUD, filtering, statistics |
| Tasks | `/api/tasks` | Task management & assignment |
| Coding Tasks | `/api/coding-tasks` | AI coding task management |
| GitHub | `/api/github` | GitHub repo sync, issues, PRs, commits |
| GitHub Webhooks | `/api/github/webhook` | GitHub event processing |
| Deploy Hooks | `/api/deploy-hooks` | Deployment trigger management |
| Contacts | `/api/contacts` | Contact management |
| Meetings | `/api/meetings` | Meeting rooms, participants, recordings |
| Calendar | `/api/calendar` | Calendar integration |

### AI & Agents
| Endpoint Group | Base Path | Purpose |
|----------------|-----------|---------|
| Agent Chat | `/api/agent` | Conversational AI with 65+ tools |
| AI Agents | `/api/ai` | Compliance, buy box, guardrail agents |
| Sprites | `/api/sprites` | Sprite (Claude Code agent) management |
| Sprite Tasks | `/api/sprite-tasks` | Sprite task queue management |
| Sprite Chat | `/api/sprite-chat` | Chat with Sprites |
| Codelive | `/api/codelive` | Automaker integration |
| Knowledge | `/api/knowledge` | RAG document management |

### Communication & Collaboration
| Endpoint Group | Base Path | Purpose |
|----------------|-----------|---------|
| Team Chat | `/api/team-chat` | Team messaging & conversations |
| Email Client | `/api/email-client` | IMAP/SMTP email integration |
| Public Chat | `/api/public-chat` | Guest chat sessions |
| Reminders | `/api/reminders` | Reminder scheduling |
| Activity Feed | `/api/activity-feed` | Platform activity timeline |
| Push | `/api/push` | Push notification management |

### Authentication & Users
| Endpoint Group | Base Path | Purpose |
|----------------|-----------|---------|
| Auth | `/api/auth` | Supabase authentication |
| Users | `/api/users` | User management |
| Setup | `/api/setup` | Organization onboarding |
| Permissions | `/api/permissions` | Role & permission management |
| API Keys | `/api/api-keys` | API key management |

### Infrastructure & Deployment
| Endpoint Group | Base Path | Purpose |
|----------------|-----------|---------|
| Vercel | `/api/vercel` | Vercel project/domain management |
| Fly.io | `/api/fly` | Fly.io machines, domains, secrets |
| Health | `/api/health` | System health monitoring |
| Settings | `/api/settings` | System settings |
| Home Assistant | `/api/home-assistant` | Smart home integration |

### Client Portal
| Endpoint Group | Base Path | Purpose |
|----------------|-----------|---------|
| Client Portal | `/api/client-portal` | Client access to projects |
| Public API | `/api/public` | Public endpoints (no auth) |
| Signatures | `/api/signatures` | Signature capture |

### Legacy (Dispotree)
| Endpoint Group | Base Path | Purpose |
|----------------|-----------|---------|
| Properties | `/api/listings` | Property CRUD |
| Marketplace | `/api/marketplace` | Swipe-based marketplace |
| Pipeline | `/api/pipeline` | Deal pipeline tracking |
| Compliance | `/api/compliance` | Compliance system |
| Hedge Funds | `/api/hedgefunds` | Buy box management |

Interactive API docs: `http://localhost:3001/api-docs`

## Database Models

### Project Management Models
- `Project` — Projects with GitHub URL, deployment URL, status tracking, brand settings
- `ProjectContact` — Project-linked contacts
- `ProjectNote` — Project notes with rich content
- `ProjectNoteAttachment` — File attachments on notes
- `ProjectNoteAudio` — Voice recordings with Whisper transcription
- `ProjectEnvVariable` — Project environment variables
- `ProjectBrandAsset` — Logo, colors, mood keywords
- `ProjectMember` — Team member assignments
- `ProjectClient` — Client access management

### Sprite & Coding Models
- `ProjectSprite` — Claude Code agent instances
- `SpriteTask` — Tasks assigned to Sprites
- `SpriteSession` — Active Sprite sessions
- `SpriteMcpServer` — MCP server configurations
- `CodingTask` — AI coding task definitions
- `CodeliveSync` — Task-to-feature sync tracking

### Communication Models
- `TeamConversation` / `TeamMessage` — Team chat
- `Meeting` / `MeetingParticipant` / `MeetingRoom` — Video meetings
- `Email` / `UserEmailConfig` — Email client
- `Contact` / `ContactActivity` / `ContactNote` — CRM
- `Conversation` / `ConversationHistory` — AI chat history
- `GuestSession` — Public chat sessions

### User & Auth Models
- `MarketplaceUser` — Platform users
- `Organization` — Multi-tenant organizations
- `UserSession` / `MagicLinkToken` — Authentication
- `Role` / `Permission` / `UserRole` — RBAC

### Task & Activity Models
- `Task` — Task management with priorities and assignments
- `Reminder` / `ScheduledTask` — Scheduled tasks and reminders
- `ActivityFeed` — Platform activity timeline
- `HumanApprovalRequest` — Workflow approval gates

### Integration Models
- `CalendarConnection` — Calendar integrations
- `DeployHook` — Deployment trigger configs
- `Webhook` — Webhook configurations
- `ApiKey` — API key management
- `HomeAssistantConfig` — Smart home integration

### Contract & Document Models
- `DocuSealSubmission` — E-signature tracking
- `ContractSigner` / `SignatureRequest` — Signature management
- `Agreement` — Agreement tracking
- `PropertyDocument` — Document storage

### System Models
- `Settings` — System settings
- `NotificationQueue` / `PushSubscription` / `Outbox` — Notifications
- `SearchQuery` — Search analytics
- `DeadLetterQueue` — Failed automation retries

### Legacy Models (from Dispotree)
- `Property` — Real estate deals (90+ fields)
- `UserBuyBox` / `HedgeFundBuyBox` — Investment criteria
- `DealAction` / `DealOffer` / `DealPipeline` / `DealMatch` — Deal workflow
- `Fund` / `Buyer` / `BuyerContact` — Buyer management
- `ComplianceCheck` / `ComplianceAlert` / `FraudSignal` / `SanctionsScreening` — Compliance
- `MLPrediction` / `ModelVersion` / `TrainingRun` — ML system
- `BrokerProfile` / `BrokerAssistant` / `TransactionCoordinator` — Broker management
- `Automation` / `AutomationExecution` / `WorkflowExecution` — Automation engine

## Frontend Dashboard Pages

| Section | Route | Description |
|---------|-------|-------------|
| Dashboard | `/dashboard` | Main overview with metrics and activity |
| Projects | `/projects` | Project list and management |
| Project Detail | `/projects/[id]` | Full project view with notes, tasks, GitHub, deployments |
| Tasks | `/tasks` | Task management |
| Chat | `/chat` | AI agent chat interface |
| Contacts | `/contacts` | Contact management |
| Contact Detail | `/contacts/[id]` | Contact detail view |
| Email | `/email` | Full email client |
| Meetings | `/meetings` | Meeting management |
| Calendar | `/calendar` | Calendar view |
| Knowledge | `/knowledge` | RAG knowledge base |
| Reminders | `/reminders` | Reminder management |
| Calls | `/calls` | Voice calling interface |
| Activity Feed | `/activity-feed` | Platform activity timeline |
| Audit Logs | `/audit-logs` | SOC 2 audit log viewer |
| Settings | `/settings` | System settings, integrations, theme |
| Settings/Templates | `/settings/templates` | Template administration |
| TV Display | `/tv-display` | TV display configuration |
| Profile | `/profile` | User profile |

### TV Display Pages
| Route | Description |
|-------|-------------|
| `/tv/projects` | Project kanban/slideshow for office TVs |
| `/tv/activity` | Activity timeline display |
| `/tv/hackernews` | Hacker News feed |
| `/tv/twitter` | Twitter/X feed |

### Client Portal Pages
| Route | Description |
|-------|-------------|
| `/client` | Client portal home |
| `/client/login` | Client authentication |
| `/client/invite/[token]` | Invite acceptance |
| `/client/projects/[id]` | Project overview |
| `/client/projects/[id]/issues` | GitHub issues |
| `/client/projects/[id]/prs` | Pull requests |
| `/client/projects/[id]/commits` | Commit history |

### Public Pages
| Route | Description |
|-------|-------------|
| `/p/[id]` | Public project share with ticket submission |
| `/signature/[token]` | Signature capture |
| `/upload/[token]` | Public file upload |
| `/ipad` | iPad remote controller for TV displays |
| `/setup` | Organization onboarding wizard |

## WebSocket Servers

The backend initializes 6 WebSocket servers:

| Path | Purpose |
|------|---------|
| `/ws/voice` | Real-time voice (OpenAI Realtime API) |
| `/voice/ws/twilio` | Twilio voice bridge |
| `/ws/notifications` | Push notifications |
| `/ws/sprites` | Sprite terminal/event proxy |
| `/ws/tv-remote` | TV remote control (iPad ↔ TV) |
| `/ws/github-sync` | GitHub sync events |

## Key Services (Active Development)

### Project & Development
- `ProjectService` — Project CRUD, filtering, statistics
- `ProjectNoteService` / `ProjectNoteAudioService` — Notes with voice recordings
- `ProjectContactService` — Project contacts
- `ProjectRecapService` — AI-powered project recaps
- `GitHubService` / `GitHubIssueSyncService` — GitHub bidirectional sync
- `CodingTaskService` / `ClaudeCodingAgentService` — AI coding tasks
- `CodeliveService` — Automaker integration (features, agent runs)
- `SpritesService` / `SpriteTaskService` / `SpriteConversationService` — Sprite agents
- `SpriteMcpService` — MCP server management for Sprites

### Communication
- `TeamCommunicationService` — Team chat
- `EmailClientService` — IMAP/SMTP email
- `MeetingService` / `MeetingTranscriptionService` — Meetings with transcription
- `NotificationService` / `PushNotificationService` — Notifications

### Infrastructure
- `FlyService` — Fly.io machine/domain/secret management
- `VercelService` — Vercel project/domain management
- `DeployHookService` — Deployment triggers
- `ScreenshotService` — Live site screenshots
- `WasabiStorageService` / `SupabaseStorageService` — File storage
- `HomeAssistantService` — Smart home integration
- `TVRemoteWebSocketService` — TV remote control

### AI & Knowledge
- `agentService` — Main AI agent with 65+ tools
- `MemoryService` — Agent memory (Pinecone)
- `knowledge/` — RAG knowledge base
- `ElevenLabsService` — Text-to-speech
- `RealtimeVoiceService` — Voice chat

## Testing

### Jest Configuration
- Unit tests: `src/tests/unit/**/*.test.ts` (33 files)
- Integration tests: `src/tests/integration/**/*.test.ts` (11 files)
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
DATABASE_URL=postgresql://user:pass@localhost:5432/codelive
# OR
DB_USER=codelive_user
DB_PASSWORD=password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=codelive_db

# Auth
JWT_SECRET=your_jwt_secret

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Optional (enable features)
```bash
# AI/ML
OPENAI_API_KEY=sk-...              # AI agents + embeddings
OPENROUTER_API_KEY=...             # Alternative LLM provider
AGENT_MODEL=gpt-4o                 # Default agent model

# Cache
REDIS_URL=redis://localhost:6379   # Falls back to in-memory

# Knowledge Base
PINECONE_API_KEY=...               # RAG vector storage
KNOWLEDGE_FOLDER=./knowledge       # Document watch folder

# GitHub Integration
GITHUB_TOKEN=...                   # GitHub API access
GITHUB_WEBHOOK_SECRET=...         # Webhook verification

# Integrations
DOCUSEAL_API_KEY=...               # E-signatures
DOCUSEAL_API_URL=https://api.docuseal.com
RESEND_API_KEY=...                 # Email
TWILIO_SID=...                     # SMS/Voice
TWILIO_AUTH_TOKEN=...
STRIPE_SECRET_KEY=...              # Payments
ELEVENLABS_API_KEY=...             # Text-to-speech
WASABI_ACCESS_KEY=...              # File storage
WASABI_SECRET_KEY=...
WASABI_BUCKET=...

# Cloud Platforms
VERCEL_TOKEN=...                   # Vercel integration
FLY_API_TOKEN=...                  # Fly.io integration

# Codelive/Automaker
CODELIVE_URL=http://localhost:3008 # Automaker API
CODELIVE_WS_URL=ws://localhost:3008/api/events # Automaker WebSocket
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
2. Import and register in `backend/src/models/index.ts`
3. Define associations in `models/index.ts`
4. Add to sync array if needed

### Adding a New Frontend Page

1. Create page in `frontend/src/app/(dashboard)/page-name/page.tsx`
2. Create custom hooks in `frontend/src/hooks/` if needed
3. Add navigation in sidebar/dock component

### Adding a Sprite Feature

1. Backend: Add service methods in `SpritesService.ts` or `SpriteTaskService.ts`
2. Backend: Add route handler in `spritesRoutes.ts` or `spriteTasksRoutes.ts`
3. Frontend: Update hooks in `use-sprites.ts` or `use-sprite-tasks.ts`
4. Frontend: Add/update components in `components/sprites/`

### Adding Agent Tools

1. Define tool in `backend/src/services/agentService.ts` with name, description, parameters
2. Implement handler function
3. Register in tools array
4. Test via `/api/agent/chat` endpoint

## Error Handling

### Backend
- Use try/catch in controllers
- Return `{ success: false, error: message }` for errors
- `errorHandler.ts` middleware strips stack traces in production
- Graceful shutdown handler closes all connections on SIGTERM/SIGINT

### Frontend
- API errors throw `ApiError` with status code
- 401 errors auto-redirect to login via Supabase
- Use React Query error states for UI feedback

## Middleware Stack

| Middleware | Purpose |
|-----------|---------|
| `auth.ts` | JWT authentication |
| `supabaseAuth.ts` | Supabase token verification |
| `apiKeyAuth.ts` | API key authentication |
| `permissions.ts` | Permission checking |
| `cors.ts` | CORS configuration |
| `upload.ts` | Multer file upload |
| `validation.ts` | Request validation |
| `errorHandler.ts` | Global error handler + 404 |

## GitHub Actions Integration

### Claude Autonomous Agent
This repository uses **Anthropic's official Claude Code action** for automated development:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `claude-autonomous-agent.yml` | `@claude work on this`, issue assignment | Writes code, creates PRs |
| `claude-pr-review.yml` | PR opened/updated | Automated code review |
| `claude-issue-triage.yml` | Issue opened | Categorization and labeling |
| `claude-deploy.yml` | `@claude deploy` | Manual deployment |
| `claude-test.yml` | `@claude test` | Test suite runner |
| `claude-build.yml` | `@claude build` | Build workflow |

### When Working on Issues

1. Read the full issue description and all comments
2. Use Grep/Glob to find relevant files
3. Read existing implementations to understand patterns
4. Plan changes considering backward compatibility
5. Follow existing code style and patterns
6. Add proper TypeScript types
7. Create quality PRs with clear descriptions referencing the issue

## Commit Message Format

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

## Deployment

### Fly.io
```bash
./fly-deploy.sh          # Automated deployment
# See FLY_DEPLOYMENT.md for details
```

### Docker
```bash
docker-compose -f docker-compose.prod.yml up -d  # Production
docker-compose up -d                              # Development
```

## Troubleshooting

### Database Connection Failed
- Check `DATABASE_URL` or individual `DB_*` vars
- Production requires valid database config (fails on startup if missing)
- SSL required in production, optional in development

### Redis Not Available
- Falls back to in-memory cache automatically
- Check `REDIS_URL` for connection issues

### AI Agent Not Working
- Verify `OPENAI_API_KEY` or `OPENROUTER_API_KEY`
- Agent initializes with warning if keys missing

### Sprites Not Connecting
- Verify Sprite container is running
- Check WebSocket connection at `/ws/sprites`
- Verify MCP server configurations

### GitHub Sync Issues
- Verify `GITHUB_TOKEN` has correct permissions
- Check webhook secret matches `GITHUB_WEBHOOK_SECRET`
- Monitor `/ws/github-sync` WebSocket for events

### Codelive/Automaker Not Working
- Verify `CODELIVE_URL` points to running Automaker instance
- Check WebSocket at `CODELIVE_WS_URL`

---
*Last Updated: February 2026*
