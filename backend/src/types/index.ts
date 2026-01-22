// =============================================================================
// BUY BOX TYPES (shared between UserBuyBox and HedgeFundBuyBox)
// =============================================================================

// Investment strategies - comprehensive list covering all acquisition methods
export type InvestmentStrategy =
  | 'fix_and_flip'
  | 'long_term_rental'
  | 'short_term_rental' // Airbnb/VRBO
  | 'wholesale'
  | 'novation'
  | 'subject_to' // Subject-To existing financing
  | 'seller_financing'
  | 'lease_option'
  | 'brrrr' // Buy, Rehab, Rent, Refinance, Repeat
  | 'land_development'
  | 'new_construction'
  | 'commercial_conversion';

// Property types - comprehensive list
export type PropertyType =
  | 'single_family'
  | 'condo_townhome'
  | 'townhouse'
  | 'condo'
  | 'duplex'
  | 'triplex'
  | 'fourplex'
  | 'small_multifamily' // 5-20 units
  | 'large_multifamily' // 20+ units
  | 'apartment_building'
  | 'portfolio'
  | 'commercial'
  | 'mixed_use'
  | 'office'
  | 'retail'
  | 'light_industrial'
  | 'warehouse'
  | 'mobile_home' // Single mobile/manufactured home
  | 'mobile_home_park'
  | 'modular_home'
  | 'tiny_home'
  | 'adu' // Accessory Dwelling Unit
  | 'storage_units'
  | 'land'
  | 'vacant_land'
  | 'raw_land'
  | 'farm_ranch'
  | 'other';

// Deal tags - special property/deal characteristics (like InvestorLift)
export type DealTag =
  | 'portfolio_deal' // Multiple properties bundled
  | 'seller_financing_available'
  | 'subject_to_available'
  | 'lease_option_available'
  | 'short_sale'
  | 'reo_bank_owned'
  | 'auction'
  | 'hud_home'
  | 'va_foreclosure'
  | 'fannie_mae'
  | 'freddie_mac'
  | 'probate'
  | 'pre_probate'
  | 'pre_foreclosure'
  | 'tax_lien'
  | 'tax_deed'
  | 'divorce'
  | 'bankruptcy'
  | 'estate_sale'
  | 'inherited'
  | 'code_violation'
  | 'condemned'
  | 'fire_damaged'
  | 'assumable_loan'
  | 'cash_only'
  | 'quick_close'
  | 'as_is';

// Motivation/distress indicators (like PropStream filters)
export type MotivationIndicator =
  | 'pre_foreclosure'
  | 'tax_delinquent'
  | 'probate'
  | 'pre_probate'
  | 'divorce'
  | 'bankruptcy'
  | 'absentee_owner'
  | 'out_of_state_owner'
  | 'corporate_owned'
  | 'high_equity'
  | 'low_equity'
  | 'inherited'
  | 'vacant'
  | 'long_term_owner' // 10+ years
  | 'tired_landlord'
  | 'free_and_clear' // No mortgage
  | 'senior_owner' // 65+
  | 'code_violation'
  | 'utility_lien'
  | 'hoa_lien'
  | 'mechanics_lien'
  | 'judgment_lien';

// Condition levels - more granular
export type ConditionLevel =
  | 'turnkey' // Move-in ready
  | 'light' // Cosmetic only ($0-25k)
  | 'medium' // ($25k-75k)
  | 'heavy' // ($75k-150k)
  | 'full_gut' // Complete renovation ($150k+)
  | 'tear_down' // Demo and rebuild
  | 'any';

// Neighborhood class ratings
export type NeighborhoodClass = 'A' | 'B' | 'C' | 'D' | 'any';

// Foundation types
export type FoundationType =
  | 'slab'
  | 'crawl_space'
  | 'basement'
  | 'pier_and_beam'
  | 'raised'
  | 'any';

// Utility types
export type UtilityType = 'public' | 'private' | 'any';

