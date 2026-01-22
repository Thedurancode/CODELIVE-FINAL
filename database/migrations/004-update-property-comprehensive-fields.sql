-- Migration: Add comprehensive fields to properties table
-- This migration adds all missing fields from the data structure specifications

-- Add address2 field to address object (will be part of JSONB)
-- Note: Since address is JSONB, we'll handle this in the application layer

-- Add new simple fields
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS country VARCHAR(50),
ADD COLUMN IF NOT EXISTS parcel_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS workflow_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS on_market_off_market VARCHAR(20),
ADD COLUMN IF NOT EXISTS arv DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS renovation_budget DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS taxes DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS garage VARCHAR(100),
ADD COLUMN IF NOT EXISTS garage_count INTEGER,
ADD COLUMN IF NOT EXISTS pool BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS solar BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS septic BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS well BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stories INTEGER,
ADD COLUMN IF NOT EXISTS full_bathrooms INTEGER,
ADD COLUMN IF NOT EXISTS partial_bathrooms INTEGER,
ADD COLUMN IF NOT EXISTS buy_it_now_price DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS starting_bid_amount DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS commission_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mls_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS mls_listed_date DATE,
ADD COLUMN IF NOT EXISTS mls_expiration_date DATE,
ADD COLUMN IF NOT EXISTS mls_eligible BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS photos_folder TEXT,
ADD COLUMN IF NOT EXISTS bpo_value_1 DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS bpo_value_1_date DATE,
ADD COLUMN IF NOT EXISTS bpo_value_2 DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS bpo_value_2_date DATE,
ADD COLUMN IF NOT EXISTS appraisal_value DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS appraisal_date DATE,
ADD COLUMN IF NOT EXISTS financeable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS own_it_now_allowed_auction BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS own_it_now_allowed_pre_auction BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS assignable BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS marketing_clause_found BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS contract_link TEXT,
ADD COLUMN IF NOT EXISTS conveyance_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS buyer_seller_commission DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS broker_on_file BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Yellow',
ADD COLUMN IF NOT EXISTS compliance_notes TEXT[];

-- Agent Information fields
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS agent_first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS agent_last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS agent_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS agent_phone_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS agent_license_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS licensed_state VARCHAR(50),
ADD COLUMN IF NOT EXISTS agent_address TEXT,
ADD COLUMN IF NOT EXISTS agent_city VARCHAR(100),
ADD COLUMN IF NOT EXISTS agent_state VARCHAR(50),
ADD COLUMN IF NOT EXISTS agent_zip VARCHAR(20);

-- Broker Information fields
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS broker_company VARCHAR(255),
ADD COLUMN IF NOT EXISTS broker_license_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS managing_broker VARCHAR(100),
ADD COLUMN IF NOT EXISTS managing_broker_license_number VARCHAR(50);

-- Update existing records with default values
UPDATE properties
SET
  country = 'USA',
  assignable = TRUE,
  financeable = FALSE,
  broker_on_file = FALSE,
  mls_eligible = FALSE
WHERE country IS NULL;

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_properties_state ON properties(state);
CREATE INDEX IF NOT EXISTS idx_properties_county ON properties(county);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_property_type ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_occupancy_status ON properties(occupancy_status);
CREATE INDEX IF NOT EXISTS idx_properties_purchase_price ON properties(purchaseContractPrice);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(createdAt);

-- Create index on JSONB fields for better performance
CREATE INDEX IF NOT EXISTS idx_properties_address_gin ON properties USING GIN(address);
CREATE INDEX IF NOT EXISTS idx_properties_syndication_gin ON properties USING GIN(syndication);
CREATE INDEX IF NOT EXISTS idx_properties_photo_links_gin ON properties USING GIN(photo_links);

-- Add comments to explain new fields
COMMENT ON COLUMN properties.country IS 'Country where property is located';
COMMENT ON COLUMN properties.parcel_number IS 'Assessor Parcel Number (APN)';
COMMENT ON COLUMN properties.workflow_type IS 'Type of workflow (Standard, Expedited, etc.)';
COMMENT ON COLUMN properties.on_market_off_market IS 'Current market status';
COMMENT ON COLUMN properties.arv IS 'After Repair Value estimate';
COMMENT ON COLUMN properties.renovation_budget IS 'Estimated cost for renovations';
COMMENT ON COLUMN properties.taxes IS 'Annual property taxes';
COMMENT ON COLUMN properties.garage IS 'Garage description (e.g., 2-car attached)';
COMMENT ON COLUMN properties.garage_count IS 'Number of garage spaces';
COMMENT ON COLUMN properties.pool IS 'Property has swimming pool';
COMMENT ON COLUMN properties.solar IS 'Property has solar panels';
COMMENT ON COLUMN properties.septic IS 'Property uses septic system';
COMMENT ON COLUMN properties.well IS 'Property uses well water';
COMMENT ON COLUMN properties.stories IS 'Number of stories/floors';
COMMENT ON COLUMN properties.full_bathrooms IS 'Number of full bathrooms';
COMMENT ON COLUMN properties.partial_bathrooms IS 'Number of half bathrooms';
COMMENT ON COLUMN properties.buy_it_now_price IS 'Buy It Now price for auctions';
COMMENT ON COLUMN properties.starting_bid_amount IS 'Minimum bid for auctions';
COMMENT ON COLUMN properties.commission_percentage IS 'Buyer agent commission percentage';
COMMENT ON COLUMN properties.mls_number IS 'Multiple Listing Service number';
COMMENT ON COLUMN properties.mls_listed_date IS 'Date property was listed on MLS';
COMMENT ON COLUMN properties.mls_expiration_date IS 'MLS listing expiration date';
COMMENT ON COLUMN properties.mls_eligible IS 'Property eligible for MLS listing';
COMMENT ON COLUMN properties.photos_folder IS 'Path or link to property photos';
COMMENT ON COLUMN properties.status IS 'Compliance status (Green/Yellow/Red)';
COMMENT ON COLUMN properties.compliance_notes IS 'Compliance notes and issues';

-- Trigger for updating compliance status based on requirements
CREATE OR REPLACE FUNCTION update_property_compliance_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update status based on various conditions
    IF NEW.assignable = FALSE THEN
        NEW.status = 'Red';
        NEW.compliance_notes = array_append(NEW.compliance_notes, 'Contract is not assignable');
    ELSIF NEW.marketing_clause_found = FALSE THEN
        NEW.status = 'Yellow';
        NEW.compliance_notes = array_append(NEW.compliance_notes, 'Marketing clause not found');
    ELSIF NEW.broker_on_file = FALSE THEN
        NEW.status = 'Yellow';
        NEW.compliance_notes = array_append(NEW.compliance_notes, 'Broker MSA required');
    ELSE
        NEW.status = 'Green';
        NEW.compliance_notes = '{}';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_property_compliance ON properties;
CREATE TRIGGER trigger_update_property_compliance
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION update_property_compliance_status();