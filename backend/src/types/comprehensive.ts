// Comprehensive Property Interface matching all data structure requirements
import { Optional } from 'sequelize';

export interface PropertyAddress {
  houseNumber: string;
  street: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  country: string;
}

export interface PropertyInfo {
  propertyId: string;
  propertyType: string;
  propertyOwnership: string;
  workflowType?: string;
  yearBuilt?: number;
  livingSpaceSqFt?: number;
  lotSizeSqFt?: number;
  bedroomCount: number;
  bathroomCount: number;
  fullBathrooms?: number;
  partialBathrooms?: number;
  stories?: number;
  garage?: string;
  garageCount?: number;
  pool?: boolean;
  solar?: boolean;
  septic?: boolean;
  well?: boolean;
}

export interface FinancialInfo {
  purchaseContractPrice?: number;
  reservePrice?: number;
  buyItNowPrice?: number;
  startingBidAmount?: number;
  monthlyRent?: number;
  arv?: number;
  renovationBudget?: number;
  taxes?: number;
  bpoValue1?: number;
  bpoValue1Date?: Date;
  bpoValue2?: number;
  bpoValue2Date?: Date;
  appraisalValue?: number;
  appraisalDate?: Date;
  mlsListingPrice?: number;
  commissionPercentage?: number;
}

export interface OccupancyInfo {
  occupancyStatus: string;
  occupancyDetails?: string;
  deliveredVacant?: boolean;
  accessToProperty?: string;
  lockboxCode?: string;
}

export interface HOAInfo {
  hoa: boolean;
  hoaBillingFrequency?: string;
  hoaDuesAmount?: number;
}

export interface MarketingInfo {
  liveOnHubzu: boolean;
  onMarketOffMarket?: string;
  syndication: ('Zillow' | 'Realtor' | 'Trulia')[];
  listedOnMLS: boolean;
  mlsNumber?: string;
  mlsListedDate?: Date;
  mlsExpirationDate?: Date;
  mlsEligible?: boolean;
  photosFolder?: string;
  photoLinks?: string[];
  propertyListingDescription?: string;
}

export interface ConditionInfo {
  roof?: string;
  sewer?: string;
  electric?: string;
  water?: string;
  foundationType?: string;
  waterHeater?: string;
  hvac?: string;
  typeOfRehab?: string;
  knownMaterialDefects?: string;
}

export interface AgentInfo {
  agentFirstName?: string;
  agentLastName?: string;
  agentEmail?: string;
  agentPhoneNumber?: string;
  agentLicenseNumber?: string;
  licensedState?: string;
  agentAddress?: string;
  agentCity?: string;
  agentState?: string;
  agentZip?: string;
}

export interface BrokerInfo {
  brokerCompany?: string;
  brokerLicenseNumber?: string;
  managingBroker?: string;
  managingBrokerLicenseNumber?: string;
}

export interface WholesalerInfo {
  wholesalerLlcName?: string;
  llcOwnerName?: string;
  llcBusinessAddress?: string;
  llcOwnerEmail?: string;
  purchaseContractExpiration?: Date;
  propertyContracts?: string;
}

export interface ContractInfo {
  assignable?: boolean;
  marketingClauseFound?: boolean;
  contractLink?: string;
  conveyanceType?: string;
  buyerSellerCommission?: number;
}

export interface PlatformStatus {
  liveOnHubzu?: boolean;
  financeable?: boolean;
  ownItNowAllowedAuction?: boolean;
  ownItNowAllowedPreAuction?: boolean;
  ownItNowPrice?: number;
}

export interface ComplianceInfo {
  assignable: boolean;
  marketingClausePresent: boolean;
  brokerOnFile: boolean;
  stateRequiredItems?: string[];
  status?: 'Green' | 'Yellow' | 'Red';
  complianceNotes?: string[];
}

export interface PropertyAttributes extends PropertyInfo {
  id?: number;
  address: PropertyAddress;
  financial: FinancialInfo;
  occupancy: OccupancyInfo;
  hoa: HOAInfo;
  marketing: MarketingInfo;
  condition: ConditionInfo;
  agent?: AgentInfo;
  broker?: BrokerInfo;
  wholesaler: WholesalerInfo;
  contract: ContractInfo;
  platform: PlatformStatus;
  compliance: ComplianceInfo;
  parcelNumber?: string;
  propertyContracts?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Xome-specific interface
export interface XomePropertySubmission {
  assetType: string;
  address: PropertyAddress;
  propertyDetails: PropertyInfo;
  financial: FinancialInfo;
  occupancy: OccupancyInfo;
  hoa: HOAInfo;
  features: {
    garage?: string;
    pool?: boolean;
    solar?: boolean;
  };
  marketing: MarketingInfo;
  agent?: AgentInfo;
  broker: BrokerInfo;
  transaction: {
    conveyanceType: string;
  };
}

// Hedge Fund-specific interface
export interface HedgeFundPropertySubmission {
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  livingSpaceSqFt?: number;
  lotSizeSqFt?: number;
  yearBuilt?: number;
  garage?: string;
  hoa: boolean;
  hoaFee?: number;
  pool?: boolean;
  solar?: boolean;
  septic?: boolean;
  well?: boolean;
  roof?: string;
  electric?: string;
  plumbing?: string;
  foundation?: string;
  waterHeater?: string;
  hvac?: string;
  generalPropertyCondition?: string;
  propertyDescription?: string;
  photosFolder?: string;
  onMarketOffMarket?: string;
  financeable?: boolean;
  ownItNowAllowedAuction?: boolean;
  ownItNowAllowedPreAuction?: boolean;
  ownItNowPrice?: number;
  reservePrice?: number;
  purchaseContractPrice?: number;
  purchaseContractExpiration?: Date;
}

// Creation attributes (optional fields for creation)
export interface PropertyCreationAttributes extends Optional<PropertyAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

// API Response types
export interface PropertyResponse {
  success: boolean;
  data?: PropertyAttributes;
  error?: string;
}

export interface PropertyListResponse {
  success: boolean;
  data?: PropertyAttributes[];
  count?: number;
  error?: string;
}

// Validation schemas
export interface PropertyValidationSchema {
  address: {
    houseNumber: string;
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  propertyType: string;
  bedroomCount: number;
  bathroomCount: number;
  financial: {
    purchaseContractPrice: number;
  };
}