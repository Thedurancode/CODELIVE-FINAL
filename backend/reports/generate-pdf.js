const { chromium } = require('playwright');
const path = require('path');

async function generatePDF() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const htmlPath = path.join(__dirname, 'week1-progress-report.html');
  const pdfPath = path.join(__dirname, 'Dispotree-Week1-Progress-Report-Dec19-2025.pdf');

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: {
      top: '20mm',
      bottom: '20mm',
      left: '15mm',
      right: '15mm'
    },
    printBackground: true
  });

  await browser.close();

  console.log(`PDF generated: ${pdfPath}`);
}

generatePDF().catch(console.error);