// Lot characteristics
export type LotType =
  | 'flat'
  | 'sloped'
  | 'corner'
  | 'cul_de_sac'
  | 'waterfront'
  | 'water_view'
  | 'golf_course'
  | 'greenbelt'
  | 'flag_lot'
  | 'any';

// Zoning types
export type ZoningType =
  | 'residential_single'
  | 'residential_multi'
  | 'commercial'
  | 'mixed_use'
  | 'industrial'
  | 'agricultural'
  | 'any';

export type DealSourcePreference = 'mls_only' | 'off_market_only' | 'both';

export type OccupancyStatus =
  | 'vacant_only'
  | 'vacant_preferred'
  | 'tenant_occupied_ok'
  | 'owner_occupied_ok'
  | 'section_8_ok'
  | 'month_to_month_ok'
  | 'unknown_ok';

export type CrimeTolerance = 'low' | 'medium' | 'high' | 'any';

export type LeaseType = 'fixed_term' | 'month_to_month' | 'section_8_ok' | 'any';

export type MatchStrictness = 'strict' | 'flexible';

export type DeliveryFrequency = 'real_time' | 'daily' | 'weekly';

export type DeliveryChannel = 'email' | 'in_app' | 'sms';

// Market-specific pricing for institutional buyers
export interface MarketPricing {
  maxPrice: number;
  grossYield?: number;
  minRent?: number;
  counties?: string[];
}

// Market contacts for hedge fund buy boxes
export interface MarketContact {
  name: string;
  email: string;
  phone?: string;
  markets: string[]; // List of markets/regions this contact covers
}

export interface BuyBoxCriteria {
  // =============================================================================
  // INVESTMENT STRATEGIES
  // =============================================================================
  investmentStrategies?: InvestmentStrategy[];

  // =============================================================================
  // GEOGRAPHIC CRITERIA
  // =============================================================================
  states?: string[];
  counties?: string[];
  cities?: string[];
  zipCodes?: string[];
  excludeZipCodes?: string[];
  excludeStates?: string[];
  excludeCounties?: string[];
  excludeCities?: string[];
  radiusCenterZip?: string;
  radiusMiles?: number;
  msaMetroAreas?: string[]; // Metropolitan Statistical Areas
  excludeMsaMetroAreas?: string[];

  // Market-specific pricing (for institutional buyers with different limits per MSA)
  marketPrices?: Record<string, MarketPricing>;

  // =============================================================================
  // PROPERTY TYPES & DEAL TAGS
  // =============================================================================
  propertyTypes?: PropertyType[];
  excludePropertyTypes?: PropertyType[];

  // Deal tags/types to accept (like InvestorLift tags)
  acceptDealTags?: DealTag[];
  excludeDealTags?: DealTag[];
  requireDealTags?: DealTag[]; // Must have ALL of these tags

  // =============================================================================
  // MOTIVATION & DISTRESS INDICATORS (like PropStream filters)
  // =============================================================================
  acceptMotivationIndicators?: MotivationIndicator[];
  requireMotivationIndicators?: MotivationIndicator[]; // Must have at least one
  excludeMotivationIndicators?: MotivationIndicator[];

  // =============================================================================
  // PHYSICAL CHARACTERISTICS
  // =============================================================================
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minSqft?: number;
  maxSqft?: number;
  minLivingSpaceSqFt?: number; // Alias for minSqft
  maxLivingSpaceSqFt?: number; // Alias for maxSqft
  minLotSizeSqft?: number;
  maxLotSizeSqft?: number;
  minLotSizeAcres?: number;
  maxLotSizeAcres?: number;
  minStories?: number;
  maxStories?: number;
  minUnits?: number; // For multi-family
  maxUnits?: number;

  // Garage Requirements
  minGarages?: number;
  maxGarages?: number;
  allowCarport?: boolean;
  requireGarage?: boolean;
  allowNoGarage?: boolean;

  // Basement
  requireBasement?: boolean;
  allowNoBasement?: boolean;
  allowFinishedBasement?: boolean;
  allowUnfinishedBasement?: boolean;

