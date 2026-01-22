/**
 * Generate ML Training Data Guide PDF
 *
 * Run: npx ts-node scripts/generateMLTrainingGuidePDF.ts
 */

import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const outputDir = path.join(__dirname, '..', 'data');
const outputPath = path.join(outputDir, 'ML_Training_Data_Guide.pdf');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const doc = new PDFDocument({
  margin: 50,
  size: 'LETTER',
  bufferPages: true,
  info: {
    Title: 'Dispotree ML Training Data Guide',
    Author: 'Dispotree',
    Subject: 'Machine Learning Training Data Requirements',
  }
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Colors
const BLUE = '#2563eb';
const DARK = '#1e293b';
const GRAY = '#64748b';
const GREEN = '#16a34a';
const RED = '#dc2626';

// Helper functions
const title = (text: string) => {
  doc.fontSize(20).fillColor(BLUE).font('Helvetica-Bold').text(text);
  doc.moveTo(50, doc.y + 5).lineTo(562, doc.y + 5).strokeColor(BLUE).lineWidth(2).stroke();
  doc.moveDown(0.8);
};

const section = (text: string) => {
  doc.fontSize(14).fillColor(DARK).font('Helvetica-Bold').text(text);
  doc.moveDown(0.3);
};

const subsection = (text: string) => {
  doc.fontSize(11).fillColor(GRAY).font('Helvetica-Bold').text(text);
  doc.moveDown(0.2);
};

const para = (text: string) => {
  doc.fontSize(10).fillColor(DARK).font('Helvetica').text(text, { lineGap: 2 });
  doc.moveDown(0.3);
};

const bullet = (text: string) => {
  doc.fontSize(10).fillColor(DARK).font('Helvetica').text(`• ${text}`, 60);
};

const code = (text: string) => {
  doc.rect(50, doc.y, 512, 14 * text.split('\n').length + 10).fill('#f1f5f9');
  doc.fillColor('#334155').font('Courier').fontSize(9);
  doc.text(text, 55, doc.y + 5);
  doc.moveDown(0.5);
};

// ============================================================================
// PAGE 1: COVER
// ============================================================================

doc.rect(0, 0, 612, 120).fill(BLUE);
doc.fillColor('white').fontSize(28).font('Helvetica-Bold').text('ML Training Data Guide', 50, 40);
doc.fontSize(14).font('Helvetica').text('Dispotree Deal Quality Prediction Model', 50, 75);
doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, 50, 100);

doc.y = 150;

title('Overview');

para('The Dispotree ML model predicts deal success probability - whether a deal will be accepted by a fund and close successfully. It uses an 85-dimension feature vector.');

section('Minimum Requirements');
bullet('Minimum samples: 100 (model won\'t train with fewer)');
bullet('Recommended samples: 500+ for better accuracy');
bullet('Positive/Negative ratio: 30-70% positive');
bullet('Required fields: 14 columns minimum');

doc.moveDown(0.5);

section('85-Dimension Feature Vector');
bullet('9 Numeric features: price, ARV, sqft, year, beds, baths, photos, repair, rent');
bullet('6 Derived features: price/sqft, ARV ratio, equity %, age, repair ratio, rent ratio');
bullet('50 One-hot state features (US states)');
bullet('10 One-hot property type features');
bullet('5 Buy box match features');
bullet('16 Image analysis features');

// ============================================================================
// PAGE 2: REQUIRED FIELDS
// ============================================================================

doc.addPage();
title('Required CSV Columns');

section('Core Deal Information (REQUIRED)');
para('These fields are essential for the model to make predictions:');

code(
`deal_id        string   "deal-001"        Unique identifier
asking_price   number   185000            Current asking price ($)
arv            number   265000            After Repair Value ($)
sqft           number   1850              Square footage
year_built     number   1998              Year built
bedrooms       number   3                 Bedroom count
bathrooms      number   2.5               Bathroom count
repair_estimate number  35000             Rehab cost ($)
state          string   "FL"              2-letter state code
property_type  string   "single_family"   Property type`
);

section('Fund Response (REQUIRED FOR TRAINING LABELS)');
para('These fields determine if a deal was successful (training labels):');

code(
`fund_name        string   "Tricon"          Fund that received deal
buy_box_id       string   "bb-001"          Buy box ID used for scoring
submission_score number   87.5              Your score when submitted (0-100)
response_type    string   "closed"          Fund's response (see below)
offer_amount     number   178000            Fund's offer amount (if made)`
);

section('Response Types (Training Labels)');

doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold');
doc.text('POSITIVE (Label = 1):', 50);
doc.font('Helvetica').fillColor(DARK);
doc.text('• closed - Deal closed successfully', 60);
doc.text('• offer_accepted - Offer accepted, heading to close', 60);

doc.moveDown(0.3);
doc.fontSize(10).fillColor(RED).font('Helvetica-Bold');
doc.text('NEGATIVE (Label = 0):', 50);
doc.font('Helvetica').fillColor(DARK);
doc.text('• passed - Fund passed on deal', 60);
doc.text('• no_response - No response after 14+ days', 60);

doc.moveDown(0.3);
doc.fontSize(10).fillColor(GRAY).font('Helvetica-Bold');
doc.text('NEUTRAL (Wait for outcome):', 50);
doc.font('Helvetica').fillColor(DARK);
doc.text('• offer_made - Fund made offer (wait for acceptance)', 60);
doc.text('• interested - Fund expressed interest (wait for action)', 60);

// ============================================================================
// PAGE 3: OPTIONAL FIELDS
// ============================================================================

doc.addPage();
title('Optional Fields');

section('Location Details (RECOMMENDED)');
code(
`street    string   "123 Oak Lane"   Street address
city      string   "Orlando"        City name
zip       string   "32801"          ZIP code`
);

section('Market Data (RECOMMENDED)');
code(
`monthly_rent      number   1800       Expected monthly rent ($)
days_on_market    number   14         Days since listing
photo_count       number   12         Number of listing photos
occupancy_status  string   "vacant"   vacant, occupied, unknown
condition         string   "good"     excellent, good, fair, poor`
);

section('Win/Loss Analysis (HIGHLY RECOMMENDED)');
para('This data helps the model learn WHY deals succeed or fail:');

code(
`loss_category     string   "price"           Why deal was lost
win_factors       string   "quick_close"     Success factors (semicolon-separated)
lessons_learned   string   "text"            Notes for future reference`
);

subsection('Loss Categories:');
code('price, condition, location, competition, timing, financing, other');

subsection('Win Factors (examples):');
code('quick_close, good_comps, below_market_rent, tenant_quality,\nnewer_build, low_rehab, good_schools, premium_location, turnkey');

section('Image Features (OPTIONAL)');
code(
`image_quality_score  number   75       Overall quality (0-100)
image_condition      string   "good"   excellent, good, fair, poor
has_updated_kitchen  0/1      1        Kitchen appears updated
has_hardwood         0/1      1        Has hardwood floors
has_natural_light    0/1      1        Good natural lighting
has_damage           0/1      0        Visible damage in photos
needs_repair         0/1      0        Obvious repairs needed
is_dated             0/1      0        Appears dated`
);

// ============================================================================
// PAGE 4: VALID VALUES
// ============================================================================

doc.addPage();
title('Valid Values Reference');

section('Property Types');
code('single_family, condo, townhouse, multi_family, duplex,\ntriplex, quadplex, manufactured, land, other');

section('US State Codes');
code(
`AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI, ID, IL, IN, IA,
KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ,
NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT,
VA, WA, WV, WI, WY, DC`
);

section('Derived Features (Auto-Calculated)');
para('The model automatically calculates these from your data:');

code(
`Price per sqft      = asking_price / sqft
ARV to price ratio  = arv / asking_price
Equity percentage   = ((arv - asking_price) / arv) * 100
Property age        = current_year - year_built
Repair to price     = repair_estimate / asking_price
Rent to price       = (monthly_rent * 12) / asking_price`
);

section('Model Performance Targets');
para('After training, aim for these metrics:');

code(
`Accuracy    > 70%    Overall correctness
Precision   > 65%    True positives / predicted positives
Recall      > 60%    True positives / actual positives
F1 Score    > 62%    Harmonic mean of precision/recall
AUC         > 0.70   Area under ROC curve`
);

// ============================================================================
// PAGE 5: WORKFLOW & EXAMPLES
// ============================================================================

doc.addPage();
title('Training Workflow');

section('Step 1: Collect Data');
para('For every deal you send to a fund, record all deal details plus fund name and your submission score.');

section('Step 2: Track Responses');
para('Update response_type when the fund responds:');
bullet('They pass → "passed"');
bullet('They make offer → "offer_made"');
bullet('You accept offer → "offer_accepted"');
bullet('Deal closes → "closed"');
bullet('No response in 14 days → "no_response"');

section('Step 3: Analyze Outcomes');
bullet('For passed deals: Record loss_category (why they passed)');
bullet('For closed deals: Record win_factors (what made it successful)');

section('Step 4: Train the Model');
para('Once you have 100+ samples, train via API, Agent, or CLI:');

code(
`# API
POST /api/ml/train
{"minSamples": 100, "validationSplit": 0.2, "epochs": 100}

# Agent Command
"Train the ML model with the latest feedback data"

# CLI
npm run train:ml`
);

section('Import Training Data');
code(
`curl -X POST http://localhost:3001/api/ml/training/import \\
  -F "file=@backend/data/ml_training_data.csv"`
);

// ============================================================================
// PAGE 6: EXAMPLE DATA
// ============================================================================

doc.addPage();
title('Example Training Data');

section('Positive Example (Closed Deal)');
code(
`deal_id,asking_price,arv,sqft,year_built,bedrooms,bathrooms,state,property_type
deal-001,185000,265000,1850,1998,3,2,FL,single_family

repair_estimate,monthly_rent,fund_name,submission_score,response_type,offer_amount
35000,1800,Tricon Residential,87.5,closed,178000

win_factors,lessons_learned
quick_close;good_comps,Great location near schools helped close fast`
);

section('Negative Example (Passed Deal)');
code(
`deal_id,asking_price,arv,sqft,year_built,bedrooms,bathrooms,state,property_type
deal-002,145000,195000,1200,1985,2,1,FL,single_family

repair_estimate,monthly_rent,fund_name,submission_score,response_type
25000,1200,FirstKey Homes,72.3,passed

loss_category,lessons_learned
price,Price too high for condition - should have negotiated harder`
);

section('Data Quality Tips');
doc.fillColor(GREEN);
bullet('Include both wins AND losses');
bullet('Be honest about loss reasons');
bullet('Include geographic diversity');
bullet('Update outcomes when deals close');

doc.moveDown(0.3);
doc.fillColor(RED);
bullet('Don\'t only log winners');
bullet('Don\'t leave ARV empty');
bullet('Don\'t use inconsistent state codes');
bullet('Don\'t forget to update response outcomes');

doc.fillColor(DARK);
doc.moveDown(0.5);

section('File Locations');
code(
`Example CSV:  /backend/data/ml_training_example.csv
Your data:    /backend/data/ml_training_data.csv
This PDF:     /backend/data/ML_Training_Data_Guide.pdf`
);

// ============================================================================
// ADD FOOTERS
// ============================================================================

const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor(GRAY).font('Helvetica');
  doc.text(`Dispotree ML Training Guide | Page ${i + 1} of ${range.count}`, 50, 750, {
    align: 'center',
    width: 512
  });
}

// Finalize
doc.end();

writeStream.on('finish', () => {
  console.log(`\n✅ PDF generated successfully!`);
  console.log(`📄 Location: ${outputPath}`);
  console.log(`📊 Pages: ${range.count}`);
});
