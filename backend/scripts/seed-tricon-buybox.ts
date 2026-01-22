/**
 * Seed script to add Tricon Residential buy box
 * Run with: npx ts-node scripts/seed-tricon-buybox.ts
 */

import HedgeFundBuyBox, { HedgeFundBuyBoxCreationAttributes } from '../src/models/HedgeFundBuyBox';
import sequelize from '../src/config/database';
import { InvestmentStrategy, PropertyType, ConditionLevel, MarketContact } from '../src/types';

async function seedTriconBuyBox() {
  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('Connected to database');

    // Sync the model (creates/updates table schema)
    await HedgeFundBuyBox.sync({ alter: true });

    // Check if already exists
    const existing = await HedgeFundBuyBox.findOne({
      where: { name: 'Tricon Residential' }
    });

    if (existing) {
      console.log('Tricon Residential buy box already exists, updating...');
      await existing.update(triconBuyBoxData);
      console.log('Updated successfully!');
    } else {
      await HedgeFundBuyBox.create(triconBuyBoxData);
      console.log('Tricon Residential buy box created successfully!');
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding buy box:', error);
    process.exit(1);
  }
}

const triconMarketContacts: MarketContact[] = [
  {
    name: 'Jaime Wood',
    email: 'jwood@triconresidential.com',
    markets: ['Charlotte NC', 'Raleigh NC', 'Greensboro-Winston Salem NC', 'Columbia SC', 'Greenville SC'],
  },
  {
    name: 'Jenny Loretto',
    email: 'jloretto@triconresidential.com',
    markets: ['Houston TX'],
  },
  {
    name: 'Gary Trejo',
    email: 'gtrejo@triconresidential.com',
    markets: ['Phoenix AZ'],
  },
  {
    name: 'Juan Lizarralde',
    email: 'jlizarralde@triconresidential.com',
    markets: ['Nashville TN', 'Indianapolis IN'],
  },
  {
    name: "Michael O'Toole",
    email: 'motoole@triconresidential.com',
    markets: ['Jacksonville FL', 'Orlando FL', 'Tampa FL'],
  },
  {
    name: 'Devlin Boland',
    email: 'dboland@triconresidential.com',
    markets: ['Dallas TX', 'Dallas-Fort Worth TX'],
  },
  {
    name: 'Cassie Jenkins',
    email: 'cjenkins@triconresidential.com',
    markets: ['Atlanta GA'],
  },
];

