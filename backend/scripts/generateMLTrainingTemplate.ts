/**
 * Generate ML Training Data Excel Template with Dropdowns
 *
 * Creates an Excel file with:
 * - All required and optional columns
 * - Data validation dropdowns for categorical fields
 * - Example data row
 * - Instructions sheet
 *
 * Run: npx ts-node scripts/generateMLTrainingTemplate.ts
 */

import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

const outputDir = path.join(__dirname, '..', 'data');
const outputPath = path.join(outputDir, 'ML_Training_Template.xlsx');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Reference data for dropdowns
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const PROPERTY_TYPES = [
  'single_family', 'condo', 'townhouse', 'multi_family',
  'duplex', 'triplex', 'quadplex', 'manufactured', 'land', 'other'
];

const RESPONSE_TYPES = [
  'closed', 'offer_accepted', 'offer_made', 'interested', 'passed', 'no_response'
];

const LOSS_CATEGORIES = [
  'price', 'condition', 'location', 'competition', 'timing', 'financing', 'other'
];

const WIN_FACTORS = [
  'quick_close', 'good_comps', 'below_market_rent', 'tenant_quality',
  'newer_build', 'low_rehab', 'good_schools', 'premium_location',
  'turnkey', 'growing_market', 'cash_flow', 'appreciation'
];

const OCCUPANCY_STATUS = ['vacant', 'occupied', 'unknown'];
const CONDITION = ['excellent', 'good', 'fair', 'poor'];

