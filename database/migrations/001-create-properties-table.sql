-- Create properties table with all required fields
CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    "propertyId" VARCHAR(255) UNIQUE NOT NULL,
    "liveOnHubzu" BOOLEAN DEFAULT false,
    "propertyOwnership" VARCHAR(255) NOT NULL,
    "propertyType" VARCHAR(255) NOT NULL,
    address JSONB NOT NULL,
    city VARCHAR(255) NOT NULL,
    state VARCHAR(255) NOT NULL,
    zip VARCHAR(20) NOT NULL,
    county VARCHAR(255) NOT NULL,
    "occupancyStatus" VARCHAR(255) NOT NULL,
    "occupancyDetails" TEXT,
    "monthlyRent" DECIMAL(10, 2),
    "deliveredVacant" BOOLEAN,
    "accessToProperty" TEXT,
    "lockboxCode" VARCHAR(255),
    "reservePrice" DECIMAL(12, 2),
    syndication VARCHAR(50)[] DEFAULT '{}',
    "listedOnMLS" BOOLEAN DEFAULT false,
    "mlsListingPrice" DECIMAL(12, 2),
    "bedroomCount" INTEGER NOT NULL,
    "bathroomCount" INTEGER NOT NULL,
    "livingSpaceSqFt" INTEGER,
    "lotSizeSqFt" INTEGER,
    "yearBuilt" INTEGER,
    hoa BOOLEAN DEFAULT false,
    "hoaBillingFrequency" VARCHAR(255),
    "hoaDuesAmount" DECIMAL(8, 2),
    "propertyContracts" TEXT,
    "wholesalerLlcName" VARCHAR(255),
    "llcOwnerName" VARCHAR(255),
    "llcBusinessAddress" TEXT,
    "llcOwnerEmail" VARCHAR(255),
    "purchaseContractExpiration" TIMESTAMP,
    "purchaseContractPrice" DECIMAL(12, 2),
    "knownMaterialDefects" TEXT,
    "photoLinks TEXT[],
    "propertyListingDescription" TEXT,
    roof VARCHAR(255),
    sewer VARCHAR(255),
    electric VARCHAR(255),
    water VARCHAR(255),
    "foundationType" VARCHAR(255),
    "typeOfRehab" VARCHAR(255),
    waterHeater VARCHAR(255),
    hvac VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_propertyId ON properties("propertyId");
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_state ON properties(state);
CREATE INDEX IF NOT EXISTS idx_properties_county ON properties(county);
CREATE INDEX IF NOT EXISTS idx_properties_occupancyStatus ON properties("occupancyStatus");
CREATE INDEX IF NOT EXISTS idx_properties_propertyType ON properties("propertyType");
CREATE INDEX IF NOT EXISTS idx_properties_listedOnMLS ON properties("listedOnMLS");
CREATE INDEX IF NOT EXISTS idx_properties_liveOnHubzu ON properties("liveOnHubzu");

-- Create a GIN index on the address JSONB for efficient querying
CREATE INDEX IF NOT EXISTS idx_properties_address ON properties USING GIN(address);

-- Create a GIN index on syndication array
CREATE INDEX IF NOT EXISTS idx_properties_syndication ON properties USING GIN(syndication);

-- Create a GIN index on photoLinks array
CREATE INDEX IF NOT EXISTS idx_properties_photoLinks ON properties USING GIN(photoLinks);

-- Add constraint check for bedroom and bathroom counts
ALTER TABLE properties ADD CONSTRAINT chk_bedroom_count CHECK ("bedroomCount" >= 0);
ALTER TABLE properties ADD CONSTRAINT chk_bathroom_count CHECK ("bathroomCount" >= 0);