import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import { PropertyAttributes } from '../types';

interface PropertyCreationAttributes extends Optional<PropertyAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class Property extends Model<PropertyAttributes, PropertyCreationAttributes> implements PropertyAttributes {
  // Using 'declare' instead of 'public' to avoid Sequelize class field shadowing
  // See: https://sequelize.org/main/manual/model-basics.html#caveat-with-public-class-fields
  declare id: number;
  declare propertyId: string;
  declare liveOnHubzu: boolean;
  declare propertyOwnership: string;
  declare propertyType: string;

  // Address
  declare address: {
    houseNumber: string;
    street: string;
    address2?: string;
  };
  declare city: string;
  declare state: string;
  declare zip: string;
  declare county: string;
  declare country: string | undefined;

  // Property Details
  declare workflowType: string | undefined;
  declare bedroomCount: number;
  declare bathroomCount: number;
  declare fullBathrooms: number | undefined;
  declare partialBathrooms: number | undefined;
  declare livingSpaceSqFt: number | undefined;
  declare lotSizeSqFt: number | undefined;
  declare yearBuilt: number | undefined;
  declare stories: number | undefined;

  // Features
  declare garage: string | undefined;
  declare garageCount: number | undefined;
  declare pool: boolean | undefined;
  declare solar: boolean | undefined;
  declare septic: boolean | undefined;
  declare well: boolean | undefined;

  // Occupancy
  declare occupancyStatus: string;
  declare occupancyDetails: string | undefined;
  declare monthlyRent: number | undefined;
  declare deliveredVacant: boolean | undefined;
  declare accessToProperty: string | undefined;
  declare lockboxCode: string | undefined;

  // Financial
  declare reservePrice: number | undefined;
  declare buyItNowPrice: number | undefined;
  declare startingBidAmount: number | undefined;
  declare purchaseContractPrice: number | undefined;
  declare arv: number | undefined;
  declare renovationBudget: number | undefined;
  declare rehabCost: number | undefined;
  declare bpoValue1: number | undefined;
  declare bpoValue1Date: Date | undefined;
  declare bpoValue2: number | undefined;
  declare bpoValue2Date: Date | undefined;
  declare appraisalValue: number | undefined;
  declare appraisalDate: Date | undefined;
  declare commissionPercentage: number | undefined;

  // MLS & Marketing
  declare syndication: ('Zillow' | 'Realtor' | 'Trulia')[];
  declare listedOnMLS: boolean;
  declare mlsListingPrice: number | undefined;
  declare mlsNumber: string | undefined;
  declare mlsListedDate: Date | undefined;
  declare mlsExpirationDate: Date | undefined;
  declare mlsEligible: boolean | undefined;
  declare onMarketOffMarket: string | undefined;
  declare photosFolder: string | undefined;
  declare photoLinks: string[] | undefined;
  declare propertyListingDescription: string | undefined;

  // HOA
  declare hoa: boolean;
  declare hoaBillingFrequency: string | undefined;
  declare hoaDuesAmount: number | undefined;

  // Property Condition
  declare condition: string | undefined;
  declare roof: string | undefined;
  declare sewer: string | undefined;
  declare electric: string | undefined;
  declare water: string | undefined;
  declare foundationType: string | undefined;
  declare typeOfRehab: string | undefined;
  declare waterHeater: string | undefined;
  declare hvac: string | undefined;
  declare knownMaterialDefects: string | undefined;

  // Wholesaler Info
  declare propertyContracts: string | undefined;
  declare wholesalerLlcName: string | undefined;
  declare llcOwnerName: string | undefined;
  declare llcBusinessAddress: string | undefined;
  declare llcOwnerEmail: string | undefined;
  declare purchaseContractExpiration: Date | undefined;

  // Agent Info
  declare agentFirstName: string | undefined;
  declare agentLastName: string | undefined;
  declare agentEmail: string | undefined;
  declare agentPhoneNumber: string | undefined;
  declare agentLicenseNumber: string | undefined;
  declare licensedState: string | undefined;
  declare agentAddress: string | undefined;
  declare agentCity: string | undefined;
  declare agentState: string | undefined;
  declare agentZip: string | undefined;

  // Broker Info
  declare brokerCompany: string | undefined;
  declare brokerLicenseNumber: string | undefined;
  declare managingBroker: string | undefined;
  declare managingBrokerLicenseNumber: string | undefined;