// Sample fund names (these should match your database)
const FUND_NAMES = [
  'Tricon Residential',
  'FirstKey Homes',
  'Amherst Holdings',
  'Invitation Homes',
  'Progress Residential',
  'American Homes 4 Rent',
  'Pretium Partners',
  'Cerberus Capital',
  'Starwood Waypoint',
  'Colony Starwood',
  'Home Partners',
  'Vinebrook Homes',
  'SFR REIT Fund',
  'American Residential',
  'Haven Realty',
  'Roofstock',
  'Fundrise',
  'Mynd Management',
  'Evernest',
  'Bungalo'
];

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dispotree';
  workbook.created = new Date();

  // ============================================================================
  // REFERENCE DATA SHEET (hidden, used for dropdowns)
  // ============================================================================
  const refSheet = workbook.addWorksheet('_Reference', { state: 'veryHidden' });

  // Add reference data in columns
  refSheet.getColumn('A').values = ['States', ...US_STATES];
  refSheet.getColumn('B').values = ['Property Types', ...PROPERTY_TYPES];
  refSheet.getColumn('C').values = ['Response Types', ...RESPONSE_TYPES];
  refSheet.getColumn('D').values = ['Loss Categories', ...LOSS_CATEGORIES];
  refSheet.getColumn('E').values = ['Win Factors', ...WIN_FACTORS];
  refSheet.getColumn('F').values = ['Occupancy', ...OCCUPANCY_STATUS];
  refSheet.getColumn('G').values = ['Condition', ...CONDITION];
  refSheet.getColumn('H').values = ['Fund Names', ...FUND_NAMES];

  // ============================================================================
  // INSTRUCTIONS SHEET
  // ============================================================================
  const instructionsSheet = workbook.addWorksheet('Instructions');
  instructionsSheet.properties.tabColor = { argb: '2563EB' };

  // Title
  instructionsSheet.mergeCells('A1:F1');
  const titleCell = instructionsSheet.getCell('A1');
  titleCell.value = 'ML Training Data Template - Instructions';
  titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  instructionsSheet.getRow(1).height = 40;

  // Instructions content
  const instructions = [
    ['', ''],
    ['OVERVIEW', ''],
    ['This template helps you collect training data for the Dispotree ML model.', ''],
    ['The model predicts deal success probability based on historical outcomes.', ''],
    ['', ''],
    ['REQUIRED FIELDS (columns with * are required)', ''],
    ['- deal_id: Unique identifier for each deal', ''],
    ['- asking_price: Current asking price in USD', ''],
    ['- arv: After Repair Value estimate', ''],
    ['- state: 2-letter state code (use dropdown)', ''],
    ['- property_type: Type of property (use dropdown)', ''],
    ['- fund_name: Fund that received the deal (use dropdown)', ''],
    ['- response_type: How the fund responded (use dropdown)', ''],
    ['', ''],
    ['RESPONSE TYPES EXPLAINED', ''],
    ['POSITIVE (Label = 1):', ''],
    ['  - closed: Deal closed successfully', ''],
    ['  - offer_accepted: Offer accepted, heading to close', ''],
    ['NEUTRAL (exclude from training until resolved):', ''],
    ['  - offer_made: Fund made offer, waiting for response', ''],
    ['  - interested: Fund expressed interest', ''],
    ['NEGATIVE (Label = 0):', ''],
    ['  - passed: Fund passed on deal', ''],
    ['  - no_response: No response after 14+ days', ''],
    ['', ''],
    ['WIN/LOSS ANALYSIS', ''],
    ['For POSITIVE outcomes: Fill in win_factors (semicolon-separated)', ''],
    ['For NEGATIVE outcomes: Fill in loss_category', ''],
    ['', ''],
    ['TIPS FOR BETTER MODEL ACCURACY', ''],
    ['1. Include BOTH wins and losses (aim for 30-70% positive)', ''],
    ['2. Be honest about loss reasons', ''],
    ['3. Include geographic diversity', ''],
    ['4. Record actual outcomes when deals close', ''],
    ['5. Minimum 100 samples required to train', ''],
    ['', ''],
    ['HOW TO IMPORT', ''],
    ['1. Fill in the Training_Data sheet', ''],
    ['2. Save as CSV or keep as XLSX', ''],
    ['3. Upload via the ML Training page or API', ''],
  ];

  instructions.forEach((row, idx) => {
    const rowNum = idx + 3;
    instructionsSheet.getCell(`A${rowNum}`).value = row[0];
    if (row[0].startsWith('REQUIRED') || row[0].startsWith('RESPONSE') ||
        row[0].startsWith('WIN/LOSS') || row[0].startsWith('TIPS') ||
        row[0].startsWith('HOW TO') || row[0] === 'OVERVIEW') {
      instructionsSheet.getCell(`A${rowNum}`).font = { bold: true, size: 12 };
    }
  });

  instructionsSheet.getColumn('A').width = 60;

  // ============================================================================
  // MAIN DATA SHEET
  // ============================================================================
  const dataSheet = workbook.addWorksheet('Training_Data');
  dataSheet.properties.tabColor = { argb: '16A34A' };

  // Define columns
  const columns = [
    { header: 'deal_id *', key: 'deal_id', width: 15 },
    { header: 'asking_price *', key: 'asking_price', width: 15 },
    { header: 'arv *', key: 'arv', width: 12 },
    { header: 'sqft', key: 'sqft', width: 10 },
    { header: 'year_built', key: 'year_built', width: 12 },
    { header: 'bedrooms', key: 'bedrooms', width: 10 },
    { header: 'bathrooms', key: 'bathrooms', width: 10 },
    { header: 'repair_estimate', key: 'repair_estimate', width: 15 },
    { header: 'monthly_rent', key: 'monthly_rent', width: 12 },
    { header: 'photo_count', key: 'photo_count', width: 12 },
    { header: 'street', key: 'street', width: 20 },
    { header: 'city', key: 'city', width: 15 },
    { header: 'state *', key: 'state', width: 8 },
    { header: 'zip', key: 'zip', width: 10 },
    { header: 'property_type *', key: 'property_type', width: 15 },
    { header: 'occupancy_status', key: 'occupancy_status', width: 15 },
    { header: 'condition', key: 'condition', width: 12 },
    { header: 'fund_name *', key: 'fund_name', width: 22 },
    { header: 'buy_box_id', key: 'buy_box_id', width: 18 },
    { header: 'submission_score', key: 'submission_score', width: 16 },
    { header: 'response_type *', key: 'response_type', width: 15 },
    { header: 'offer_amount', key: 'offer_amount', width: 12 },
    { header: 'loss_category', key: 'loss_category', width: 14 },
    { header: 'win_factors', key: 'win_factors', width: 30 },
    { header: 'lessons_learned', key: 'lessons_learned', width: 40 },
  ];

  dataSheet.columns = columns;

  // Style header row
  const headerRow = dataSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 25;

  // Color-code required columns
  const requiredCols = [1, 2, 3, 13, 15, 18, 21]; // deal_id, asking_price, arv, state, property_type, fund_name, response_type
  requiredCols.forEach(colNum => {
    const cell = headerRow.getCell(colNum);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } };
  });

  // Add example data row
  dataSheet.addRow({
    deal_id: 'deal-001',
    asking_price: 185000,
    arv: 265000,
    sqft: 1850,
    year_built: 1998,
    bedrooms: 3,
    bathrooms: 2,
    repair_estimate: 35000,
    monthly_rent: 1800,
    photo_count: 12,
    street: '123 Oak Lane',
    city: 'Orlando',
    state: 'FL',
    zip: '32801',
    property_type: 'single_family',
    occupancy_status: 'vacant',
    condition: 'good',
    fund_name: 'Tricon Residential',
    buy_box_id: 'bb-tricon-001',
    submission_score: 87.5,
    response_type: 'closed',
    offer_amount: 178000,
    loss_category: '',
    win_factors: 'quick_close;good_comps',
    lessons_learned: 'Great location near schools helped close fast',
  });

  // Add second example (negative outcome)
  dataSheet.addRow({
    deal_id: 'deal-002',
    asking_price: 145000,
    arv: 195000,
    sqft: 1200,
    year_built: 1985,
    bedrooms: 2,
    bathrooms: 1,
    repair_estimate: 25000,
    monthly_rent: 1200,
    photo_count: 8,
    street: '456 Pine St',
    city: 'Jacksonville',
    state: 'FL',
    zip: '32204',
    property_type: 'single_family',
    occupancy_status: 'occupied',
    condition: 'fair',
    fund_name: 'FirstKey Homes',
    buy_box_id: 'bb-firstkey-001',
    submission_score: 72.3,
    response_type: 'passed',
    offer_amount: '',
    loss_category: 'price',
    win_factors: '',
    lessons_learned: 'Price too high for condition - should have negotiated harder',
  });

  // Style example rows
  [2, 3].forEach(rowNum => {
    const row = dataSheet.getRow(rowNum);
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    row.font = { italic: true, color: { argb: '64748B' } };
  });

  // Add data validation dropdowns for rows 4-1000
  const validationRows = 1000;

  // State dropdown (column M = 13)
  for (let i = 4; i <= validationRows; i++) {
    dataSheet.getCell(`M${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'_Reference'!$A$2:$A$${US_STATES.length + 1}`],
    };
  }

  // Property Type dropdown (column O = 15)
  for (let i = 4; i <= validationRows; i++) {
    dataSheet.getCell(`O${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'_Reference'!$B$2:$B$${PROPERTY_TYPES.length + 1}`],
    };
  }

  // Occupancy Status dropdown (column P = 16)
  for (let i = 4; i <= validationRows; i++) {
    dataSheet.getCell(`P${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'_Reference'!$F$2:$F$${OCCUPANCY_STATUS.length + 1}`],
    };
  }

  // Condition dropdown (column Q = 17)
  for (let i = 4; i <= validationRows; i++) {
    dataSheet.getCell(`Q${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'_Reference'!$G$2:$G$${CONDITION.length + 1}`],
    };
  }

  // Fund Name dropdown (column R = 18)
  for (let i = 4; i <= validationRows; i++) {
    dataSheet.getCell(`R${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'_Reference'!$H$2:$H$${FUND_NAMES.length + 1}`],
    };
  }

  // Response Type dropdown (column U = 21)
  for (let i = 4; i <= validationRows; i++) {
    dataSheet.getCell(`U${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'_Reference'!$C$2:$C$${RESPONSE_TYPES.length + 1}`],
    };
  }

  // Loss Category dropdown (column W = 23)
  for (let i = 4; i <= validationRows; i++) {
    dataSheet.getCell(`W${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'_Reference'!$D$2:$D$${LOSS_CATEGORIES.length + 1}`],
    };
  }

  // Freeze header row
  dataSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Add autofilter
  dataSheet.autoFilter = {
    from: 'A1',
    to: 'Y1',
  };

  // ============================================================================
  // WIN FACTORS REFERENCE SHEET
  // ============================================================================
  const winFactorsSheet = workbook.addWorksheet('Win_Factors_Reference');
  winFactorsSheet.properties.tabColor = { argb: '16A34A' };

  winFactorsSheet.columns = [
    { header: 'Win Factor', key: 'factor', width: 20 },
    { header: 'Description', key: 'description', width: 50 },
  ];

  const winFactorDescriptions = [
    ['quick_close', 'Deal closed faster than typical timeline'],
    ['good_comps', 'Strong comparable sales supporting ARV'],
    ['below_market_rent', 'Current rent below market rate (upside potential)'],
    ['tenant_quality', 'Quality tenant in place with good payment history'],
    ['newer_build', 'Property built in last 10-15 years'],
    ['low_rehab', 'Minimal repairs needed'],
    ['good_schools', 'Located in good school district'],
    ['premium_location', 'Desirable neighborhood/location'],
    ['turnkey', 'Move-in ready, no work needed'],
    ['growing_market', 'Strong population/job growth in area'],
    ['cash_flow', 'Strong monthly cash flow potential'],
    ['appreciation', 'Strong appreciation potential'],
  ];

  winFactorDescriptions.forEach(([factor, desc]) => {
    winFactorsSheet.addRow({ factor, description: desc });
  });

  // Style header
  const wfHeaderRow = winFactorsSheet.getRow(1);
  wfHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  wfHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '16A34A' } };

  // Add note about semicolon separation
  winFactorsSheet.addRow({});
  winFactorsSheet.addRow({ factor: 'NOTE:', description: 'Separate multiple factors with semicolons (;) in the win_factors column' });
  winFactorsSheet.getRow(winFactorsSheet.rowCount).font = { italic: true };

  // ============================================================================
  // SAVE WORKBOOK
  // ============================================================================
  await workbook.xlsx.writeFile(outputPath);

  console.log('\n✅ Excel template generated successfully!');
  console.log(`📄 Location: ${outputPath}`);
  console.log('\nThe template includes:');
  console.log('  - Training_Data sheet with dropdown validations');
  console.log('  - Instructions sheet');
  console.log('  - Win_Factors_Reference sheet');
  console.log('  - 2 example rows (delete before importing)');
  console.log('\nDropdowns available for:');
  console.log('  - State (50 US states + DC)');
  console.log('  - Property Type');
  console.log('  - Fund Name');
  console.log('  - Response Type');
  console.log('  - Occupancy Status');
  console.log('  - Condition');
  console.log('  - Loss Category');
}

generateTemplate().catch(console.error);
