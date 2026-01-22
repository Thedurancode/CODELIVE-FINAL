# ML Training Data Guide

This guide explains how to prepare training data for the Dispotree Deal Quality ML model.

## Overview

The ML model predicts **deal success probability** - whether a deal will be accepted by a fund and close successfully. It uses an 85-dimension feature vector extracted from deal data.

## Minimum Requirements

| Requirement | Value | Notes |
|-------------|-------|-------|
| **Minimum samples** | 100 | Model won't train with fewer |
| **Recommended samples** | 500+ | Better accuracy |
| **Positive/Negative ratio** | 30-70% positive | Balanced datasets work best |
| **Required fields** | 14 | See "Required Fields" section |

---

## CSV Columns Explained

### Core Deal Information (REQUIRED)

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `deal_id` | string | "deal-001" | Unique identifier |
| `asking_price` | number | 185000 | Current asking price in USD |
| `arv` | number | 265000 | After Repair Value estimate |
| `sqft` | number | 1850 | Living space square footage |
| `year_built` | number | 1998 | Year property was built |
| `bedrooms` | number | 3 | Bedroom count |
| `bathrooms` | number | 2 | Bathroom count (can be decimal: 2.5) |
| `repair_estimate` | number | 35000 | Estimated rehab cost |
| `state` | string | "FL" | 2-letter state code |
| `property_type` | string | "single_family" | See property types below |

### Location Details (RECOMMENDED)

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `street` | string | "123 Oak Lane" | Street address |
| `city` | string | "Orlando" | City name |
| `zip` | string | "32801" | ZIP code |

### Rental & Market Data (RECOMMENDED)

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `monthly_rent` | number | 1800 | Expected monthly rent |
| `days_on_market` | number | 14 | Days since listing |
| `photo_count` | number | 12 | Number of listing photos |

### Property Condition (RECOMMENDED)

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `occupancy_status` | string | "vacant" | vacant, occupied, unknown |
| `condition` | string | "good" | excellent, good, fair, poor |

### Fund Response (REQUIRED FOR TRAINING)

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `fund_name` | string | "Tricon Residential" | Fund that received deal |
| `buy_box_id` | string | "bb-tricon-001" | Buy box ID used for scoring |
| `submission_score` | number | 87.5 | Score when submitted (0-100) |
| `response_type` | string | "offer_accepted" | See response types below |
| `offer_amount` | number | 178000 | Fund's offer (if made) |

### Win/Loss Analysis (RECOMMENDED)

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `loss_category` | string | "price" | Why deal was lost (see categories) |
| `win_factors` | string | "quick_close;good_comps" | Semicolon-separated success factors |
| `lessons_learned` | string | "text" | Notes for future reference |

### Image Analysis (OPTIONAL)

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `image_quality_score` | number | 75 | Overall image quality (0-100) |
| `image_condition` | string | "good" | Visual condition assessment |
| `has_updated_kitchen` | 0/1 | 1 | Kitchen appears updated |
| `has_hardwood` | 0/1 | 1 | Has hardwood floors |
| `has_natural_light` | 0/1 | 1 | Good natural lighting |
| `has_damage` | 0/1 | 0 | Visible damage in photos |
| `needs_repair` | 0/1 | 0 | Obvious repairs needed |
| `is_dated` | 0/1 | 0 | Appears dated/outdated |

---

## Valid Values

### Property Types
```
single_family, condo, townhouse, multi_family,
duplex, triplex, quadplex, manufactured, land, other
```

### Response Types (Training Labels)
| Response | Label | Description |
|----------|-------|-------------|
| `closed` | **POSITIVE (1)** | Deal closed successfully |
| `offer_accepted` | **POSITIVE (1)** | Offer accepted, heading to close |
| `offer_made` | neutral | Fund made offer (wait for outcome) |
| `interested` | neutral | Fund expressed interest |
| `passed` | **NEGATIVE (0)** | Fund passed on deal |
| `no_response` | **NEGATIVE (0)** | No response after 14+ days |