  // =============================================================================
  // PROPERTY AGE
  // =============================================================================
  minYearBuilt?: number;
  maxYearBuilt?: number;
  maxPropertyAge?: number; // Alternative: max years old

  // =============================================================================
  // PROPERTY SYSTEMS & INFRASTRUCTURE (NEW)
  // =============================================================================
  // Roof
  maxRoofAge?: number; // Max years old
  roofTypes?: string[]; // shingle, metal, tile, flat, etc.
  allowRoofIssues?: boolean;

  // HVAC
  maxHvacAge?: number;
  hvacTypes?: string[]; // central, window, mini-split, etc.
  requireCentralAir?: boolean;
  requireCentralHeat?: boolean;
  allowNoAc?: boolean;
  allowNoHeat?: boolean;

  // Water Heater
  maxWaterHeaterAge?: number;
  waterHeaterTypes?: string[]; // tank, tankless, etc.

  // Electrical
  electricalTypes?: string[]; // 100amp, 200amp, etc.
  allowKnobAndTube?: boolean;
  allowAluminumWiring?: boolean;
  allowFuseBox?: boolean;

  // Plumbing
  plumbingTypes?: string[]; // copper, pvc, pex, etc.
  allowPolybutylenePipes?: boolean;
  allowGalvanizedPipes?: boolean;
  allowCastIronPipes?: boolean;

  // Foundation
  foundationTypes?: FoundationType[];
  allowFoundationIssues?: boolean;
  allowCrawlSpaceMoisture?: boolean;

  // Utilities
  waterUtilityType?: UtilityType; // public, private (well), any
  sewerUtilityType?: UtilityType; // public, private (septic), any
  gasUtilityType?: UtilityType;

  // =============================================================================
  // FINANCIAL CRITERIA
  // =============================================================================
  minPrice?: number;
  maxPrice?: number;
  minArv?: number;
  maxArv?: number;
  minArvSpread?: number; // Minimum spread between price and ARV
  minCapRate?: number; // Minimum cap rate for rentals
  maxDaysOnMarket?: number; // Maximum days property has been listed
  minEquityPercent?: number;
  maxEquityPercent?: number;

  // The 70% Rule & Margins
  maxPercentOfArv?: number; // e.g., 70 for 70% rule
  minGrossMargin?: number; // Minimum gross margin dollar amount
  minGrossMarginPercent?: number; // Minimum gross margin percentage
  minBelowMarketPercent?: number; // How far below market value

  // Assignment fees (for wholesalers)
  minAssignmentFee?: number;
  maxAssignmentFee?: number;

  // Rental Yield
  minGrossYield?: number;
  minNetYield?: number;
  minRentToPrice?: number; // e.g., 0.01 for 1% rule

  // Days on Market
  minDaysOnMarket?: number;

  // Price per square foot
  minPricePerSqft?: number;
  maxPricePerSqft?: number;

  // =============================================================================
  // CONDITION & REHAB
  // =============================================================================
  conditionLevels?: ConditionLevel[];
  dealSourcePreference?: DealSourcePreference;

  // Rehab Budget
  minRehabBudget?: number;
  maxRehabBudget?: number;

  // Structural Issues
  allowStructuralIssues?: boolean;
  allowFireDamage?: boolean;

  // Detailed Condition Issues (NEW)
  allowMold?: boolean;
  allowAsbestos?: boolean;
  allowLeadPaint?: boolean;
  allowTermiteDamage?: boolean;
  allowWaterDamage?: boolean;
  allowRoofDamage?: boolean;
  allowEnvironmentalIssues?: boolean;
  allowHazardousMaterials?: boolean;
  allowDemolitionRequired?: boolean;

