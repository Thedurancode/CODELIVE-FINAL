# Dispotree AI Agent - Complete Tool Reference

> **90+ Tools** across **17 Categories** for intelligent real estate deal management

## Quick Overview

Your AI agent can handle natural language requests like:
- "Find me 3-bed houses under $200k in Tampa"
- "Analyze this deal and score it against our buy boxes"
- "Send an email to Ed, George and Dave about tomorrow's meeting"
- "Add John Smith to the team as an Acquisitions Manager"
- "Create a reminder to follow up with the seller in 3 days"
- "Schedule a showing for 123 Main St tomorrow at 2pm"

---

## Tool Categories at a Glance

| Category | Tools | Description |
|----------|-------|-------------|
| [Property Management](#1-property-management-8-tools) | 8 | Search, create, compare, import properties |
| [Deal Analysis](#2-deal-analysis-6-tools) | 6 | ROI, MAO, scoring, pricing strategy |
| [Buy Box Management](#3-buy-box-management-5-tools) | 5 | Hedge fund criteria management |
| [Market Data](#4-market-data-6-tools) | 6 | Zillow data, skip trace, rental trends |
| [Pipeline & Portfolio](#5-pipeline--portfolio-8-tools) | 8 | Deal tracking, portfolio management |
| [Knowledge & Memory](#6-knowledge--memory-6-tools) | 6 | RAG search, user preferences |
| [Automation](#7-automation-6-tools) | 6 | Event-driven workflows |
| [Contract Management](#8-contract-management-4-tools) | 4 | DocuSeal e-signatures |
| [Web Scraping](#9-web-scraping--auction-sites-4-tools) | 4 | Import from listing URLs |
| [Settings](#10-settings-3-tools) | 3 | System configuration |
| [File Analysis](#11-file-analysis-4-tools) | 4 | PDF, CSV parsing |
| [Scheduling](#12-scheduling-6-tools) | 6 | Reminders, reports, tasks |
| [Batch Operations](#13-batch-operations-5-tools) | 5 | Bulk analyze, score, update |
| [Calendar](#14-calendar-integration-7-tools) | 7 | Google Calendar integration |
| [Communication](#15-communication-10-tools) | 10 | Email, SMS, team messaging |
| [Team Management](#16-team-management-4-tools) | 4 | Team member CRUD |
| [Offer Management](#17-offer-management-5-tools) | 5 | Create, track, counter offers |
| [Task Management](#18-task-management-1-tool) | 1 | Assign tasks to team |

---

## 1. Property Management (8 tools)

### `search_properties`
Search properties with flexible filtering.

**Example:** "Find 3-bedroom houses in Austin under $250k"

| Parameter | Type | Description |
|-----------|------|-------------|
| `city` | string | City name |
| `state` | string | State code (TX, FL, etc.) |
| `minPrice` / `maxPrice` | number | Price range |
| `minBedrooms` / `maxBedrooms` | number | Bedroom range |
| `propertyType` | string | Single Family, Condo, etc. |
| `limit` | number | Max results (default 10) |

### `get_property_details`
Get complete property info including owner, listing history, financials.

### `get_property_count`
Count properties by state or city.

### `get_recent_deals`
Get most recently added properties.

### `find_similar_properties`
Find comparable properties by price, bedrooms, location.

### `compare_deals`
Side-by-side comparison with ROI, MAO, profit calculations.

### `create_property`
Create new property with auto-enrichment from Zillow.

**Example:** "Add 123 Main St, Austin TX 78701 at $200k asking price"

### `import_from_url`
Import from any listing URL (Zillow, Redfin, Realtor, etc.)

**Example:** "Import this property: https://zillow.com/..."

---

## 2. Deal Analysis (6 tools)

### `analyze_deal`
Deep analysis with ROI, MAO (70% rule), cash-on-cash return.

**Returns:**
- Maximum Allowable Offer (MAO)
- Estimated ARV
- Potential profit
- ROI percentage
- Deal score (0-100)
- AI-powered insights

### `score_deal_against_buyboxes`
Score against all hedge fund buy boxes.

**Returns:**
- Match percentage per fund
- Match type (strong/moderate/weak)
- Auto-submit eligibility
- Fund contact info

### `quick_deal_score`
Fast pass/fail in under 1 second.

**Returns:** Verdict (Strong Buy / Consider / Weak / Pass)

### `get_deal_intelligence`
Comprehensive AI-powered analysis with:
- Success probability prediction
- Optimal offer price
- Negotiation tactics
- Best fund matches

### `get_pricing_strategy`
Optimal pricing with negotiation tactics.

**Returns:**
- Opening offer
- Target price
- Walk-away price
- Negotiation tips

### `quick_deal_assessment`
Rapid evaluation of existing property.

---

## 3. Buy Box Management (5 tools)

### `list_buyboxes`
List all hedge fund buy boxes with criteria.

### `get_buybox_details`
Complete buy box details including scoring weights.

### `create_buybox`
Create new fund buy box criteria.

**Example:** "Create a buy box for Texas SFR under $300k"

### `update_buybox`
Modify criteria, contacts, or settings.

### `delete_buybox`
Permanently remove a buy box.

---

## 4. Market Data (6 tools)

### `lookup_market_data`
Comprehensive data including:
- Zestimate valuation
- Property details
- Comparable homes
- Price history
- Owner/skip trace info (optional)

**Integration:** Zillow API (cached 6 hours)

### `skip_trace_property`
Get owner contact information.

**Returns:**
- Owner name
- Phone numbers
- Email addresses
- Mailing address
- Equity info

### `get_rental_market_trends`
Rental market analysis by location.

### `get_recent_market_lookups`
History of researched properties.

### `get_market_stats`
Statistical analysis of a market.

### `find_best_funds`
Find matching funds for a property.

---

## 5. Pipeline & Portfolio (8 tools)

### Pipeline Stages
```
new → analyzing → due_diligence → offered → negotiating → under_contract → closed
```

### `add_to_pipeline`
Track a deal through your pipeline.

### `update_pipeline_stage`
Move deal to next stage.

### `get_my_pipeline`
View all active deals by stage.

### `close_deal`
Mark as won, lost, or withdrawn.

### `add_to_portfolio`
Add property to owned investments.

### `get_my_portfolio`
View owned properties with status.

### `get_portfolio_value`
Total value and equity calculation.

### `update_property_value`
Update market value estimates.

---

## 6. Knowledge & Memory (6 tools)

### `search_knowledge`
RAG search across documents, contracts, guides.

**Integration:** Pinecone vector database

### `get_knowledge_stats`
Document count and categories.

### `remember_preference`
Store user preferences for future context.

**Example:** "Remember that I prefer creative financing deals"

### `recall_memories`
Retrieve stored preferences.

### `get_memory_stats`
Memory statistics.

### `clear_memories`
Delete stored preferences.

---

## 7. Automation (6 tools)

### `list_automations`
View configured automation rules.

### `get_automation`
Detailed automation info.

### `toggle_automation`
Enable/disable automation.

### `create_automation`
Create event-driven workflow.

**Triggers:**
- `deal_created`
- `deal_scored`
- `deal_matched`
- `stage_changed`
- `schedule`

**Actions:**
- `send_email`
- `send_sms`
- `create_task`
- `update_stage`
- `notify_fund`

### `delete_automation`
Remove automation rule.

### `get_automation_history`
Execution logs.

---

## 8. Contract Management (4 tools)

### `list_contract_templates`
Available e-signature templates.

### `send_contract`
Send for e-signature via DocuSeal.

**Example:** "Send the purchase agreement to john@example.com"

### `get_contract_status`
Track signing progress.

### `resend_contract_reminder`
Remind unsigned recipients.

---

## 9. Web Scraping & Auction Sites (4 tools)

### `scrape_website`
Extract property data from listing URLs.

### `map_website`
Discover all listing pages on a site.

### `list_auction_sites`
Configured auction sites (Xome, Hubzu, etc.)

### `submit_property_to_site`
Auto-submit to auction/marketplace.

---

## 10. Settings (3 tools)

### `get_settings`
Retrieve system/user settings.

### `update_setting`
Modify settings.

### `reset_setting`
Reset to defaults.

---

## 11. File Analysis (4 tools)

### `analyze_file`
Parse PDF, CSV, text files.

### `extract_table_data`
Extract structured table data.

### `summarize_document`
Generate content summaries.

### `compare_documents`
Compare multiple documents.

---

## 12. Scheduling (6 tools)

### `schedule_reminder`
Create reminders with natural language.

**Example:** "Remind me to follow up with the seller in 3 days"

Accepts: "in 2 hours", "tomorrow at 9am", "next Monday"

### `schedule_report`
Schedule recurring reports.

### `schedule_action`
Schedule tool execution for later.

### `list_scheduled_tasks`
View pending tasks.

### `cancel_scheduled_task`
Cancel a pending task.

### `reschedule_task`
Move task to new time.

---

## 13. Batch Operations (5 tools)

### `batch_analyze_deals`
Analyze multiple properties with progress.

### `batch_score_properties`
Score multiple deals against buy boxes.

### `batch_update_properties`
Bulk update property fields.

### `batch_export_properties`
Export to CSV or JSON.

### `batch_send_to_funds`
Send multiple deals to funds.

---

## 14. Calendar Integration (7 tools)

**Integration:** Google Calendar API

### `schedule_showing`
Create property showing event.

**Example:** "Schedule a showing for 123 Main St tomorrow at 2pm"

### `schedule_follow_up`
Schedule follow-up call/meeting.

### `create_deadline`
Add deadline reminder (contract deadlines, inspection periods).

### `list_calendar_events`
View upcoming events.

### `find_available_times`
Find open slots for scheduling.

### `reschedule_event`
Move event to new time.

### `cancel_calendar_event`
Delete calendar event.

---

## 15. Communication (10 tools)

### `send_email`
Send email with tracking.

**Example:** "Send an email to john@example.com about 123 Main St"

| Parameter | Description |
|-----------|-------------|
| `to` | Recipient(s) |
| `subject` | Subject line |
| `body` | Plain text content |
| `html` | Optional HTML version |
| `cc` / `bcc` | Copy recipients |
| `contactId` | Log to contact |
| `propertyId` | Link to property |

### `send_bulk_email`
Send to multiple recipients with personalization.

### `save_draft`
Save email to drafts folder.

**Example:** "Create an email for Ed about 141 Throop Ave and save it to my drafts"

### `draft_email_with_attachments`
Create draft with property documents.

### `send_sms`
Send SMS via Twilio.

### `send_team_email`
Email team members by name.

**Example:** "Send an email to Ed, George and Dave reminding them about tomorrow's meeting"

### `call_property_owner`
Initiate outbound call (Twilio).

### `get_last_contact_activity_by_name`
Find contact activity by name.

### `list_emails`
Browse email inbox/folders.

### `get_email`
Read specific email.

---

## 16. Team Management (4 tools)

### `lookup_team_members`
Find team members and their profiles.

**Example:** "Who's on my team?" or "What does Ed specialize in?"

**Returns:**
- Name, email, phone
- Role and title
- Bio
- Expertise areas
- Timezone

| Parameter | Description |
|-----------|-------------|
| `names` | Names to look up |
| `listAll` | Get all team members |

### `create_team_member`
Add new team member. **Admin only.**

**Example:** "Add John Smith to the team as an Acquisitions Manager with email john@company.com"

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | Yes | Full name |
| `email` | Yes | Email (unique) |
| `title` | No | Job title |
| `phone` | No | Phone number |
| `bio` | No | Biography |
| `expertise` | No | Skills array |
| `timezone` | No | Timezone |
| `role` | No | System role |

### `update_team_member`
Update team member profile. **Admin only.**

**Example:** "Update Ed's title to Senior Acquisitions Manager"

### `send_team_email`
Send email to team members by name.

**Example:** "Email Ed and Sarah about the staff meeting"

---

## 17. Offer Management (5 tools)

### `create_offer`
Submit purchase offer.

**Example:** "Make an offer of $180k on 123 Main St with 14-day close"

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dealId` | required | Property ID |
| `offerAmount` | required | Offer amount |
| `closingDays` | 14 | Days to close |
| `earnestMoney` | - | EMD amount |
| `financeType` | cash | cash/hard_money/conventional |
| `contingencies` | - | inspection, financing, etc. |
| `proofOfFunds` | false | POF attached |
| `expiresInDays` | 3 | Offer expiration |

### `list_offers`
View offers with filtering.

### `get_offer_details`
Complete offer information.

### `update_offer_status`
Withdraw, accept, reject, or counter.

### `get_offer_stats`
Acceptance rates, average discounts.

---

## 18. Task Management (1 tool)

### `create_task`
Create and assign tasks to team.

**Example:** "Create a task for Sarah to review the contract by Friday"

| Parameter | Description |
|-----------|-------------|
| `title` | Task title |
| `description` | Task details |
| `dueDate` | Natural language date |
| `priority` | low/normal/high/urgent |
| `assignees` | Name(s) or email(s) |
| `assigneeRole` | Assign to role |
| `assignToAll` | Assign to everyone |
| `propertyId` | Link to property |
| `tags` | Task tags |

---

## Integration Requirements

### Required for Full Functionality

| Service | Environment Variable | Features Enabled |
|---------|---------------------|------------------|
| **Email** | `RESEND_API_KEY` | Email sending |
| **SMS** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS, voice calls |
| **E-Signatures** | `DOCUSEAL_API_KEY`, `DOCUSEAL_API_URL` | Contract signing |
| **Market Data** | `RAPIDAPI_KEY` | Zillow data, skip trace |
| **Web Scraping** | `FIRECRAWL_API_KEY` | URL import |
| **Knowledge Base** | `PINECONE_API_KEY` | RAG search, memory |
| **AI/LLM** | `OPENAI_API_KEY` or `OPENROUTER_API_KEY` | All AI analysis |
| **Database** | `DATABASE_URL` | Core functionality |

### Optional Integrations

| Service | Purpose |
|---------|---------|
| Google Calendar | Calendar events, showings |
| User Email OAuth | Send from user's email |
| Redis | Caching (falls back to in-memory) |

---

## Permissions

| Tool | Who Can Use |
|------|-------------|
| `create_team_member` | Admin only |
| `update_team_member` | Admin only |
| All other tools | All authenticated users |

---

## Performance

| Operation | Typical Latency |
|-----------|-----------------|
| Property search | <100ms |
| Deal analysis | 200-500ms |
| Buy box scoring | <50ms |
| Market data (cached) | 500ms-2s |
| Email sending | <1s |
| Batch ops (100 items) | 3-5s |

---

## Example Conversations

### Property Analysis
```
User: "Analyze 123 Main St, Austin TX 78701 listed at $200k"

Agent: Uses analyze_deal → Returns MAO of $175k, ROI of 22%,
       scores against 5 buy boxes, recommends "Strong Buy"
```

### Team Communication
```
User: "Send an email to Ed, George and Dave about tomorrow's 9am meeting"

Agent: Uses send_team_email → Looks up team members, sends email,
       reports "Email sent to Ed Duran, George Smith, Dave Johnson"
```

### Scheduling
```
User: "Remind me to follow up with the seller of 456 Oak St in 3 days"

Agent: Uses schedule_reminder → Creates reminder for 3 days from now,
       links to property, confirms "Reminder set for Friday at 2:30 PM"
```

### Offer Workflow
```
User: "Make a cash offer of $185k on property 123 with 10-day close"

Agent: Uses create_offer → Submits offer, calculates 7.5% below asking,
       confirms "Offer submitted, expires in 3 days"
```

---

## Security & Compliance

- All communications logged to `ContactActivity`
- Sensitive batch operations require approval
- User authentication enforced
- SOC 2 compliant audit logging
- Rate limiting on bulk operations

---

*Last Updated: January 2026*
