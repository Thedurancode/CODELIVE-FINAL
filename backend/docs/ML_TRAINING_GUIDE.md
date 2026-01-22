# ML Scoring Engine Training Guide

This guide explains how to train and manage the ML-enhanced scoring engine for Dispotree.

## Overview

The ML scoring engine uses TensorFlow.js to learn from historical deal outcomes and improve scoring accuracy. It operates in three phases:

| Phase | Data Count | ML Behavior |
|-------|------------|-------------|
| Cold Start | 0-99 | Returns neutral scores, collects data |
| Initial Training | 100-499 | First model trained, 20% weight in scoring |
| Full Integration | 500+ | Full ML integration, 30% weight |

---

## 1. Data Collection

### Automatic Data Sources

The system automatically collects training data from three sources:

#### A. Fund Feedback (Primary)
When funds respond to deal submissions:
```bash
# Record fund feedback via API
curl -X POST http://localhost:3001/api/ml/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "dealId": "deal-123",
    "buyBoxId": "buybox-456",
    "fundName": "Acme Capital",
    "responseType": "offer_accepted",
    "submissionScore": 85,
    "dealSnapshot": {
      "price": 250000,
      "arv": 350000,
      "state": "FL",
      "propertyType": "single_family",
      "bedrooms": 3,
      "bathrooms": 2
    }
  }'
```

**Response Types:**
- `offer_accepted` - Positive outcome (fund accepted)
- `closed` - Positive outcome (deal closed)
- `passed` - Negative outcome (fund rejected)
- `no_response` - Negative after 14 days stale
- `interested` - Pending (not used for training)
- `offer_made` - Pending (not used for training)

#### B. Deal Actions
User interactions with deals (automatic):
- `like` - Positive signal
- `pass` - Negative signal
- `offer` - Strong positive signal

#### C. Deal Offers
Offer outcomes (automatic):
- `accepted` - Positive
- `rejected` - Negative

### Check Training Readiness

```bash
# Check how much data you have
curl http://localhost:3001/api/ml/readiness | jq .
```

Response:
```json
{
  "success": true,
  "data": {
    "ready": false,
    "dataCount": 18,
    "needed": 82,
    "breakdown": {
      "fundFeedback": 0,
      "dealActions": 18,
      "dealOffers": 0
    }
  }
}
```

---

## 2. Training Process

### Prerequisites

Before training can begin:
- Minimum **100 labeled outcomes** required
- At least some positive AND negative outcomes
- Diverse deal types recommended

### Check Training Status

```bash
curl http://localhost:3001/api/ml/training/status | jq .
```

Response when ready:
```json
{
  "success": true,
  "data": {
    "canTrain": true,
    "reason": "Ready to train with 150 samples",
    "dataCount": 150
  }
}
```

### Trigger Training

```bash
# Train the deal quality model
curl -X POST http://localhost:3001/api/ml/training/trigger \
  -H "Content-Type: application/json" \
  -d '{"modelType": "deal_quality"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Training complete. Model v1.0.0 created with AUC 0.782",
    "runId": "v1.0.0"
  }
}
```

### Model Types

| Model Type | Purpose | Status |
|------------|---------|--------|
| `deal_quality` | Predict if a deal will succeed | Active |
| `fund_match` | Match deals to best funds | Planned |
| `close_probability` | Predict close likelihood | Planned |

---

## 3. Training Configuration

### Neural Network Architecture

```
Input (82 features)
    ↓
Dense(64, ReLU) + Dropout(0.3)
    ↓
Dense(32, ReLU) + Dropout(0.2)
    ↓
Dense(16, ReLU)
    ↓
Dense(1, Sigmoid) → Success probability
```

### Training Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Epochs | 100 | Training iterations |
| Batch Size | 32 | Samples per batch |
| Learning Rate | 0.001 | Adam optimizer rate |
| Validation Split | 0.15 | Data held for validation |
| Early Stopping | Yes | Stop if no improvement |
| Patience | 10 | Epochs to wait |

### Quality Threshold

Models must achieve **AUC > 0.65** to be deployed. Lower quality models are rejected.

---

## 4. Model Management

### List All Models

```bash
curl http://localhost:3001/api/ml/models | jq .
```

### Get Active Model

```bash
curl http://localhost:3001/api/ml/models/deal_quality/active | jq .
```