  // =============================================================================
  // PROPERTY FEATURES
  // =============================================================================
  allowPool?: boolean;
  requirePool?: boolean;
  allowSolarPanels?: boolean;
  allowSolarLease?: boolean; // Leased vs owned solar
  allowSeptic?: boolean;
  allowWell?: boolean;
  allowPrivateRoad?: boolean;
  allowSharedDriveway?: boolean;

  // =============================================================================
  // HOA & COMMUNITY
  // =============================================================================
  allowHoa?: boolean;
  maxHoaMonthly?: number;
  maxHoaAnnual?: number;
  allowSpecialAssessments?: boolean;
  allowLeasingRestrictions?: boolean;
  allowAgeRestrictions?: boolean; // 55+ communities
  allowPetRestrictions?: boolean;
  allowRentalCaps?: boolean; // HOAs with rental caps
  allowGatedCommunity?: boolean;

  // =============================================================================
  // LOCATION & NEIGHBORHOOD (NEW)
  // =============================================================================
  minSchoolScore?: number;
  maxSchoolScore?: number;
  minWalkScore?: number;
  minTransitScore?: number;
  minBikeScore?: number;
  neighborhoodClasses?: NeighborhoodClass[];
  excludeNeighborhoodClasses?: NeighborhoodClass[];
  allowMainRoad?: boolean;
  allowHighTrafficArea?: boolean;
  allowIndustrialArea?: boolean;
  allowCommercialArea?: boolean;

  // Lot characteristics
  lotTypes?: LotType[];
  excludeLotTypes?: LotType[];
  requireCornerLot?: boolean;
  requireCulDeSac?: boolean;
  allowWaterfront?: boolean;
  requireWaterfront?: boolean;
  allowWaterView?: boolean;
  allowGolfCourse?: boolean;

  // Zoning
  zoningTypes?: ZoningType[];
  allowZoningIssues?: boolean;
  allowNonConforming?: boolean;
  allowEasements?: boolean;
  allowEncroachments?: boolean;

  // =============================================================================
  // RISK PREFERENCES
  // =============================================================================
  allowCodeViolations?: boolean;
  allowOpenPermits?: boolean;
  allowLiensIfCurable?: boolean;
  allowFloodZone?: boolean;
  floodZoneTypes?: string[]; // A, AE, X, etc.
  allowFloodInsuranceRequired?: boolean;
  crimeTolerance?: CrimeTolerance;
  hardNos?: string;

  // Title Issues
  allowTitleIssues?: boolean;
  allowCloudedTitle?: boolean;
  allowQuitClaimOnly?: boolean;
  allowLisPendens?: boolean;

  // =============================================================================
  // OCCUPANCY
  // =============================================================================
  occupancyStatuses?: OccupancyStatus[];
  allowEvictionNeeded?: boolean;
  allowLongTermTenant?: boolean; // 2+ years
  maxExistingLeaseMonths?: number;
  allowBelowMarketRent?: boolean;
  allowSection8Tenant?: boolean;

  // =============================================================================
  // CREATIVE FINANCING CRITERIA (NEW)
  // =============================================================================
  // Seller Financing
  acceptSellerFinancing?: boolean;
  sellerFinanceMinDown?: number; // Min down payment %
  sellerFinanceMaxDown?: number;
  sellerFinanceMinTermMonths?: number;
  sellerFinanceMaxTermMonths?: number;
  sellerFinanceMaxInterestRate?: number;
  sellerFinanceAllowBalloon?: boolean;

  // Subject-To
  acceptSubjectTo?: boolean;
  subjectToMaxLoanBalance?: number;
  subjectToMaxLtv?: number; // Max loan-to-value
  subjectToMaxInterestRate?: number;
  subjectToAllowArmLoans?: boolean; // Adjustable rate mortgages
  subjectToMinEquity?: number;

  // Lease Option
  acceptLeaseOption?: boolean;
  leaseOptionMinTerm?: number;
  leaseOptionMaxTerm?: number;

  // Assumable Loans
  acceptAssumableLoan?: boolean;
  assumableLoanTypes?: string[]; // FHA, VA, etc.

