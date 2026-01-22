-- =====================================================
-- AI Agent System Tables
-- Migration 005: Create tables for AI agents and automation
-- =====================================================

-- 1. Compliance Checks Table
-- Stores AI-powered contract compliance analysis results
CREATE TABLE IF NOT EXISTS compliance_checks (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    check_type VARCHAR(50) NOT NULL, -- 'contract_analysis', 'seller_verification', 'entity_verification'
    status VARCHAR(20) NOT NULL CHECK (status IN ('Green', 'Yellow', 'Red')),
    issues JSONB DEFAULT '[]'::jsonb,
    extracted_data JSONB DEFAULT '{}'::jsonb,
    recommendations TEXT[],
    confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
    reviewed_by INTEGER, -- user_id if manually reviewed
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Hedge Fund Buy Boxes Table
-- Stores investment criteria for institutional buyers
CREATE TABLE IF NOT EXISTS hedge_fund_buyboxes (
    id SERIAL PRIMARY KEY,
    fund_name VARCHAR(255) NOT NULL,
    fund_type VARCHAR(100), -- 'Institutional', 'Family Office', 'REIT', 'Private Equity'
    criteria JSONB NOT NULL,
    -- Example criteria structure:
    -- {
    --   "states": ["TX", "FL", "GA"],
    --   "minBeds": 2, "maxBeds": 4,
    --   "minBaths": 1, "maxBaths": 3,
    --   "minPrice": 50000, "maxPrice": 300000,
    --   "minYearBuilt": 1950,
    --   "propertyTypes": ["Single Family", "Townhouse"],
    --   "mustHavePool": false,
    --   "noHOA": false,
    --   "preferVacant": true
    -- }
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_name VARCHAR(255),
    submission_method VARCHAR(50) DEFAULT 'email', -- 'email', 'api', 'portal'
    api_endpoint TEXT,
    api_key_encrypted TEXT,
    active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Higher priority = checked first
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Fund Submissions Table
-- Tracks property submissions to hedge funds
CREATE TABLE IF NOT EXISTS fund_submissions (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    fund_id INTEGER REFERENCES hedge_fund_buyboxes(id) ON DELETE CASCADE,
    match_score INTEGER CHECK (match_score >= 0 AND match_score <= 100),
    match_type VARCHAR(20) CHECK (match_type IN ('strong', 'moderate', 'weak')),
    submission_method VARCHAR(50), -- 'email', 'api', 'csv_download'
    submission_data JSONB, -- Data sent to fund
    submitted_at TIMESTAMP DEFAULT NOW(),
    response_received BOOLEAN DEFAULT false,
    response_received_at TIMESTAMP,
    response_type VARCHAR(50), -- 'interested', 'passed', 'offer_made', 'no_response'
    offer_amount DECIMAL(12, 2),
    offer_details JSONB,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'interested', 'passed', 'offer_made', 'accepted', 'rejected'
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Buyer Interactions Table
-- Tracks all buyer communications and engagement
CREATE TABLE IF NOT EXISTS buyer_interactions (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    buyer_id INTEGER, -- References users table (to be created)
    interaction_type VARCHAR(50) NOT NULL, -- 'view', 'question', 'offer', 'message', 'swipe_right', 'swipe_left'
    interaction_data JSONB,
    message_content TEXT,
    ai_response TEXT,
    response_time_seconds INTEGER,
    sentiment VARCHAR(20), -- 'positive', 'neutral', 'negative'
    flagged_for_review BOOLEAN DEFAULT false,
    flag_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Buyer Profiles Table
-- Stores buyer behavior metrics and history
CREATE TABLE IF NOT EXISTS buyer_profiles (
    id SERIAL PRIMARY KEY,
    buyer_email VARCHAR(255) UNIQUE NOT NULL,
    buyer_name VARCHAR(255),
    buyer_type VARCHAR(50), -- 'individual', 'investor', 'hedge_fund', 'flipper'
    total_views INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    total_offers INTEGER DEFAULT 0,
    total_closed_deals INTEGER DEFAULT 0,
    avg_offer_to_ask_ratio DECIMAL(5, 4), -- e.g., 0.9250 = 92.5%
    avg_response_time_hours DECIMAL(8, 2),
    preferred_states TEXT[],
    preferred_property_types TEXT[],
    min_price INTEGER,
    max_price INTEGER,
    cash_buyer BOOLEAN DEFAULT false,
    behavior_score INTEGER CHECK (behavior_score >= 0 AND behavior_score <= 100),
    tier VARCHAR(20) DEFAULT 'cold', -- 'hot', 'warm', 'cold'
    last_activity_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Property Enrichment Log
-- Tracks AI-powered data enrichment attempts
CREATE TABLE IF NOT EXISTS property_enrichment_log (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    data_source VARCHAR(100), -- 'zillow', 'attom', 'rentometer', 'google_maps'
    confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
    auto_applied BOOLEAN DEFAULT false,
    reviewed_by INTEGER, -- user_id
    created_at TIMESTAMP DEFAULT NOW()
);

-- 7. AI Agent Audit Log
-- Comprehensive logging of all AI agent actions
CREATE TABLE IF NOT EXISTS ai_agent_audit_log (
    id SERIAL PRIMARY KEY,
    agent_type VARCHAR(100) NOT NULL, -- 'compliance', 'underwriting', 'buybox', 'communication', 'guardrail'
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50), -- 'property', 'buyer', 'fund', 'conversation'
    entity_id INTEGER,
    input_data JSONB,
    output_data JSONB,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Compliance checks indexes
CREATE INDEX IF NOT EXISTS idx_compliance_property_id ON compliance_checks(property_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_checks(status);
CREATE INDEX IF NOT EXISTS idx_compliance_created_at ON compliance_checks(created_at DESC);

-- Buy boxes indexes
CREATE INDEX IF NOT EXISTS idx_buybox_active ON hedge_fund_buyboxes(active);
CREATE INDEX IF NOT EXISTS idx_buybox_priority ON hedge_fund_buyboxes(priority DESC);
CREATE INDEX IF NOT EXISTS idx_buybox_criteria_gin ON hedge_fund_buyboxes USING GIN(criteria);

-- Fund submissions indexes
CREATE INDEX IF NOT EXISTS idx_submission_property_id ON fund_submissions(property_id);
CREATE INDEX IF NOT EXISTS idx_submission_fund_id ON fund_submissions(fund_id);
CREATE INDEX IF NOT EXISTS idx_submission_status ON fund_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submission_match_score ON fund_submissions(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_submission_submitted_at ON fund_submissions(submitted_at DESC);

-- Buyer interactions indexes
CREATE INDEX IF NOT EXISTS idx_interaction_property_id ON buyer_interactions(property_id);
CREATE INDEX IF NOT EXISTS idx_interaction_buyer_id ON buyer_interactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_interaction_type ON buyer_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interaction_flagged ON buyer_interactions(flagged_for_review);
CREATE INDEX IF NOT EXISTS idx_interaction_created_at ON buyer_interactions(created_at DESC);

-- Buyer profiles indexes
CREATE INDEX IF NOT EXISTS idx_buyer_email ON buyer_profiles(buyer_email);
CREATE INDEX IF NOT EXISTS idx_buyer_tier ON buyer_profiles(tier);
CREATE INDEX IF NOT EXISTS idx_buyer_score ON buyer_profiles(behavior_score DESC);
CREATE INDEX IF NOT EXISTS idx_buyer_last_activity ON buyer_profiles(last_activity_at DESC);

-- Enrichment log indexes
CREATE INDEX IF NOT EXISTS idx_enrichment_property_id ON property_enrichment_log(property_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_field_name ON property_enrichment_log(field_name);
CREATE INDEX IF NOT EXISTS idx_enrichment_created_at ON property_enrichment_log(created_at DESC);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_agent_type ON ai_agent_audit_log(agent_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON ai_agent_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON ai_agent_audit_log(created_at DESC);

-- =====================================================
-- Sample Data for Testing
-- =====================================================

-- Insert sample hedge fund buy boxes
INSERT INTO hedge_fund_buyboxes (fund_name, fund_type, criteria, contact_email, contact_phone, contact_name, priority) VALUES
(
    'ABC Investments',
    'Institutional',
    '{
        "states": ["TX", "FL", "GA"],
        "minBeds": 2,
        "maxBeds": 4,
        "minBaths": 1,
        "maxBaths": 3,
        "minPrice": 50000,
        "maxPrice": 300000,
        "minYearBuilt": 1950,
        "propertyTypes": ["Single Family", "Townhouse"],
        "mustHavePool": false,
        "noHOA": false,
        "preferVacant": true
    }'::jsonb,
    'acquisitions@abcinvestments.com',
    '555-0123',
    'John Smith',
    1
),
(
    'XYZ Capital',
    'Family Office',
    '{
        "states": ["CA", "AZ", "NV"],
        "minBeds": 3,
        "maxBeds": 5,
        "minBaths": 2,
        "maxBaths": 4,
        "minPrice": 100000,
        "maxPrice": 500000,
        "minYearBuilt": 1980,
        "propertyTypes": ["Single Family", "Condo"],
        "mustHavePool": true,
        "noHOA": false,
        "preferVacant": false
    }'::jsonb,
    'deals@xyzcapital.com',
    '555-0456',
    'Sarah Johnson',
    2
),
(
    'Sunbelt Acquisitions',
    'REIT',
    '{
        "states": ["NC", "SC", "TN", "GA", "FL"],
        "minBeds": 3,
        "maxBeds": 5,
        "minBaths": 2,
        "maxBaths": 4,
        "minPrice": 75000,
        "maxPrice": 350000,
        "minYearBuilt": 1960,
        "propertyTypes": ["Single Family"],
        "mustHavePool": false,
        "noHOA": true,
        "preferVacant": true
    }'::jsonb,
    'properties@sunbeltacq.com',
    '555-0789',
    'Michael Chen',
    3
);

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE compliance_checks IS 'AI-powered contract compliance analysis results';
COMMENT ON TABLE hedge_fund_buyboxes IS 'Investment criteria for institutional buyers and hedge funds';
COMMENT ON TABLE fund_submissions IS 'Tracks property submissions to hedge funds with matching scores';
COMMENT ON TABLE buyer_interactions IS 'Logs all buyer engagement and communication';
COMMENT ON TABLE buyer_profiles IS 'Buyer behavior metrics and preferences';
COMMENT ON TABLE property_enrichment_log IS 'AI data enrichment history';
COMMENT ON TABLE ai_agent_audit_log IS 'Comprehensive audit trail for all AI agent actions';