Response:
```json
{
  "success": true,
  "data": {
    "version": "v1.0.0",
    "modelType": "deal_quality",
    "status": "active",
    "isProduction": true,
    "trainingDataCount": 150,
    "metrics": {
      "accuracy": 0.78,
      "auc": 0.82,
      "precision": 0.75,
      "recall": 0.81
    },
    "createdAt": "2024-12-19T03:00:00.000Z"
  }
}
```

### Promote a Model to Production

```bash
# Promote a specific version
curl -X POST http://localhost:3001/api/ml/models/deal_quality/promote/v2.0.0
```

### View Training History

```bash
curl http://localhost:3001/api/ml/training/runs | jq .
```

---

## 5. Automatic Retraining

The system automatically checks for retraining needs daily at 3 AM.

### Retraining Triggers

| Trigger | Threshold | Description |
|---------|-----------|-------------|
| New Data | 50+ outcomes | New labeled data since last training |
| Model Age | 30 days | Model becomes stale |
| Performance Drop | 10% | Accuracy degradation detected |

### Auto-Promotion Rules

New models are automatically promoted if:
1. AUC is higher than current production model
2. Meets minimum quality threshold (0.65)

---

## 6. Feature Engineering

### Input Features (22 total)

**Numeric Features (15):**
- `price`, `arv`, `sqft`, `yearBuilt`, `bedrooms`, `bathrooms`
- `photoCount`, `repairEstimate`, `monthlyRent`
- Derived: `pricePerSqft`, `arvToPrice`, `equityPercent`, `propertyAge`, `repairRatio`, `rentRatio`

**Categorical Features (one-hot encoded):**
- `state` (50 dimensions)
- `propertyType` (10 dimensions)
- `occupancyStatus` (5 dimensions)

**Buy Box Match Features (5):**
- State match, price in range, bedrooms match, year match, type match

### Normalization

Features are z-score normalized:
```
normalized = (value - mean) / std_dev
```

Normalization parameters are saved with each model for consistent inference.

---

## 7. Monitoring & Insights

### Prediction Analytics

```bash
curl http://localhost:3001/api/ml/insights/predictions | jq .
```

Shows accuracy by confidence bucket:
```json
{
  "totalPredictions": 500,
  "withOutcomes": 120,
  "accuracyByBucket": [
    {"range": "0-20%", "accuracy": 15.2, "count": 10},
    {"range": "20-40%", "accuracy": 28.5, "count": 15},
    {"range": "40-60%", "accuracy": 52.3, "count": 30},
    {"range": "60-80%", "accuracy": 71.8, "count": 40},
    {"range": "80-100%", "accuracy": 88.4, "count": 25}
  ],
  "overallAccuracy": 68.5
}
```

### Deal-Level Insights

```bash
curl http://localhost:3001/api/ml/insights/deal/deal-123 | jq .
```

---

## 8. Troubleshooting

### Common Issues

**"Need X more labeled outcomes"**
- Solution: Collect more fund feedback or wait for user interactions

**"Model AUC below threshold"**
- Cause: Data quality issues or imbalanced classes
- Solution: Review training data, ensure mix of positive/negative outcomes

**"No active model found"**
- Cause: No model trained yet or training failed
- Solution: Check `/api/ml/training/status` and trigger training when ready

### Check ML Service Status

```bash
curl http://localhost:3001/api/ml/status | jq .
```

### View Logs

The ML service logs to console with `[ML]` prefix:
```
[ML Service] Initializing...
[ML] Loaded deal_quality model version v1.0.0
[ML Plugin] Initialized successfully
```

---

## 9. Best Practices

1. **Quality Data First**: Focus on accurate fund feedback over quantity
2. **Balance Classes**: Aim for 40-60% positive outcomes
3. **Diverse Deals**: Include variety of property types, states, price ranges
4. **Regular Monitoring**: Check accuracy metrics weekly
5. **Manual Review**: Review rejected predictions to improve data quality

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ml/status` | GET | Service status |
| `/api/ml/readiness` | GET | Training readiness |
| `/api/ml/feedback` | POST | Record fund feedback |
| `/api/ml/training/status` | GET | Can train? |
| `/api/ml/training/trigger` | POST | Start training |
| `/api/ml/training/runs` | GET | Training history |
| `/api/ml/models` | GET | List all models |
| `/api/ml/models/:type/active` | GET | Active model info |
| `/api/ml/models/:type/promote/:version` | POST | Promote model |
| `/api/ml/insights/predictions` | GET | Prediction analytics |
| `/api/ml/insights/deal/:dealId` | GET | Deal ML insights |