  // =============================================================================
  // FIX & FLIP STRATEGY OPTIONS
  // =============================================================================
  flipMinBelowArvPercent?: number;
  flipMaxPercentOfArv?: number; // 70% rule
  flipMinExpectedProfit?: number;
  flipMinProfitPercent?: number;
  flipMaxClosingDays?: number;
  flipMaxHoldingPeriod?: number; // Max months to flip
  flipMinRoi?: number; // Min ROI percentage

  // =============================================================================
  // LONG-TERM RENTAL STRATEGY OPTIONS
  // =============================================================================
  rentalMinHoldYears?: number;
  rentalMinMonthlyRent?: number;
  rentalMaxMonthlyRent?: number;
  rentalMinRentToPrice?: number;
  rentalMinCapRate?: number;
  rentalMinCashOnCash?: number;
  rentalMinDscr?: number; // Debt service coverage ratio
  rentalAllowBelowMarket?: boolean;
  rentalLeaseTypes?: LeaseType[];
  rentalAllowNegativeCashFlow?: boolean;

  // =============================================================================
  // SHORT-TERM RENTAL (AIRBNB/VRBO) OPTIONS (NEW)
  // =============================================================================
  strAllowed?: boolean; // Is STR allowed in area?
  strMinNightlyRate?: number;
  strMinOccupancy?: number; // Min occupancy rate %
  strMinAnnualRevenue?: number;
  strRequirePermit?: boolean;
  strMaxRegulations?: string; // How strict is acceptable

  // =============================================================================
  // BRRRR STRATEGY OPTIONS (NEW)
  // =============================================================================
  brrrrMinEquityAfterRefinance?: number;
  brrrrMaxAllInCost?: number; // Purchase + Rehab
  brrrrMinArvForRefinance?: number;
  brrrrMaxLtvForRefinance?: number;
  brrrrMinCashOutPercent?: number;

  // =============================================================================
  // WHOLESALE STRATEGY OPTIONS (NEW)
  // =============================================================================
  wholesaleMinSpread?: number; // Min spread between contract and ARV
  wholesaleMaxDaysToClose?: number;
  wholesaleRequireAssignable?: boolean;
  wholesaleMinAssignmentFee?: number;
  wholesaleMaxContractPrice?: number;

  // =============================================================================
  // ZESTIMATE & COMPARABLES
  // =============================================================================
  maxPercentBelowZestimate?: number;
  minPercentBelowZestimate?: number;
  requireZestimate?: boolean;
  minComparables?: number; // Min number of comps available
  maxDaysComps?: number; // How recent must comps be

  // =============================================================================
  // PHOTOS & DOCUMENTATION
  // =============================================================================
  minPhotos?: number;
  requirePhotos?: boolean;
  requireInteriorPhotos?: boolean;
  requireExteriorPhotos?: boolean;
  require3DTour?: boolean;
  requireFloorPlan?: boolean;

  // =============================================================================
  // MATCHING PREFERENCES
  // =============================================================================
  matchStrictness?: MatchStrictness;

  // Priority Weighting (which criteria matter most)
  priorityFields?: string[]; // Ordered list of most important criteria

  // =============================================================================
  // HARD REQUIREMENTS - Configurable deal breakers
  // =============================================================================
  // When a criterion is marked as hard, failing it = excluded (score 0)
  // When soft (default), failing it = reduced score
  hardRequirements?: HardRequirements;

  // =============================================================================
  // CUSTOM/FREE-TEXT CRITERIA
  // =============================================================================
  customCriteria?: Array<{
    text: string;
    enabled: boolean;
    weight?: number;
  }>;
  customCriteriaParsed?: Array<{
    field: string;
    operator: string;
    value: unknown;
    confidence: number;
  }>;
}

// =============================================================================
// HARD REQUIREMENTS - Deal breakers that cause immediate rejection
// =============================================================================
export interface HardRequirements {
  // When true, failing this criterion = score of 0 (excluded)
  // When false or undefined, failing this criterion = reduced score (soft)

