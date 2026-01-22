/**
 * Generate detailed PDF report of all buy boxes
 */
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import sequelize from '../src/config/database';
import HedgeFundBuyBox from '../src/models/HedgeFundBuyBox';

const outputPath = './reports/buybox-report.pdf';

async function generatePDF() {
  await sequelize.authenticate();
  const boxes = await HedgeFundBuyBox.findAll({ order: [['fundName', 'ASC']] });

  // Ensure reports directory exists
  if (!fs.existsSync('./reports')) {
    fs.mkdirSync('./reports', { recursive: true });
  }

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });

  doc.pipe(fs.createWriteStream(outputPath));

  // Title Page
  doc.fontSize(28).font('Helvetica-Bold').text('Buy Box Criteria Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).font('Helvetica').text('Dispotree Platform', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).text('Generated: ' + new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }), { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).text('Total Buy Boxes: ' + boxes.length, { align: 'center' });

  // Table of Contents
  doc.addPage();
  doc.fontSize(20).font('Helvetica-Bold').text('Table of Contents');
  doc.moveDown();

  boxes.forEach((box, i) => {
    const contactStatus = box.contactEmail ? '' : ' [NO CONTACT]';
    doc.fontSize(11).font('Helvetica').text((i + 1) + '. ' + box.fundName + contactStatus);
  });

  // Individual Buy Box Pages
  for (const box of boxes) {
    doc.addPage();
    const c = (box.criteria as any) || {};
    const mc = (box.marketContacts as any[]) || [];

    // Header
    doc.rect(50, 50, 512, 40).fill('#2563eb');
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
       .text(box.fundName || 'Unknown Fund', 60, 62, { width: 492 });

    doc.fillColor('black');
    doc.moveDown(2);

    // Status badges
    let badgeX = 50;
    const badgeY = doc.y;

    // Priority badge
    const priorityColor = box.priority >= 10 ? '#dc2626' : box.priority >= 5 ? '#f59e0b' : '#22c55e';
    doc.rect(badgeX, badgeY, 80, 20).fill(priorityColor);
    doc.fillColor('white').fontSize(10).text('Priority: ' + box.priority, badgeX + 5, badgeY + 5);
    badgeX += 90;

    // Auto-submit badge
    if (box.autoSubmit) {
      doc.rect(badgeX, badgeY, 100, 20).fill('#7c3aed');
      doc.fillColor('white').text('Auto-Submit: ' + box.autoSubmitThreshold + '%', badgeX + 5, badgeY + 5);
      badgeX += 110;
    }

    // Enabled badge
    const enabledColor = box.enabled ? '#22c55e' : '#6b7280';
    doc.rect(badgeX, badgeY, 60, 20).fill(enabledColor);
    doc.fillColor('white').text(box.enabled ? 'Active' : 'Inactive', badgeX + 5, badgeY + 5);

    doc.fillColor('black');
    doc.moveDown(2);

    // Buy Box Name & Description
    doc.fontSize(11).font('Helvetica-Bold').text('Buy Box Name: ');
    doc.font('Helvetica').text(box.name);
    if (box.description) {
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica-Oblique').text(box.description);
    }
    doc.moveDown();

    // Contact Information Section
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb').text('Contact Information');
    doc.fillColor('black').moveDown(0.5);

    if (box.contactEmail || box.contactPhone) {
      doc.fontSize(10).font('Helvetica');
      if (box.contactEmail) doc.text('Email: ' + box.contactEmail);
      if (box.contactPhone) doc.text('Phone: ' + box.contactPhone);
    } else {
      doc.fontSize(10).font('Helvetica').fillColor('#dc2626').text('NO DEFAULT CONTACT SET');
      doc.fillColor('black');
    }

    // Market-specific contacts
    if (mc.length > 0) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Market Contacts:');
      doc.font('Helvetica');
      for (const contact of mc) {
        doc.text('  - ' + contact.name + ' (' + contact.email + '): ' + (contact.markets || []).join(', '));
      }
    }
    doc.moveDown();

    // Geographic Criteria Section
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb').text('Geographic Criteria');
    doc.fillColor('black').moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    if (c.states && c.states.length > 0) {
      doc.font('Helvetica-Bold').text('States: ', { continued: true });
      doc.font('Helvetica').text(c.states.join(', '));
    } else {
      doc.fillColor('#dc2626').text('No states specified');
      doc.fillColor('black');
    }

    if (c.counties && c.counties.length > 0) {
      doc.font('Helvetica-Bold').text('Counties: ', { continued: true });
      doc.font('Helvetica').text(c.counties.join(', '));
    }

    if (c.cities && c.cities.length > 0) {
      doc.font('Helvetica-Bold').text('Cities: ', { continued: true });
      doc.font('Helvetica').text(c.cities.join(', '));
    }

    if (c.zipCodes && c.zipCodes.length > 0) {
      doc.font('Helvetica-Bold').text('Zip Codes: ', { continued: true });
      doc.font('Helvetica').text(c.zipCodes.slice(0, 20).join(', ') + (c.zipCodes.length > 20 ? '...' : ''));
    }
    doc.moveDown();

    // Pricing Section
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb').text('Pricing Requirements');
    doc.fillColor('black').moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    const minPrice = c.minPrice ? '$' + c.minPrice.toLocaleString() : 'No minimum';
    const maxPrice = c.maxPrice ? '$' + c.maxPrice.toLocaleString() : 'No maximum';
    doc.font('Helvetica-Bold').text('Purchase Price: ', { continued: true });
    doc.font('Helvetica').text(minPrice + ' - ' + maxPrice);

    if (c.minARV || c.maxARV) {
      const minARV = c.minARV ? '$' + c.minARV.toLocaleString() : 'No min';
      const maxARV = c.maxARV ? '$' + c.maxARV.toLocaleString() : 'No max';
      doc.font('Helvetica-Bold').text('ARV Range: ', { continued: true });
      doc.font('Helvetica').text(minARV + ' - ' + maxARV);
    }

    if (c.minGrossYield) {
      doc.font('Helvetica-Bold').text('Minimum Gross Yield: ', { continued: true });
      doc.font('Helvetica').text((c.minGrossYield * 100).toFixed(1) + '%');
    }

    // Market-specific pricing
    if (c.marketPrices && Object.keys(c.marketPrices).length > 0) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Market-Specific Pricing:');
      doc.font('Helvetica');
      for (const [market, pricing] of Object.entries(c.marketPrices as Record<string, any>)) {
        const p = pricing as any;
        doc.text('  - ' + market + ': Max $' + (p.maxPrice || 0).toLocaleString() +
                 (p.grossYield ? ', Yield ' + p.grossYield + '%' : ''));
      }
    }
    doc.moveDown();

    // Property Specifications Section
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb').text('Property Specifications');
    doc.fillColor('black').moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    if (c.propertyTypes && c.propertyTypes.length > 0) {
      doc.font('Helvetica-Bold').text('Property Types: ', { continued: true });
      doc.font('Helvetica').text(c.propertyTypes.join(', '));
    }

    const minBeds = c.minBedrooms || 'Any';
    const maxBeds = c.maxBedrooms || 'Any';
    doc.font('Helvetica-Bold').text('Bedrooms: ', { continued: true });
    doc.font('Helvetica').text(minBeds + ' - ' + maxBeds);

    const minBaths = c.minBathrooms || 'Any';
    const maxBaths = c.maxBathrooms || 'Any';
    doc.font('Helvetica-Bold').text('Bathrooms: ', { continued: true });
    doc.font('Helvetica').text(minBaths + ' - ' + maxBaths);

    if (c.minSqft || c.maxSqft) {
      doc.font('Helvetica-Bold').text('Square Footage: ', { continued: true });
      doc.font('Helvetica').text((c.minSqft || 'Any') + ' - ' + (c.maxSqft || 'Any') + ' sqft');
    }

    if (c.minYearBuilt) {
      doc.font('Helvetica-Bold').text('Year Built: ', { continued: true });
      doc.font('Helvetica').text(c.minYearBuilt + ' or newer');
    }

    if (c.minGarages !== undefined) {
      doc.font('Helvetica-Bold').text('Garage: ', { continued: true });
      doc.font('Helvetica').text('Minimum ' + c.minGarages + ' car');
    }

    if (c.minLotSize || c.maxLotSize) {
      doc.font('Helvetica-Bold').text('Lot Size: ', { continued: true });
      doc.font('Helvetica').text((c.minLotSize || 'Any') + ' - ' + (c.maxLotSize || 'Any') + ' sqft');
    }
    doc.moveDown();

    // Hard NOs Section
    const hardNos: string[] = [];
    if (c.allowPool === false) hardNos.push('No pools');
    if (c.allowSeptic === false) hardNos.push('No septic');
    if (c.allowFloodZone === false) hardNos.push('No flood zones');
    if (c.allowMainRoad === false) hardNos.push('No main roads');
    if (c.allowCarport === false) hardNos.push('No carports');
    if (c.allowMobileHome === false) hardNos.push('No mobile homes');
    if (c.allowAgeRestricted === false) hardNos.push('No age-restricted');
    if (c.hardNos) hardNos.push(c.hardNos);

    if (hardNos.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#dc2626').text('Hard NOs - Automatic Decline');
      doc.fillColor('black').moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      for (const no of hardNos) {
        doc.text('  • ' + no);
      }
      doc.moveDown();
    }

    // Investment Strategy Section
    if (c.investmentStrategies && c.investmentStrategies.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb').text('Investment Strategies');
      doc.fillColor('black').moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(c.investmentStrategies.join(', '));
      doc.moveDown();
    }

    // Condition Requirements
    if (c.conditions && c.conditions.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb').text('Acceptable Conditions');
      doc.fillColor('black').moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(c.conditions.join(', '));
      doc.moveDown();
    }

    // Scoring Weights Section
    if (box.scoringWeights) {
      const sw = box.scoringWeights as any;
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb').text('Scoring Weights');
      doc.fillColor('black').moveDown(0.5);
      doc.fontSize(10).font('Helvetica');

      const weights = [
        { label: 'Geographic', value: sw.geographic },
        { label: 'Price', value: sw.price },
        { label: 'Property Type', value: sw.propertyType },
        { label: 'Bedrooms', value: sw.bedrooms },
        { label: 'Bathrooms', value: sw.bathrooms },
        { label: 'Year Built', value: sw.yearBuilt },
        { label: 'Occupancy', value: sw.occupancy },
        { label: 'HOA', value: sw.hoa },
        { label: 'Photos', value: sw.photos },
      ].filter(w => w.value !== undefined);

      let weightText = weights.map(w => w.label + ': ' + w.value + '%').join(' | ');
      doc.text(weightText);
      doc.moveDown();
    }

    // Footer with metadata
    doc.moveDown();
    doc.fontSize(8).fillColor('#6b7280');
    doc.text('ID: ' + box.id);
    doc.text('Created: ' + new Date(box.createdAt).toLocaleDateString());
    doc.text('Last Updated: ' + new Date(box.updatedAt).toLocaleDateString());
  }

  // Summary page
  doc.addPage();
  doc.fontSize(20).font('Helvetica-Bold').fillColor('black').text('Summary Statistics');
  doc.moveDown();

  const withContacts = boxes.filter(b => b.contactEmail).length;
  const withAutoSubmit = boxes.filter(b => b.autoSubmit).length;
  const enabled = boxes.filter(b => b.enabled).length;

  const allStates = new Set<string>();
  boxes.forEach(b => {
    const c = b.criteria as any;
    if (c?.states) c.states.forEach((s: string) => allStates.add(s));
  });

  doc.fontSize(12).font('Helvetica');
  doc.text('Total Buy Boxes: ' + boxes.length);
  doc.text('With Default Contact: ' + withContacts + ' (' + Math.round(withContacts/boxes.length*100) + '%)');
  doc.text('Missing Contact: ' + (boxes.length - withContacts));
  doc.text('Auto-Submit Enabled: ' + withAutoSubmit);
  doc.text('Currently Active: ' + enabled);
  doc.text('Unique States Covered: ' + allStates.size);
  doc.moveDown();

  doc.font('Helvetica-Bold').text('States Coverage:');
  doc.font('Helvetica').text(Array.from(allStates).sort().join(', '));
  doc.moveDown(2);

  doc.font('Helvetica-Bold').text('Buy Boxes Missing Contacts:');
  doc.font('Helvetica');
  boxes.filter(b => !b.contactEmail).forEach(b => {
    doc.text('  • ' + b.fundName);
  });

  doc.end();

  console.log('PDF generated: ' + outputPath);
  await sequelize.close();
}

generatePDF().catch(e => console.error('Error:', e.message));