  // Contract & Compliance
  declare assignable: boolean | undefined;
  declare marketingClauseFound: boolean | undefined;
  declare brokerOnFile: boolean | undefined;
  declare conveyanceType: string | undefined;
  declare status: 'Green' | 'Yellow' | 'Red' | undefined;
  declare complianceNotes: string[] | undefined;

  // Deal Processing State (new pipeline)
  declare processingState: 'created' | 'compliance_pending' | 'compliance_passed' | 'compliance_failed' | 'scoring' | 'scored' | 'approval_pending' | 'active' | 'rejected' | 'blocked' | undefined;
  declare processingStateUpdatedAt: Date | undefined;

  // Broker Approval Workflow
  declare approvalStatus: 'draft' | 'pending_broker_approval' | 'approved' | 'rejected' | 'live' | undefined;
  declare assignedBrokerId: string | undefined;
  declare approvedAt: Date | undefined;
  declare approvedBy: string | undefined;
  declare approvalNotes: string | undefined;
  declare rejectedAt: Date | undefined;
  declare rejectedBy: string | undefined;
  declare rejectionReason: string | undefined;
  declare changesRequestedAt: Date | undefined;
  declare changesRequestedBy: string | undefined;
  declare changesRequested: string | undefined;
  declare submittedForApprovalAt: Date | undefined;

  // Platform
  declare financeable: boolean | undefined;
  declare ownItNowAllowedAuction: boolean | undefined;
  declare ownItNowAllowedPreAuction: boolean | undefined;

  // Listing Tracking - Where property is listed
  declare listingHistory: {
    siteId: string;
    siteName: string;
    submittedAt: Date;
    confirmationNumber?: string;
    status: 'pending' | 'active' | 'expired' | 'removed';
    listingUrl?: string;
    expiresAt?: Date;
  }[] | undefined;
  declare currentListings: string[] | undefined; // Array of site IDs where currently listed
  declare lastSubmittedAt: Date | undefined;
  declare lastSubmittedTo: string | undefined;

  // Owner History - Track ownership changes
  declare ownerHistory: {
    ownerName: string;
    ownerEmail?: string;
    ownerCompany?: string;
    startDate: Date;
    endDate?: Date;
    source: string; // Where we learned about this owner
  }[] | undefined;

  // Tags for organization
  declare tags: string[] | undefined;                  // Custom tags for filtering/organization

  // External ID for automation lookups
  declare externalId: string | undefined;              // External reference ID

  // Document Status Tracking (DocuSeal integration)
  declare documentStatus: {
    [category: string]: {
      status: 'not_sent' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired';
      submissionId?: number;
      sentAt?: string;
      signedAt?: string;
      templateId?: number;
      templateName?: string;
      signers?: Array<{ email: string; status: string; signedAt?: string }>;
    };
  } | undefined;

  // Market Data Enrichment (from Zillow/RapidAPI)
  declare zpid: string | undefined;                    // Zillow Property ID
  declare zestimate: number | undefined;               // Zillow estimate
  declare zestimateRangeLow: number | undefined;
  declare zestimateRangeHigh: number | undefined;
  declare rentZestimate: number | undefined;           // Zillow rent estimate
  declare lastSoldPrice: number | undefined;
  declare lastSoldDate: Date | undefined;
  declare taxAssessedValue: number | undefined;
  declare ownerName: string | undefined;               // From skip trace
  declare ownerPhones: string[] | undefined;           // From skip trace
  declare ownerEmails: string[] | undefined;           // From skip trace
  declare ownerMailingAddress: string | undefined;     // From skip trace
  declare comparablesCount: number | undefined;        // Number of comps found
  declare comparablesAvgPrice: number | undefined;     // Average comp price
  declare marketDataEnrichment: object | undefined;    // Full enrichment data (JSONB)
  declare enrichedAt: Date | undefined;                // When market data was enriched
  declare enrichmentSource: string | undefined;        // 'rapidapi-zillow', 'manual', etc.

  // Image Analysis & Embeddings (for ML)
  declare imageEmbedding: number[] | undefined;        // 1536-dim embedding vector
  declare imageAnalysis: {                 // Structured photo analysis
    overallCondition: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
    features: string[];
    concerns: string[];
    description: string;
    qualityScore: number;
  } | undefined;
  declare imageAnalyzedAt: Date | undefined;           // When photos were analyzed