  // Geographic
  state?: boolean;          // Default: true (always hard)
  county?: boolean;
  city?: boolean;
  zipCode?: boolean;

  // Financial
  maxPrice?: boolean;       // Over max budget = excluded
  minPrice?: boolean;       // Under min budget = excluded

  // Property characteristics
  propertyType?: boolean;   // Wrong property type = excluded
  minBedrooms?: boolean;
  maxBedrooms?: boolean;
  minBathrooms?: boolean;
  maxBathrooms?: boolean;
  minSqft?: boolean;
  maxSqft?: boolean;
  minYearBuilt?: boolean;
  maxYearBuilt?: boolean;

  // Risk factors
  allowHoa?: boolean;       // HOA present when not allowed = excluded
  allowPool?: boolean;
  allowSeptic?: boolean;
  allowWell?: boolean;
  allowFloodZone?: boolean;
  allowStructuralIssues?: boolean;
  allowFoundationIssues?: boolean;
  allowFireDamage?: boolean;

  // Occupancy
  occupancyStatus?: boolean;
}

export interface ScoringWeights {
  // Core criteria
  geographic: number;
  price: number;
  propertyType: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number;
  occupancy: number;
  hoa: number;
  photos: number;
  condition: number;
  riskFactors: number;
  strategyMetrics: number;
  custom: number;

  // Extended criteria (optional - default to 0)
  dealTags?: number;
  motivationIndicators?: number;
  propertySystems?: number;
  financialMetrics?: number;
  locationQuality?: number;
  creativeFinancing?: number;
  lotCharacteristics?: number;
}

export interface BuyBoxMatch {
  buyBoxId: string;
  buyBoxName: string;
  fundName?: string;
  score: number;
  matchType: 'strong' | 'moderate' | 'weak' | 'no_match';
  breakdown: {
    criterion: string;
    passed: boolean;
    score: number;
    weight: number;
    details?: string;
  }[];
  autoSubmitRecommended: boolean;
}

// =============================================================================
// PROPERTY TYPES
// =============================================================================

export interface PropertyAttributes {
  id?: number;
  propertyId: string;
  liveOnHubzu: boolean;
  propertyOwnership: string;
  propertyType: string;

  // Address
  address: {
    houseNumber: string;
    street: string;
    address2?: string;
  };
  city: string;
  state: string;
  zip: string;
  county: string;
  country?: string;

  // Property Details
  workflowType?: string;
  bedroomCount: number;
  bathroomCount: number;
  fullBathrooms?: number;
  partialBathrooms?: number;
  livingSpaceSqFt?: number;
  lotSizeSqFt?: number;
  yearBuilt?: number;
  stories?: number;

  // Features
  garage?: string;
  garageCount?: number;
  pool?: boolean;
  solar?: boolean;
  septic?: boolean;
  well?: boolean;

  // Occupancy
  occupancyStatus: string;
  occupancyDetails?: string;
  monthlyRent?: number;
  deliveredVacant?: boolean;
  accessToProperty?: string;
  lockboxCode?: string;

  // Financial
  reservePrice?: number;
  buyItNowPrice?: number;
  startingBidAmount?: number;
  purchaseContractPrice?: number;
  arv?: number;
  renovationBudget?: number;
  rehabCost?: number;
  bpoValue1?: number;
  bpoValue1Date?: Date;
  bpoValue2?: number;
  bpoValue2Date?: Date;
  appraisalValue?: number;
  appraisalDate?: Date;
  commissionPercentage?: number;

  // MLS & Marketing
  syndication: ('Zillow' | 'Realtor' | 'Trulia')[];
  listedOnMLS: boolean;
  mlsListingPrice?: number;
  mlsNumber?: string;
  mlsListedDate?: Date;
  mlsExpirationDate?: Date;
  mlsEligible?: boolean;
  onMarketOffMarket?: string;
  photosFolder?: string;
  photoLinks?: string[];
  propertyListingDescription?: string;