const triconBuyBoxData: HedgeFundBuyBoxCreationAttributes = {
  name: 'Tricon Residential',
  fundName: 'Tricon Residential',
  fundType: 'Institutional REIT',
  description: 'SFR Acquisitions Buy-Box (Updated August 2024). Average purchase price last quarter: $283,000. Average reno: $33,000.',
  contactEmail: 'acquisitions@triconresidential.com', // Main fund contact (fallback)
  contactPhone: '888-555-1234',
  enabled: true,
  priority: 1,
  autoSubmit: false,
  autoSubmitThreshold: 85,
  marketContacts: triconMarketContacts,
  criteria: {
    // Investment Strategy
    investmentStrategies: ['long_term_rental'] as InvestmentStrategy[],

    // Geographic - All target states
    states: ['GA', 'NC', 'SC', 'TX', 'IN', 'FL', 'NV', 'TN', 'AZ'],

    // Target counties by market
    counties: [
      // Atlanta, GA
      'Barrow', 'Bartow', 'Carroll', 'Cherokee', 'Clayton', 'Cobb', 'Coweta', 'Dawson',
      'Douglas', 'Gwinnett', 'Hall', 'Henry', 'Jackson', 'Newton', 'Paulding', 'Rockdale',
      'Spalding', 'Walton',
      // Charlotte, NC
      'Cabarrus', 'Cleveland', 'Gaston', 'Iredell', 'Lincoln', 'Mecklenburg', 'Rowan', 'Stanly', 'Union',
      // Columbia, SC
      'Lexington', 'Kershaw', 'Richland',
      // Dallas-Fort Worth, TX
      'Collin', 'Dallas', 'Denton', 'Ellis', 'Hood', 'Hunt', 'Johnson', 'Kaufman', 'Parker',
      'Rockwall', 'Tarrant', 'Wise',
      // Greensboro-Winston Salem, NC
      'Alamance', 'Forsyth', 'Guilford',
      // Greenville, SC
      'Anderson', 'Greenville', 'Spartanburg',
      // Houston, TX
      'Brazoria', 'Chambers', 'Fort Bend', 'Galveston', 'Harris',
      // Indianapolis, IN
      'Boone', 'Hamilton', 'Hancock', 'Hendricks', 'Johnson', 'Madison', 'Marion', 'Morgan',
      // Jacksonville, FL
      'Clay', 'Duval', 'Flagler', 'Nassau', 'Saint Johns',
      // Las Vegas, NV
      'Clark',
      // Nashville, TN
      'Cheatham', 'Davidson', 'Maury', 'Robertson', 'Rutherford', 'Sumner', 'Williamson', 'Wilson',
      // Orlando, FL
      'Lake', 'Orange', 'Osceola', 'Seminole', 'Volusia',
      // Phoenix, AZ
      'Maricopa', 'Pinal',
      // Raleigh, NC
      'Durham', 'Harnett', 'Johnston', 'Wake',
      // Tampa, FL
      'Hernando', 'Hillsborough', 'Manatee', 'Pasco', 'Pinellas', 'Polk', 'Sarasota'
    ],

    // Property Types - SFR Detached only
    propertyTypes: ['single_family'] as PropertyType[],

    // Price Range (highest max from all markets)
    minPrice: 150000,
    maxPrice: 550000,

    // Bedrooms/Bathrooms - 3-5 bed, 2+ bath
    minBedrooms: 3,
    maxBedrooms: 5,
    minBathrooms: 2,

    // Square Footage - 1,000 to 3,000 SF
    minSqft: 1000,
    maxSqft: 3000,

    // Year Built - 1995+
    minYearBuilt: 1995,

    // Condition - No extensive repairs, teardowns, burndowns
    conditionLevels: ['light', 'medium'] as ConditionLevel[],
    allowStructuralIssues: false,
    allowFoundationIssues: false,
    allowFireDamage: false,

    // Property Features - No pools, solar, septic
    allowPool: false,
    allowSolarPanels: false,
    allowSeptic: false,
    allowWell: true,

    // Garage - No carports, require garage
    allowCarport: false,
    minGarages: 1,

    // Risk Preferences
    allowFloodZone: false,  // Not within 100-year flood zone
    allowCodeViolations: false,
    allowOpenPermits: false,

    // HOA - No leasing or age restrictions
    allowHoa: true,
    allowLeasingRestrictions: false,
    allowAgeRestrictions: false,

    // Location Quality
    allowMainRoad: false,  // No main roads (double yellow lines)
    minSchoolScore: 3,     // Minimum 3/10 school score

    // Hard Nos (text summary)
    hardNos: 'No pools or solar panels. No carports (2+ car garages required, will consider 1 car). No extensive repairs/teardowns/burndowns. No leasing restrictions or age restrictions. No septic tanks. No main roads (double yellow lines). Must have minimum 3/10 school score rating.',

    // Market-specific max prices (for reference in matching)
    marketPrices: {
      'Atlanta, GA': { maxPrice: 450000, grossYield: 9.00 },
      'Charlotte, NC': { maxPrice: 475000, grossYield: 8.00 },
      'Columbia, SC': { maxPrice: 350000, grossYield: 10.00 },
      'Dallas-Fort Worth, TX': { maxPrice: 450000, grossYield: 9.50 },
      'Greensboro-Winston Salem, NC': { maxPrice: 400000, grossYield: 8.00 },
      'Greenville, SC': { maxPrice: 375000, grossYield: 9.00 },
      'Houston, TX': { maxPrice: 375000, grossYield: 10.50 },
      'Indianapolis, IN': { maxPrice: 400000, grossYield: 9.50 },
      'Jacksonville, FL': { maxPrice: 450000, grossYield: 9.00 },
      'Las Vegas, NV': { maxPrice: 550000, grossYield: 7.00 },
      'Nashville, TN': { maxPrice: 550000, grossYield: 7.00 },
      'Orlando, FL': { maxPrice: 450000, grossYield: 9.00 },
      'Phoenix, AZ': { maxPrice: 550000, grossYield: 8.00 },
      'Raleigh, NC': { maxPrice: 450000, grossYield: 8.00 },
      'Tampa, FL': { maxPrice: 475000, grossYield: 9.25 }
    },

    // Rental Strategy specifics
    rentalMinCapRate: 0.07,  // Based on gross yields shown (7-10.5%)
  },
  scoringWeights: {
    geographic: 30,      // State + County very important
    price: 20,
    propertyType: 10,
    bedrooms: 5,
    bathrooms: 5,
    yearBuilt: 10,       // 1995+ is important
    occupancy: 5,
    hoa: 5,
    photos: 0,
    condition: 5,
    riskFactors: 5,      // Flood zone, septic, etc.
    strategyMetrics: 0,
    custom: 0
  }
};

seedTriconBuyBox();