  // Timestamps
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Property.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for manual property entries
      unique: true,
    },
    liveOnHubzu: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    propertyOwnership: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for manual property entries
    },
    propertyType: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for manual property entries
    },

    // Address
    address: {
      type: DataTypes.JSONB,
      allowNull: true, // Allow null for manual property entries
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for manual property entries
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for manual property entries
    },
    zip: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for manual property entries
    },
    county: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for manual property entries
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'USA',
    },

    // Property Details
    workflowType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bedroomCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bathroomCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    fullBathrooms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    partialBathrooms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    livingSpaceSqFt: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    lotSizeSqFt: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    yearBuilt: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    stories: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Features
    garage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    garageCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    pool: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    solar: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    septic: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    well: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },

    // Occupancy
    occupancyStatus: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for manual property entries
    },
    occupancyDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    monthlyRent: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    deliveredVacant: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    accessToProperty: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lockboxCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Financial
    reservePrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    buyItNowPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    startingBidAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    purchaseContractPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    arv: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    renovationBudget: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    rehabCost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    bpoValue1: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    bpoValue1Date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    bpoValue2: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    bpoValue2Date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    appraisalValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    appraisalDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    commissionPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    // MLS & Marketing
    syndication: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    listedOnMLS: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    mlsListingPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    mlsNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    mlsListedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    mlsExpirationDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    mlsEligible: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    onMarketOffMarket: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    photosFolder: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    photoLinks: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    propertyListingDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // HOA
    hoa: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    hoaBillingFrequency: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    hoaDuesAmount: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
    },

    // Property Condition
    condition: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    roof: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sewer: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    electric: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    water: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    foundationType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    typeOfRehab: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    waterHeater: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    hvac: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    knownMaterialDefects: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Wholesaler Info
    propertyContracts: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    wholesalerLlcName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    llcOwnerName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    llcBusinessAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    llcOwnerEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    purchaseContractExpiration: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Agent Info
    agentFirstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentLastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentPhoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentLicenseNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    licensedState: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentCity: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentState: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    agentZip: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Broker Info
    brokerCompany: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    brokerLicenseNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    managingBroker: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    managingBrokerLicenseNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Contract & Compliance
    assignable: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    marketingClauseFound: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    brokerOnFile: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    conveyanceType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('Green', 'Yellow', 'Red', 'new', 'enriched', 'scored', 'submitted', 'accepted', 'rejected'),
      allowNull: true,
    },
    complianceNotes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },

    // Deal Processing State (new pipeline)
    processingState: {
      type: DataTypes.ENUM(
        'created',
        'compliance_pending',
        'compliance_passed',
        'compliance_failed',
        'scoring',
        'scored',
        'approval_pending',
        'active',
        'rejected',
        'blocked'
      ),
      allowNull: true,
      defaultValue: 'created',
    },
    processingStateUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Broker Approval Workflow
    approvalStatus: {
      type: DataTypes.ENUM('draft', 'pending_broker_approval', 'approved', 'rejected', 'live'),
      allowNull: true,
      defaultValue: 'draft',
    },
    assignedBrokerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    approvalNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rejectedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    changesRequestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    changesRequestedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    changesRequested: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    submittedForApprovalAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Platform
    financeable: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    ownItNowAllowedAuction: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    ownItNowAllowedPreAuction: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },

    // Listing Tracking
    listingHistory: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    currentListings: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    lastSubmittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSubmittedTo: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Owner History
    ownerHistory: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },

    // Market Data Enrichment (from Zillow/RapidAPI)
    zpid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    zestimate: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    zestimateRangeLow: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    zestimateRangeHigh: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    rentZestimate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    lastSoldPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    lastSoldDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    taxAssessedValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    ownerName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ownerPhones: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    ownerEmails: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    ownerMailingAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    comparablesCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    comparablesAvgPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    externalId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    marketDataEnrichment: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    enrichedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    enrichmentSource: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Image Analysis & Embeddings (for ML)
    imageEmbedding: {
      type: DataTypes.ARRAY(DataTypes.FLOAT),
      allowNull: true,
    },
    imageAnalysis: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    imageAnalyzedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Document Status Tracking (DocuSeal integration)
    documentStatus: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },

    // Timestamps
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'Property',
    tableName: 'properties',
    timestamps: true,
  }
);

export default Property;