### Loss Categories
```
price, condition, location, competition, timing, financing, other
```

### Win Factors (examples)
```
quick_close, good_comps, below_market_rent, tenant_quality,
newer_build, low_rehab, good_schools, premium_location,
turnkey, growing_market, cash_flow, appreciation
```

### Occupancy Status
```
vacant, occupied, unknown
```

### Condition
```
excellent, good, fair, poor
```

### US States (2-letter codes)
```
AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA,
ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK,
OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY, DC
```

---

## Feature Engineering (What the Model Calculates)

The model automatically calculates these derived features:

| Derived Feature | Formula |
|-----------------|---------|
| Price per sqft | `asking_price / sqft` |
| ARV to price ratio | `arv / asking_price` |
| Equity percentage | `((arv - asking_price) / arv) * 100` |
| Property age | `current_year - year_built` |
| Repair to price ratio | `repair_estimate / asking_price` |
| Rent to price ratio | `(monthly_rent * 12) / asking_price` |

---

## Data Quality Tips

### For Better Model Accuracy:

1. **Include both wins and losses** - Don't just log successful deals
2. **Be honest about loss reasons** - Helps model learn patterns
3. **Include edge cases** - Very cheap, very expensive, poor condition
4. **Geographic diversity** - Include multiple states/markets
5. **Property type diversity** - Don't just do single family
6. **Record actual outcomes** - Update `response_type` when deals close

### Common Mistakes to Avoid:

1. **Only logging winners** - Model needs negative examples
2. **Missing ARV** - Critical for ROI calculation
3. **Missing repair estimates** - Affects MAO calculation
4. **Inconsistent state codes** - Use 2-letter codes only
5. **Missing response outcomes** - Wait for deal resolution

---

## How to Import Training Data

### Option 1: API Endpoint
```bash
POST /api/ml/training/import
Content-Type: multipart/form-data

file: ml_training_data.csv
```

### Option 2: Direct Database Insert
```sql
INSERT INTO fund_feedback (
  deal_id, buy_box_id, fund_name, submitted_at, submission_score,
  response_type, offer_amount, deal_snapshot
) VALUES (
  'deal-001', 'bb-tricon-001', 'Tricon Residential', NOW(), 87.5,
  'offer_accepted', 178000,
  '{"price": 185000, "arv": 265000, "state": "FL", ...}'::jsonb
);
```

### Option 3: Agent Command
```
"Import this training data from /path/to/ml_training_data.csv"
```

---

## Training the Model

Once you have 100+ samples:

### Via API:
```bash
POST /api/ml/train
{
  "minSamples": 100,
  "validationSplit": 0.2,
  "epochs": 100,
  "patience": 10
}
```

### Via Agent:
```
"Train the ML model with the latest feedback data"
```

### Via CLI:
```bash
npm run train:ml
```

---

## Model Output

After training, the model provides:

| Metric | Description | Good Value |
|--------|-------------|------------|
| Accuracy | Overall correctness | > 70% |
| Precision | True positives / predicted positives | > 65% |
| Recall | True positives / actual positives | > 60% |
| F1 Score | Harmonic mean of precision/recall | > 62% |
| AUC | Area under ROC curve | > 0.70 |

---

## Example: Building Your Dataset

### Step 1: Log Every Deal Submission
When you send a deal to a fund, create a FundFeedback record.

### Step 2: Track Responses
Update `response_type` when fund responds:
- They pass → `passed`
- They make offer → `offer_made`
- You accept offer → `offer_accepted`
- Deal closes → `closed`
- No response in 14 days → `no_response`

### Step 3: Analyze Losses
For passed deals, record:
- `loss_category`: Why did they pass?
- `lessons_learned`: What would you do differently?

### Step 4: Analyze Wins
For closed deals, record:
- `win_factors`: What made this deal successful?

### Step 5: Train Monthly
Once you have 100+ samples, train the model monthly to capture market changes.

---

## File Location

Save your training CSV to:
```
/backend/data/ml_training_data.csv
```

Example file provided:
```
/backend/data/ml_training_example.csv
```