  // HOA
  hoa: boolean;
  hoaBillingFrequency?: string;
  hoaDuesAmount?: number;

  // Property Condition
  condition?: string;
  roof?: string;
  sewer?: string;
  electric?: string;
  water?: string;
  foundationType?: string;
  typeOfRehab?: string;
  waterHeater?: string;
  hvac?: string;
  knownMaterialDefects?: string;

  // Wholesaler Info
  propertyContracts?: string;
  wholesalerLlcName?: string;
  llcOwnerName?: string;
  llcBusinessAddress?: string;
  llcOwnerEmail?: string;
  purchaseContractExpiration?: Date;

  // Agent Info
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

  // Broker Info
  brokerCompany?: string;
  brokerLicenseNumber?: string;
  managingBroker?: string;
  managingBrokerLicenseNumber?: string;

  // Contract & Compliance
  assignable?: boolean;
  marketingClauseFound?: boolean;
  brokerOnFile?: boolean;
  conveyanceType?: string;
  status?: 'Green' | 'Yellow' | 'Red';
  complianceNotes?: string[];

  // Deal Processing State (new pipeline)
  processingState?: 'created' | 'compliance_pending' | 'compliance_passed' | 'compliance_failed' | 'scoring' | 'scored' | 'approval_pending' | 'active' | 'rejected' | 'blocked';
  processingStateUpdatedAt?: Date;

  // Broker Approval Workflow
  approvalStatus?: 'draft' | 'pending_broker_approval' | 'approved' | 'rejected' | 'live';
  assignedBrokerId?: string;
  approvedAt?: Date;
  approvedBy?: string;
  approvalNotes?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  changesRequestedAt?: Date;
  changesRequestedBy?: string;
  changesRequested?: string;
  submittedForApprovalAt?: Date;

  // Platform
  financeable?: boolean;
  ownItNowAllowedAuction?: boolean;
  ownItNowAllowedPreAuction?: boolean;

  // Listing Tracking
  listingHistory?: {
    siteId: string;
    siteName: string;
    submittedAt: Date;
    confirmationNumber?: string;
    status: 'pending' | 'active' | 'expired' | 'removed';
    listingUrl?: string;
    expiresAt?: Date;
  }[];
  currentListings?: string[];
  lastSubmittedAt?: Date;
  lastSubmittedTo?: string;

  // Owner History
  ownerHistory?: {
    ownerName: string;
    ownerEmail?: string;
    ownerCompany?: string;
    startDate: Date;
    endDate?: Date;
    source: string;
  }[];

  // Tags for organization
  tags?: string[];

  // External ID for automation lookups
  externalId?: string;

  // Document Status Tracking (DocuSeal integration)
  documentStatus?: {
    [category: string]: {
      status: 'not_sent' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired';
      submissionId?: number;
      sentAt?: string;
      signedAt?: string;
      templateId?: number;
      templateName?: string;
      signers?: Array<{
        email: string;
        status: string;
        signedAt?: string;
      }>;
    };
  };

  // Market Data Enrichment (from Zillow/RapidAPI)
  zpid?: string;
  zestimate?: number;
  zestimateRangeLow?: number;
  zestimateRangeHigh?: number;
  rentZestimate?: number;
  lastSoldPrice?: number;
  lastSoldDate?: Date;
  taxAssessedValue?: number;
  ownerName?: string;
  ownerPhones?: string[];
  ownerEmails?: string[];
  ownerMailingAddress?: string;
  comparablesCount?: number;
  comparablesAvgPrice?: number;
  marketDataEnrichment?: object;
  enrichedAt?: Date;
  enrichmentSource?: string;

  // Image Analysis & Embeddings (for ML)
  imageEmbedding?: number[];
  imageAnalysis?: {
    condition?: string;
    curbAppeal?: number;
    renovationScope?: string;
    features?: string[];
    issues?: string[];
  };
  imageAnalyzedAt?: Date;

  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
}
