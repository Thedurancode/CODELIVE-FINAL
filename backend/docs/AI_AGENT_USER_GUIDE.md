# Dispotree AI Agent - User Guide

> Talk to your AI assistant like you'd talk to a colleague. It understands natural language and can help you manage deals, analyze properties, communicate with your team, and automate your workflow.

---

## Table of Contents

1. [Finding Properties](#1-finding-properties)
2. [Analyzing Deals](#2-analyzing-deals)
3. [Managing Your Pipeline](#3-managing-your-pipeline)
4. [Working with Buy Boxes](#4-working-with-buy-boxes)
5. [Making Offers](#5-making-offers)
6. [Market Research](#6-market-research)
7. [Communicating with People](#7-communicating-with-people)
8. [Managing Your Team](#8-managing-your-team)
9. [Scheduling & Reminders](#9-scheduling--reminders)
10. [Calendar & Showings](#10-calendar--showings)
11. [Contracts & E-Signatures](#11-contracts--e-signatures)
12. [Automating Your Workflow](#12-automating-your-workflow)
13. [Working with Files](#13-working-with-files)
14. [Your Portfolio](#14-your-portfolio)
15. [Knowledge Base](#15-knowledge-base)
16. [Agent Memory](#16-agent-memory)
17. [Bulk Operations](#17-bulk-operations)
18. [Settings](#18-settings)

---

## 1. Finding Properties

The agent can search your property database, find similar deals, and import new properties from listing websites.

### Search for properties

```
You: Find me single family homes in Tampa under $200k

Agent: I found 12 properties matching your criteria:

1. 123 Oak Street, Tampa, FL - $185,000
   3 bed, 2 bath, 1,450 sqft

2. 456 Pine Avenue, Tampa, FL - $192,000
   4 bed, 2 bath, 1,680 sqft

3. 789 Maple Drive, Tampa, FL - $178,000
   3 bed, 1 bath, 1,200 sqft
...
```

### More search examples

```
You: Show me 3-bedroom houses in Texas between $150k and $250k

You: What properties do we have in Florida?

You: Find deals added in the last 7 days

You: Show me properties with ARV over $300k
```

### Get details on a specific property

```
You: Tell me everything about property 123

Agent: Here's the full details for 123 Oak Street, Tampa FL:

Property Details:
- Price: $185,000
- Bedrooms: 3 | Bathrooms: 2
- Square Feet: 1,450
- Year Built: 1985
- Property Type: Single Family

Owner Information:
- Name: John Smith
- Phone: (555) 123-4567
- Email: john.smith@email.com

Financials:
- ARV: $245,000
- Estimated Rehab: $25,000
- MAO (70% rule): $146,500
```

### Find similar properties

```
You: Find me properties similar to 123 Oak Street

Agent: Here are 5 similar properties to 123 Oak Street ($185k, 3 bed):

1. 234 Elm Court - $179,000 (3 bed, 1,380 sqft) - $6k less
2. 567 Cedar Lane - $192,000 (3 bed, 1,520 sqft) - $7k more
3. 890 Birch Road - $188,000 (4 bed, 1,490 sqft) - $3k more
...
```

### Compare multiple deals

```
You: Compare properties 123, 456, and 789

Agent: Side-by-side comparison:

| Property      | Price    | ARV      | MAO      | ROI   | Verdict    |
|---------------|----------|----------|----------|-------|------------|
| 123 Oak St    | $185,000 | $245,000 | $146,500 | 22%   | STRONG BUY |
| 456 Pine Ave  | $192,000 | $240,000 | $143,000 | 15%   | NEGOTIATE  |
| 789 Maple Dr  | $178,000 | $210,000 | $122,000 | 12%   | PASS       |

Recommendation: 123 Oak Street has the best ROI at 22%.
```

### Import a property from a website

```
You: Import this property: https://www.zillow.com/homedetails/123-main-st

Agent: I've imported the property from Zillow:

Address: 123 Main Street, Orlando, FL 32801
Price: $225,000
Beds: 4 | Baths: 2
Sqft: 1,850
Year Built: 1992

Property saved to database with ID: 456
Would you like me to analyze this deal?
```

### Add a new property manually

```
You: Add a new property at 500 River Road, Austin TX 78701, asking $275,000, 4 beds 3 baths

Agent: Property created successfully!

Address: 500 River Road, Austin, TX 78701
Asking Price: $275,000
Beds: 4 | Baths: 3

I also enriched it with Zillow data:
- Zestimate: $292,000
- Owner: Michael Johnson
- Last Sale: $180,000 (2018)

Scored against 8 buy boxes:
- 3 strong matches (80%+)
- 2 moderate matches (60-79%)
```

---

## 2. Analyzing Deals

Get instant analysis on any deal including ROI, MAO, profit potential, and fund matches.

### Full deal analysis

```
You: Analyze the deal at 123 Oak Street Tampa FL listed at $185,000

Agent: Deal Analysis for 123 Oak Street:

VERDICT: STRONG BUY

Financials:
- Asking Price: $185,000
- After Repair Value (ARV): $245,000
- Estimated Rehab: $25,000
- Maximum Allowable Offer (MAO): $146,500
- Potential Profit: $34,500
- ROI: 22%

Analysis:
- Price is 75% of ARV - good margin
- Below MAO by $38,500 - room to negotiate
- Cash-on-cash return: 18.6%

Recommendation: Strong buy at asking price. Could negotiate
down to $165k for even better returns.
```

### Quick deal score

```
You: Quick score on this deal - Tampa, $185k asking, $245k ARV

Agent: QUICK SCORE: STRONG BUY (87/100)

- Success Probability: 87%
- Your offer at $185k is 24% below MAO
- Estimated profit: $34,500

Top reason: Excellent spread between asking and ARV.
```

### Get pricing strategy

```
You: What should I offer on 123 Oak Street?

Agent: Pricing Strategy for 123 Oak Street:

Opening Offer: $155,000 (16% below asking)
Target Price: $168,000 (9% below asking)
Walk-Away Price: $175,000 (5% below asking)
MAO: $146,500

Negotiation Tips:
1. Start at $155k - seller expects negotiation
2. Point out the roof is 15 years old
3. Market has been slow - use as leverage
4. Be ready to close in 14 days for better price

The seller has been on market 45 days - they may be motivated.
```

### Score against buy boxes

```
You: Which funds would want this deal?

Agent: Buy Box Matches for 123 Oak Street:

STRONG MATCHES (80%+):
1. Blackstone SFR Fund - 94% match
   - Contact: sarah@blackstone.com
   - Auto-submit eligible: Yes

2. Invitation Homes - 88% match
   - Contact: deals@invitationhomes.com
   - Auto-submit eligible: Yes

MODERATE MATCHES (60-79%):
3. American Homes 4 Rent - 72% match
4. Progress Residential - 68% match

WEAK MATCHES:
5. Tricon Residential - 45% match (price too high for their box)

Would you like me to submit to the strong matches?
```

### Get deal intelligence

```
You: Give me full intelligence on this deal

Agent: DEAL INTELLIGENCE REPORT

Property: 123 Oak Street, Tampa FL
Asking: $185,000 | ARV: $245,000

SUCCESS PROBABILITY: 87%

Optimal Offer: $168,000
- This price gives you 23% ROI
- 91% chance of acceptance based on similar deals

Best Fund Matches:
1. Blackstone (94%) - 89% historical acceptance rate
2. Invitation Homes (88%) - 82% historical acceptance rate

Market Context:
- Tampa median: $275,000 (this is 33% below)
- Days on market avg: 28 (this property: 45)
- Seller motivation: HIGH (price reduced twice)

Risks:
- Roof age (15 years) - budget $8k contingency
- Foundation shows minor settling

Recommendation: Move fast - this is underpriced for the area.
```

---

## 3. Managing Your Pipeline

Track deals through every stage from discovery to closing.

### Pipeline stages

```
New → Analyzing → Due Diligence → Offered → Negotiating → Under Contract → Closed
```

### Add a deal to your pipeline

```
You: Add 123 Oak Street to my pipeline

Agent: Added to your pipeline!

Property: 123 Oak Street, Tampa FL
Stage: New
Added: January 15, 2026

What would you like to do next?
- Analyze the deal
- Move to "Analyzing" stage
- Add notes
```

### View your pipeline

```
You: Show me my pipeline

Agent: Your Deal Pipeline (12 active deals):

NEW (3):
- 123 Oak St, Tampa - $185k - Added 2 days ago
- 456 Pine Ave, Austin - $225k - Added 5 days ago
- 789 Elm Dr, Miami - $310k - Added today

ANALYZING (2):
- 234 Cedar Ln, Orlando - $195k - 5 days in stage
- 567 Maple Ct, Dallas - $275k - 3 days in stage

DUE DILIGENCE (2):
- 890 Birch Rd, Houston - $340k - Inspection scheduled
- 321 Spruce Way, Tampa - $188k - Title search pending

OFFERED (3):
- 654 Willow St, Austin - $250k - Waiting for response
- 987 Ash Ave, Miami - $295k - Counter received
- 147 Oak Blvd, Orlando - $210k - Expires tomorrow

UNDER CONTRACT (2):
- 258 Pine Ct, Dallas - $285k - Closing in 8 days
- 369 Elm Way, Tampa - $175k - Closing in 14 days
```

### Move a deal to the next stage

```
You: Move 123 Oak Street to due diligence

Agent: Updated! 123 Oak Street moved to Due Diligence.

Previous stage: Analyzing (was there 5 days)
New stage: Due Diligence
Total days in pipeline: 7

Suggested next steps:
- Order inspection
- Run title search
- Verify ARV with comps
```

### Close a deal

```
You: Close the deal on 258 Pine Court - we won at $280k

Agent: Congratulations on closing 258 Pine Court!

Final Price: $280,000
Days to Close: 23
Original Asking: $295,000
You saved: $15,000 (5% below asking)

Deal moved to: Closed Won
Added to your portfolio automatically.

Your stats this month:
- Deals closed: 4
- Total volume: $1.2M
- Average discount: 7%
```

### Mark a deal as lost

```
You: We lost the deal on 987 Ash Ave - seller went with another buyer

Agent: Deal marked as lost.

Property: 987 Ash Avenue, Miami
Outcome: Lost
Reason: Seller chose another buyer
Days in pipeline: 18

Would you like me to find similar properties in Miami?
```

---

## 4. Working with Buy Boxes

Manage hedge fund investment criteria to match deals with the right buyers.

### View all buy boxes

```
You: Show me all our buy boxes

Agent: You have 8 active buy boxes:

1. Blackstone SFR Fund
   - States: TX, FL, GA, NC
   - Price: $150k - $350k
   - Beds: 3-5
   - Auto-submit: Yes (80%+ score)

2. Invitation Homes Southeast
   - States: FL, GA, SC
   - Price: $200k - $400k
   - Beds: 3-4
   - Auto-submit: Yes (85%+ score)

3. American Homes 4 Rent
   - States: TX, AZ, NV
   - Price: $175k - $325k
   - Beds: 3-5
   - Auto-submit: No
...
```

### Get buy box details

```
You: Tell me more about the Blackstone buy box

Agent: Blackstone SFR Fund - Full Details:

Investment Criteria:
- States: TX, FL, GA, NC, TN
- Price Range: $150,000 - $350,000
- Bedrooms: 3-5
- Bathrooms: 2+
- Square Feet: 1,200 - 2,500
- Year Built: 1980 or newer
- Property Types: Single Family only

Contact:
- Email: deals@blackstone.com
- Name: Sarah Johnson

Settings:
- Auto-submit: Enabled at 80%+ match
- Priority: 1 (highest)
- Last submission: 3 days ago
- Total deals sent: 47
- Acceptance rate: 34%
```

### Create a new buy box

```
You: Create a buy box for a new fund called "Texas Rental Partners" - they want 3-4 bed houses in Texas under $250k

Agent: Buy box created!

Name: Texas Rental Partners
States: TX
Price Range: $0 - $250,000
Bedrooms: 3-4

What else would you like to add?
- Contact email
- Year built requirements
- Square footage range
- Auto-submit threshold
```

### Update a buy box

```
You: Update Blackstone's buy box to include Arizona

Agent: Updated Blackstone SFR Fund:

Previous states: TX, FL, GA, NC, TN
New states: TX, FL, GA, NC, TN, AZ

The buy box will now match properties in Arizona.
Would you like me to re-score existing AZ properties?
```

---

## 5. Making Offers

Create, track, and manage purchase offers on properties.

### Make an offer

```
You: Make an offer of $175,000 on 123 Oak Street with a 14-day close

Agent: Offer submitted!

Property: 123 Oak Street, Tampa FL
Offer Amount: $175,000
Asking Price: $185,000
Discount: $10,000 (5.4% below asking)

Terms:
- Closing: 14 days
- Finance Type: Cash
- Earnest Money: $5,000 (default)
- Expires: 3 days

Status: Pending
Offer ID: OFF-2024-0892

Would you like me to send an offer email to the seller?
```

### Make offer with details

```
You: Offer $280k on 456 Pine Ave with $10k earnest money, 21-day close, inspection contingency

Agent: Offer submitted with your terms!

Property: 456 Pine Avenue, Austin TX
Offer Amount: $280,000
Asking Price: $295,000
Discount: $15,000 (5.1% below asking)

Terms:
- Closing: 21 days
- Earnest Money: $10,000
- Finance Type: Cash
- Contingencies: Inspection

Your offer is 4% above MAO ($269k) - still profitable.
Expected ROI if accepted: 18%
```

### View your offers

```
You: Show me all my pending offers

Agent: Your Pending Offers (5):

1. 123 Oak St, Tampa - $175,000
   Submitted: 2 days ago
   Expires: Tomorrow
   Status: Pending (no response yet)

2. 456 Pine Ave, Austin - $280,000
   Submitted: Today
   Expires: In 3 days
   Status: Pending

3. 789 Elm Dr, Miami - $295,000
   Submitted: 4 days ago
   Status: COUNTERED at $305,000
   Action needed: Accept, counter, or reject

4. 234 Cedar Ln, Orlando - $188,000
   Submitted: 1 day ago
   Expires: In 2 days
   Status: Viewed by seller

5. 567 Maple Ct, Dallas - $260,000
   Submitted: 5 days ago
   Status: Pending (seller traveling)
```

### Counter an offer

```
You: Counter the Miami offer at $300k

Agent: Counter offer sent!

Property: 789 Elm Drive, Miami
Their counter: $305,000
Your counter: $300,000
Original ask: $315,000

You're now $5k apart.
This is 4.8% below asking - still a good deal at 16% ROI.

Status: Countered - waiting for response
```

### Withdraw an offer

```
You: Withdraw my offer on 567 Maple Court

Agent: Offer withdrawn.

Property: 567 Maple Court, Dallas
Original offer: $260,000
Reason: Withdrawn by buyer
Days pending: 5

The seller has been notified.
```

### Offer statistics

```
You: How are my offers performing this month?

Agent: Your Offer Stats (Last 30 Days):

Total Offers: 23
- Accepted: 6 (26%)
- Rejected: 8 (35%)
- Countered: 4 (17%)
- Pending: 3 (13%)
- Withdrawn: 2 (9%)

Average Offer: $245,000
Average Discount: 7.2% below asking
Average Time to Response: 3.2 days

Your acceptance rate is above average (26% vs 22% platform avg).
```

---

## 6. Market Research

Get real market data, valuations, and owner information.

### Look up market data

```
You: Look up market data for 123 Main Street, Austin TX

Agent: Market Data for 123 Main Street, Austin TX:

Valuation:
- Zestimate: $325,000
- Rent Zestimate: $2,100/month
- Last Sale: $185,000 (March 2019)

Property Details:
- Beds: 4 | Baths: 2.5
- Sqft: 2,100
- Year Built: 1998
- Lot Size: 0.25 acres

Comparable Sales (last 6 months):
1. 127 Main St - $318,000 (4 bed, 2,050 sqft)
2. 145 Oak Ave - $335,000 (4 bed, 2,200 sqft)
3. 189 Elm St - $310,000 (3 bed, 1,950 sqft)

Price History:
- Listed: $340,000 (45 days ago)
- Reduced: $325,000 (20 days ago)
- Current: $315,000

Data from Zillow (cached 2 hours ago)
```

### Skip trace a property

```
You: Who owns 456 Oak Avenue, Tampa?

Agent: Skip Trace Results for 456 Oak Avenue:

Owner Information:
- Name: Robert & Maria Garcia
- Ownership: Joint tenants
- Since: 2015

Contact Information:
- Phone 1: (555) 234-5678 (mobile - Robert)
- Phone 2: (555) 345-6789 (mobile - Maria)
- Phone 3: (555) 456-7890 (landline)
- Email: rgarcia@email.com

Mailing Address:
456 Oak Avenue, Tampa, FL 33601
(Owner occupied)

Property Equity:
- Estimated Value: $285,000
- Mortgage Balance: ~$145,000
- Estimated Equity: $140,000 (49%)

Confidence: High (verified through public records)
```

### Get rental market trends

```
You: What are rental trends in Austin?

Agent: Austin, TX Rental Market Trends:

Current Market:
- Median Rent: $1,850/month
- Average Rent: $1,920/month
- Total Listings: 3,247

Year-over-Year Change:
- Rent: +4.2% ($75/month increase)
- Inventory: +12% (more availability)

By Bedroom:
- 1 bed: $1,350 (+3.8%)
- 2 bed: $1,675 (+4.1%)
- 3 bed: $2,150 (+4.5%)
- 4 bed: $2,650 (+5.2%)

Rental Yield:
- Median home price: $425,000
- Gross yield: 5.2%
- Net yield (est): 3.8%

Trend: Rents rising but inventory increasing.
Good market for buy-and-hold investors.
```

---

## 7. Communicating with People

Send emails, SMS, and manage all your communications.

### Send an email

```
You: Send an email to john@example.com about 123 Oak Street

Agent: I'll draft an email about 123 Oak Street.

To: john@example.com
Subject: Investment Opportunity - 123 Oak Street, Tampa FL

Hi John,

I wanted to share an investment opportunity with you:

Property: 123 Oak Street, Tampa, FL 33601
Asking Price: $185,000
ARV: $245,000
Beds: 3 | Baths: 2 | Sqft: 1,450

This property offers strong returns with an estimated 22% ROI.

Let me know if you'd like more details or to schedule a viewing.

Best regards,
[Your name]

---
Should I send this email?
```

### Save email as draft

```
You: Create an email for Sarah about the Tampa deal and save it to my drafts

Agent: Draft saved!

To: sarah@example.com
Subject: Tampa Investment Property - 123 Oak Street

[Email content...]

Saved to your Drafts folder. You can edit and send it
from your email client whenever you're ready.

Draft ID: 12345
```

### Send to multiple people

```
You: Send the deal summary to john@abc.com, sarah@xyz.com, and mike@123.com

Agent: Email sent to 3 recipients!

To: john@abc.com, sarah@xyz.com, mike@123.com
Subject: New Investment Opportunity - 123 Oak Street

Message delivered successfully to all recipients.
Message ID: msg_abc123
```

### Send SMS

```
You: Text the seller at 555-123-4567 that we're interested in their property

Agent: SMS sent!

To: +1 (555) 123-4567
Message: "Hi, I'm interested in your property at 123 Oak Street.
Would you be available for a quick call to discuss? Thanks!"

Message delivered successfully.
```

### Email a team member

```
You: Send an email to Ed about the staff meeting tomorrow

Agent: Looking up Ed in your team...

Found: Ed Duran (ed@company.com)

Email sent!

To: ed@company.com
Subject: Staff Meeting Tomorrow

Hi Ed,

Just a reminder that we have a staff meeting tomorrow.

See you there!

---
Message delivered to Ed Duran.
```

### Email multiple team members

```
You: Email Ed, George, and Dave reminding them about tomorrow's 9am meeting

Agent: Looking up team members...

Found:
- Ed Duran (ed@company.com)
- George Smith (george@company.com)
- Dave Johnson (dave@company.com)

Email sent to 3 team members!

Subject: Reminder: Meeting Tomorrow at 9am

Hi team,

This is a reminder that we have a meeting tomorrow at 9am.

Please come prepared to discuss your current deals.

See you there!

---
Delivered to: Ed Duran, George Smith, Dave Johnson
```

---

## 8. Managing Your Team

Look up team members, add new people, and manage profiles.

> **Note:** Only admins can create or update team members.

### See who's on your team

```
You: Who's on my team?

Agent: Your Team (6 members):

1. Ed Duran
   - Title: Acquisitions Director
   - Email: ed@company.com
   - Phone: (555) 111-2222
   - Expertise: Acquisitions, Negotiation, Market Analysis

2. Sarah Johnson
   - Title: Underwriter
   - Email: sarah@company.com
   - Expertise: Underwriting, Due Diligence, Title Review

3. George Smith
   - Title: Transaction Coordinator
   - Email: george@company.com
   - Expertise: Closings, Documentation, Compliance

4. Dave Wilson
   - Title: Acquisitions Manager
   - Email: dave@company.com
   - Expertise: Acquisitions, Buyer Relations

5. Maria Garcia
   - Title: Marketing Manager
   - Email: maria@company.com
   - Expertise: Marketing, Lead Generation

6. Mike Brown
   - Title: Property Inspector
   - Email: mike@company.com
   - Expertise: Inspections, Rehab Estimates
```

### Learn about a team member

```
You: What does Sarah specialize in?

Agent: Sarah Johnson - Profile

Title: Underwriter
Email: sarah@company.com
Phone: (555) 222-3333

Bio:
Sarah has 8 years of experience in real estate underwriting.
She previously worked at Wells Fargo's commercial real estate
division before joining our team in 2022.

Expertise:
- Underwriting
- Due Diligence
- Title Review
- Risk Assessment
- Financial Analysis

Timezone: America/New_York
```

### Add a new team member (Admin only)

```
You: Add John Smith to the team as an Acquisitions Manager, email john@company.com

Agent: Team member created!

Name: John Smith
Email: john@company.com
Title: Acquisitions Manager
Role: team_member

John has been added to your organization and can now
log in with their email.

Would you like me to:
- Add their phone number?
- Set their expertise areas?
- Add a bio?
```

### Add team member with full details

```
You: Add Lisa Chen as a Transaction Coordinator. Email lisa@company.com,
phone 555-444-5555, she specializes in closings and title work,
she's in Pacific timezone

Agent: Team member created!

Name: Lisa Chen
Email: lisa@company.com
Phone: (555) 444-5555
Title: Transaction Coordinator
Role: team_member

Expertise:
- Closings
- Title work

Timezone: America/Los_Angeles

Lisa can now access the platform.
```

### Update a team member (Admin only)

```
You: Update Sarah's title to Senior Underwriter

Agent: Profile updated!

Sarah Johnson
Previous title: Underwriter
New title: Senior Underwriter

Updated field: title
```

### Add expertise to someone

```
You: Add "contract negotiation" to Dave's expertise

Agent: Profile updated!

Dave Wilson - Expertise Updated

Previous: Acquisitions, Buyer Relations
New: Acquisitions, Buyer Relations, Contract Negotiation

Dave's profile now shows 3 areas of expertise.
```

---

## 9. Scheduling & Reminders

Set reminders, schedule reports, and manage your tasks.

### Set a reminder

```
You: Remind me to follow up with the seller of 123 Oak Street in 3 days

Agent: Reminder set!

Title: Follow up with seller
Property: 123 Oak Street, Tampa FL
When: Friday, January 18 at 2:30 PM

You'll receive a notification when it's time.
```

### Reminder with specific time

```
You: Remind me to call John tomorrow at 9am

Agent: Reminder set!

Title: Call John
When: Tomorrow (Thursday) at 9:00 AM

I'll notify you when it's time.
```

### More reminder examples

```
You: Remind me about the inspection next Monday

You: Set a reminder for the contract deadline in 5 days

You: Remind me to check on pending offers every morning at 8am
```

### Schedule a report

```
You: Send me a pipeline report every Monday morning

Agent: Scheduled report created!

Report: Deal Pipeline Summary
Frequency: Weekly (every Monday)
Time: 8:00 AM
Delivery: Email

You'll receive your first report next Monday.

The report will include:
- Active deals by stage
- Deals that need attention
- Offers pending response
- Upcoming deadlines
```

### View scheduled tasks

```
You: What do I have scheduled?

Agent: Your Scheduled Tasks (8 items):

Reminders:
1. Follow up with seller - Friday at 2:30 PM
2. Call John - Tomorrow at 9:00 AM
3. Contract deadline - January 22

Recurring Reports:
4. Pipeline Report - Every Monday 8:00 AM
5. Market Summary - Every Friday 5:00 PM

Scheduled Actions:
6. Re-score Tampa properties - Tomorrow 6:00 AM
7. Send deal to funds - Monday 9:00 AM
8. Check offer status - Daily at 10:00 AM
```

### Cancel a scheduled task

```
You: Cancel the reminder about calling John

Agent: Reminder cancelled.

"Call John" scheduled for tomorrow at 9:00 AM has been removed.
```

### Reschedule a task

```
You: Move the seller follow-up to next week

Agent: Rescheduled!

Task: Follow up with seller
Previous: Friday, January 18 at 2:30 PM
New: Friday, January 25 at 2:30 PM

Moved forward by 7 days.
```

---

## 10. Calendar & Showings

Manage your calendar, schedule property showings, and set deadlines.

### Schedule a showing

```
You: Schedule a showing for 123 Oak Street tomorrow at 2pm

Agent: Showing scheduled!

Property: 123 Oak Street, Tampa FL
When: Tomorrow (Thursday) at 2:00 PM
Duration: 1 hour

Calendar event created.
Would you like to invite anyone else?
```

### Schedule showing with attendees

```
You: Schedule a showing at 456 Pine Ave Friday at 10am with Sarah and the buyer john@example.com

Agent: Showing scheduled!

Property: 456 Pine Avenue, Austin TX
When: Friday at 10:00 AM
Duration: 1 hour

Attendees invited:
- Sarah Johnson (sarah@company.com)
- john@example.com

Calendar invites sent to all attendees.
```

### Create a deadline

```
You: Add a deadline for the inspection period on 123 Oak Street - due January 25th

Agent: Deadline created!

Property: 123 Oak Street
Deadline: Inspection Period
Due: January 25, 2026

Reminders set for:
- 3 days before (January 22)
- 1 day before (January 24)

Added to your calendar.
```

### View your calendar

```
You: What's on my calendar this week?

Agent: Your Calendar - This Week (8 events):

Today (Wednesday):
- 10:00 AM - Showing: 789 Elm Dr, Miami
- 2:00 PM - Call with buyer

Tomorrow (Thursday):
- 9:00 AM - Team meeting
- 2:00 PM - Showing: 123 Oak St, Tampa

Friday:
- 10:00 AM - Showing: 456 Pine Ave, Austin
- 3:00 PM - Contract signing (DocuSeal)

Saturday:
- 11:00 AM - Open house: 234 Cedar Ln

Deadlines this week:
- January 25 - Inspection period (123 Oak St)
```

### Find available time

```
You: When am I free for a 1-hour meeting this week?

Agent: Available Time Slots (1 hour):

Tomorrow (Thursday):
- 11:00 AM - 12:00 PM
- 3:30 PM - 5:00 PM

Friday:
- 1:00 PM - 3:00 PM

Saturday:
- 2:00 PM - 5:00 PM

Would you like me to schedule something?
```

### Reschedule an event

```
You: Move the Tampa showing to 3pm instead

Agent: Event rescheduled!

Showing: 123 Oak Street, Tampa
Previous: Thursday at 2:00 PM
New: Thursday at 3:00 PM

All attendees have been notified.
```

---

## 11. Contracts & E-Signatures

Send contracts for electronic signature using DocuSeal.

### See available templates

```
You: What contract templates do we have?

Agent: Available Contract Templates (6):

1. Purchase Agreement (Standard)
   - Fields: Buyer, Seller, Property, Price, Closing Date

2. Assignment Contract
   - Fields: Assignor, Assignee, Property, Fee

3. Wholesale Agreement
   - Fields: Seller, Buyer, Property, Terms

4. Option Agreement
   - Fields: Optionor, Optionee, Property, Option Fee

5. Inspection Addendum
   - Fields: Property, Inspection Period, Contingencies

6. Proof of Funds Letter
   - Fields: Buyer Name, Amount, Bank
```

### Send a contract

```
You: Send a purchase agreement to john@example.com for 123 Oak Street at $175,000

Agent: Contract sent for signature!

Template: Purchase Agreement
Property: 123 Oak Street, Tampa FL
Price: $175,000

Sent to:
- john@example.com (Buyer)

Status: Awaiting signature
Expires: 7 days

Submission ID: sub_abc123

The recipient will receive an email with a link to sign.
```

### Send to multiple signers

```
You: Send the assignment contract to buyer@example.com and seller@example.com

Agent: Contract sent for signatures!

Template: Assignment Contract
Property: 123 Oak Street

Recipients:
1. buyer@example.com - Role: Buyer (will sign first)
2. seller@example.com - Role: Seller (will sign second)

Status: Awaiting signatures
Both parties will receive email invitations.
```

### Check contract status

```
You: What's the status of the contract I sent to John?

Agent: Contract Status:

Submission: sub_abc123
Template: Purchase Agreement
Property: 123 Oak Street

Recipients:
- john@example.com: SIGNED (January 15 at 3:45 PM)
- seller@example.com: PENDING (not yet viewed)

Overall Status: Partially Complete
Waiting for: seller@example.com

Would you like me to send a reminder?
```

### Send a reminder

```
You: Send a reminder to the seller to sign the contract

Agent: Reminder sent!

Contract: Purchase Agreement - 123 Oak Street
Recipient: seller@example.com
Status: Reminder delivered

They should receive the email shortly.
```

---

## 12. Automating Your Workflow

Set up automations to handle repetitive tasks automatically.

### View your automations

```
You: What automations do I have set up?

Agent: Your Automations (5 active):

1. "New Deal Alert" - ENABLED
   Trigger: When a new deal is added
   Action: Send email notification
   Last run: 2 hours ago

2. "High Score Auto-Submit" - ENABLED
   Trigger: When deal scores 85%+ on buy box
   Action: Auto-submit to fund
   Last run: Yesterday

3. "Daily Pipeline Report" - ENABLED
   Trigger: Daily at 8:00 AM
   Action: Generate and send report
   Last run: This morning

4. "Offer Expiring Alert" - ENABLED
   Trigger: When offer expires in 24 hours
   Action: Send SMS reminder
   Last run: 3 days ago

5. "Stage Change Notification" - DISABLED
   Trigger: When deal stage changes
   Action: Send team email
```

### Create an automation

```
You: Create an automation to email me when a deal scores over 90%

Agent: Automation created!

Name: High Score Alert
Trigger: When deal scores 90%+ on any buy box
Action: Send email to you

Settings:
- Enabled: Yes
- Cooldown: 1 hour (won't spam you)

You'll now get an email whenever a hot deal comes in!
```

### Create automation with details

```
You: When a deal in Florida gets added, automatically score it and send to Blackstone if it matches 80%+

Agent: Automation created!

Name: Florida Deal Auto-Submit
Trigger: New deal in Florida
Conditions:
- State = FL
- Blackstone buy box score >= 80%
Actions:
1. Score against all buy boxes
2. Submit to Blackstone fund

This automation will run automatically for all new FL deals.
```

### Turn off an automation

```
You: Disable the stage change notification

Agent: Automation disabled.

"Stage Change Notification" is now OFF.

You won't receive notifications when deal stages change.
Turn it back on anytime by saying "enable stage change notification".
```

### View automation history

```
You: Show me what automations ran today

Agent: Automation History (Today):

1. 8:00 AM - "Daily Pipeline Report"
   Status: Success
   Action: Sent email with 12 active deals

2. 9:15 AM - "New Deal Alert"
   Status: Success
   Trigger: New deal added (789 Elm Dr)
   Action: Sent notification email

3. 10:30 AM - "High Score Auto-Submit"
   Status: Success
   Trigger: 123 Oak St scored 92%
   Action: Submitted to Blackstone

4. 2:45 PM - "New Deal Alert"
   Status: Success
   Trigger: New deal added (456 Pine Ave)
   Action: Sent notification email

Total executions today: 4
All successful!
```

---

## 13. Working with Files

Upload and analyze documents like PDFs, CSVs, and spreadsheets.

### Analyze a document

```
You: [Uploads property_list.csv] Analyze this file

Agent: File Analysis: property_list.csv

Type: CSV (Comma Separated Values)
Size: 245 KB
Rows: 150
Columns: 12

Column Headers:
- Address, City, State, ZIP
- Price, Bedrooms, Bathrooms, Sqft
- ARV, Rehab_Cost, Status, Source

Summary:
- 150 properties total
- States: TX (45), FL (38), GA (32), NC (20), Other (15)
- Price range: $125,000 - $425,000
- Average price: $234,500

Would you like me to import these properties?
```

### Extract data from a table

```
You: Show me the properties from that CSV

Agent: Properties from property_list.csv (first 10):

| Address          | City    | State | Price    | Beds | ARV      |
|------------------|---------|-------|----------|------|----------|
| 123 Main St      | Austin  | TX    | $225,000 | 3    | $295,000 |
| 456 Oak Ave      | Tampa   | FL    | $185,000 | 4    | $245,000 |
| 789 Elm Dr       | Atlanta | GA    | $195,000 | 3    | $260,000 |
| 234 Pine St      | Dallas  | TX    | $275,000 | 4    | $350,000 |
| 567 Cedar Ln     | Miami   | FL    | $310,000 | 3    | $385,000 |
...

Showing 10 of 150 rows. Would you like to see more?
```

### Summarize a document

```
You: [Uploads contract.pdf] Summarize this contract

Agent: Contract Summary:

Document: Purchase Agreement
Pages: 8
Date: January 10, 2026

Key Terms:
- Property: 123 Oak Street, Tampa FL 33601
- Purchase Price: $175,000
- Earnest Money: $5,000
- Closing Date: February 15, 2026
- Contingencies: Inspection (10 days), Financing (21 days)

Parties:
- Buyer: ABC Investments LLC
- Seller: John Smith

Important Dates:
- Inspection deadline: January 20, 2026
- Financing contingency: January 31, 2026
- Closing: February 15, 2026

Notes:
- Seller to provide clear title
- Property sold as-is
- Buyer pays closing costs
```

---

## 14. Your Portfolio

Track properties you own and monitor your investment performance.

### Add to portfolio

```
You: Add 123 Oak Street to my portfolio - I bought it for $175,000

Agent: Property added to portfolio!

Address: 123 Oak Street, Tampa FL
Acquisition Price: $175,000
Acquisition Date: Today
Status: Holding

Current Estimated Value: $245,000
Equity: $70,000 (40%)

Would you like to add:
- Monthly rent amount?
- Rehab costs?
- Monthly expenses?
```

### Add with rental info

```
You: I bought 456 Pine Ave for $280k, renting for $2,200/month, expenses are $800/month

Agent: Property added to portfolio!

Address: 456 Pine Avenue, Austin TX
Acquisition Price: $280,000
Status: Renting

Rental Performance:
- Monthly Rent: $2,200
- Monthly Expenses: $800
- Monthly Cash Flow: $1,400
- Annual Cash Flow: $16,800
- Cash-on-Cash Return: 6%

Added to your portfolio!
```

### View your portfolio

```
You: Show me my portfolio

Agent: Your Portfolio (8 properties):

Total Value: $2,150,000
Total Invested: $1,680,000
Total Equity: $470,000

Properties:

RENTING (5):
1. 123 Oak St, Tampa - Value: $245k | Cash Flow: $850/mo
2. 456 Pine Ave, Austin - Value: $340k | Cash Flow: $1,400/mo
3. 789 Elm Dr, Miami - Value: $295k | Cash Flow: $950/mo
4. 234 Cedar Ln, Orlando - Value: $275k | Cash Flow: $720/mo
5. 567 Maple Ct, Dallas - Value: $310k | Cash Flow: $1,100/mo

RENOVATING (2):
6. 890 Birch Rd, Houston - Value: $380k | Rehab 60% complete
7. 321 Spruce Way, Tampa - Value: $195k | Rehab starting

HOLDING (1):
8. 654 Willow St, Austin - Value: $110k | Listed for sale

Monthly Cash Flow: $5,020
Annual Cash Flow: $60,240
Average ROI: 8.2%
```

### Get portfolio value

```
You: What's my portfolio worth?

Agent: Portfolio Value Summary:

Total Properties: 8
Total Market Value: $2,150,000

Breakdown:
- Total Invested: $1,680,000
- Total Equity: $470,000 (28%)
- Appreciation: $470,000 since purchase

By Status:
- Renting: $1,465,000 (5 properties)
- Renovating: $575,000 (2 properties)
- Holding: $110,000 (1 property)

By State:
- Texas: $760,000 (3 properties)
- Florida: $735,000 (3 properties)
- Georgia: $295,000 (1 property)
- Louisiana: $360,000 (1 property)

Your portfolio has grown 28% since you started!
```

### Update property value

```
You: Update 123 Oak Street value to $265,000 based on a new appraisal

Agent: Property value updated!

Property: 123 Oak Street, Tampa FL
Previous Value: $245,000
New Value: $265,000
Change: +$20,000 (+8.2%)

Source: Appraisal
Updated: Today

New equity: $90,000 (from $70,000)
Your portfolio total is now $2,170,000.
```

---

## 15. Knowledge Base

Search your company's documents, guides, and contracts.

### Search for information

```
You: What are the disclosure requirements in Texas?

Agent: Texas Disclosure Requirements:

From: Texas Real Estate Commission Guidelines (knowledge base)

Required Disclosures:
1. Seller's Disclosure Notice
   - Required for most residential sales
   - Must disclose known material defects
   - Exemptions: foreclosures, new construction

2. Lead-Based Paint Disclosure
   - Required for homes built before 1978
   - 10-day inspection period required

3. MUD/PID Disclosure
   - Required if property is in Municipal Utility District
   - Must disclose tax rates and boundaries

4. HOA Information
   - Resale certificate required
   - Buyer has 3-day cancellation right

Timing:
- Disclosures must be provided before contract execution
- Buyer has right to terminate within 7 days

Source: "Texas Disclosure Requirements.pdf" (uploaded March 2024)
```

### More knowledge search examples

```
You: How do I structure a subject-to deal?

You: What's our company policy on earnest money?

You: Find information about 1031 exchanges

You: What are the closing costs in Florida?
```

### Knowledge base stats

```
You: What's in our knowledge base?

Agent: Knowledge Base Statistics:

Total Documents: 127
Last Updated: Yesterday

Categories:
- State Regulations: 42 documents
- Contract Templates: 23 documents
- Company Policies: 18 documents
- Training Guides: 15 documents
- Market Reports: 12 documents
- Legal Documents: 10 documents
- Other: 7 documents

Most Searched:
1. Disclosure requirements
2. Assignment contracts
3. Due diligence checklist
4. Closing procedures
5. Wholesaling laws by state

Need help finding something specific?
```

---

## 16. Agent Memory

The agent can remember your preferences and context for better assistance.

### Tell the agent your preferences

```
You: Remember that I prefer cash deals and don't like condos

Agent: Got it! I'll remember:

Preferences saved:
1. "Prefers cash deals" - High importance
2. "Does not like condos" - High importance

I'll keep these in mind when suggesting deals and
filter out condos from my recommendations.
```

### More things to remember

```
You: Remember that my minimum ROI threshold is 15%

You: Remember that I focus on the Tampa Bay market

You: Remember that Sarah handles all our underwriting

You: Remember we don't do deals under $100k
```

### Check what the agent remembers

```
You: What do you remember about me?

Agent: Here's what I remember about your preferences:

Investment Preferences:
- Prefers cash deals
- Minimum ROI threshold: 15%
- Does not like condos
- No deals under $100k

Market Focus:
- Primary market: Tampa Bay area
- Also interested in: Orlando, Jacksonville

Team:
- Sarah handles underwriting
- George handles closings
- Preferred title company: First American

These help me give you better recommendations!
```

### Clear memories

```
You: Forget my preference about condos

Agent: Memory cleared!

I've removed "Does not like condos" from your preferences.

I'll now include condos in property searches again.
```

---

## 17. Bulk Operations

Handle multiple properties at once for efficiency.

### Analyze multiple deals

```
You: Analyze properties 123, 456, 789, and 234

Agent: Batch Analysis Complete (4 properties):

Results:

1. Property 123 - 123 Oak St, Tampa
   Score: 87/100 - STRONG BUY
   ROI: 22% | MAO: $146k | Asking: $185k

2. Property 456 - 456 Pine Ave, Austin
   Score: 74/100 - CONSIDER
   ROI: 15% | MAO: $243k | Asking: $280k

3. Property 789 - 789 Elm Dr, Miami
   Score: 62/100 - NEGOTIATE
   ROI: 12% | MAO: $278k | Asking: $310k

4. Property 234 - 234 Cedar Ln, Orlando
   Score: 45/100 - PASS
   ROI: 6% | MAO: $168k | Asking: $195k

Summary:
- Strong buys: 1
- Worth considering: 1
- Needs negotiation: 1
- Pass: 1

Best opportunity: 123 Oak St (22% ROI)
```

### Score multiple properties

```
You: Score all our Tampa properties against buy boxes

Agent: Batch Scoring Complete (8 Tampa properties):

Strong Matches (80%+):
1. 123 Oak St - Blackstone (94%), Invitation Homes (88%)
2. 321 Spruce Way - Blackstone (86%)
3. 654 Palm Dr - American Homes (82%)

Moderate Matches (60-79%):
4. 789 Beach Rd - Tricon (72%)
5. 456 Bay St - Progress (68%)

No Strong Matches:
6. 234 Gulf Blvd - Best: 45% (price too high)
7. 567 Harbor Ln - Best: 38% (too old)
8. 890 Sunset Dr - Best: 32% (wrong property type)

3 properties ready for auto-submit to funds.
Would you like me to submit them?
```

### Bulk update properties

```
You: Mark properties 123, 456, and 789 as "hot leads"

Agent: Bulk Update Complete!

Updated 3 properties:
- 123 Oak St - Status: Hot Lead ✓
- 456 Pine Ave - Status: Hot Lead ✓
- 789 Elm Dr - Status: Hot Lead ✓

All properties now tagged as hot leads.
```

### Export properties

```
You: Export all our Florida properties to CSV

Agent: Export Complete!

Exported: 38 Florida properties
Format: CSV
File size: 156 KB

Columns included:
- Address, City, State, ZIP
- Price, ARV, Beds, Baths, Sqft
- Status, Score, Added Date

Download ready!

[Download florida_properties.csv]
```

---

## 18. Settings

Configure your preferences and system settings.

### View settings

```
You: Show me my settings

Agent: Your Settings:

Notifications:
- Email alerts: ON
- SMS alerts: OFF
- Daily digest: ON (8:00 AM)

Automation:
- Auto-submit to funds: ON (85% threshold)
- Auto-score new deals: ON
- Auto-enrich with Zillow: ON

Display:
- Default view: Pipeline
- Results per page: 20
- Timezone: America/New_York

Integrations:
- Email: Connected (Gmail)
- Calendar: Connected (Google)
- DocuSeal: Connected
- Twilio: Not configured
```

### Change a setting

```
You: Turn on SMS alerts

Agent: Setting updated!

SMS Alerts: ON

You'll now receive text messages for:
- Offer responses
- Contract signatures
- Urgent deal alerts

Make sure your phone number is set in your profile.
```

### More settings examples

```
You: Change my timezone to Pacific

You: Set auto-submit threshold to 90%

You: Turn off the daily digest

You: Set default results to 50 per page
```

---

## Quick Reference

### Common Commands

| What you want | What to say |
|---------------|-------------|
| Find properties | "Find 3-bed houses in Tampa under $200k" |
| Analyze a deal | "Analyze 123 Oak Street" |
| Make an offer | "Offer $175k on property 123" |
| Email someone | "Email john@example.com about the Tampa deal" |
| Email the team | "Email Ed and Sarah about tomorrow's meeting" |
| Set a reminder | "Remind me to call the seller in 2 days" |
| Schedule showing | "Schedule a showing tomorrow at 2pm" |
| Check pipeline | "Show me my pipeline" |
| See my team | "Who's on my team?" |
| Add team member | "Add John Smith as an Acquisitions Manager" |
| Send contract | "Send purchase agreement to buyer@example.com" |
| Get market data | "Look up market data for 123 Main Street" |
| Search knowledge | "What are disclosure requirements in Texas?" |

### The agent understands natural language

You don't need to use exact commands. These all work:

```
"What properties do we have in Florida?"
"Show me Florida properties"
"Find deals in FL"
"Any houses in Florida?"
```

```
"Set a reminder for Friday"
"Remind me on Friday"
"Don't let me forget about Friday"
"I need to remember something for Friday"
```

```
"Email the team"
"Send a message to everyone"
"Notify Ed and Sarah"
"Message the acquisitions team"
```

---

## Need Help?

Just ask! The agent can explain any feature:

```
You: How do I use the pipeline?

You: What can you help me with?

You: Explain buy boxes

You: How do automations work?
```

---

*Your AI assistant is here to help you close more deals, faster.*
