/**
 * Deal Export Service
 *
 * Generates CSV and PDF exports of deals for email delivery.
 */

import { Resend } from 'resend';
import PDFDocument from 'pdfkit';
import { NormalizedDeal } from './marketplace/FeedService';

interface ExportDeal extends Partial<NormalizedDeal> {
  matchScore?: number;
  likedAt?: string;
  notes?: string;
}

class DealExportService {
  private resend: Resend | null = null;

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  }

  /**
   * Generate CSV content from deals
   */
  generateCSV(deals: ExportDeal[]): string {
    const headers = [
      'Address',
      'City',
      'State',
      'Zip',
      'Price',
      'ARV',
      'Equity %',
      'Potential Profit',
      'Property Type',
      'Bedrooms',
      'Bathrooms',
      'Sqft',
      'Year Built',
      'Match Score',
      'Liked At',
      'Notes',
      'Status',
      'Days on Market',
    ];

    const rows = deals.map((deal) => {
      const price = deal.price || 0;
      const arv = deal.arv || 0;
      const equity = arv > 0 ? ((arv - price) / arv * 100).toFixed(1) : '';
      const profit = arv > 0 ? arv - price : '';

      return [
        this.escapeCSV(deal.address || ''),
        this.escapeCSV(deal.city || ''),
        this.escapeCSV(deal.state || ''),
        this.escapeCSV(deal.zip || ''),
        price,
        arv || '',
        equity,
        profit,
        this.escapeCSV(deal.propertyType || ''),
        deal.bedrooms || '',
        deal.bathrooms || '',
        deal.sqft || '',
        deal.yearBuilt || '',
        deal.matchScore || '',
        deal.likedAt ? new Date(deal.likedAt).toLocaleDateString() : '',
        this.escapeCSV(deal.notes || ''),
        this.escapeCSV(deal.status || ''),
        deal.daysOnMarket || '',
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Escape CSV field
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Generate modern PDF with deal cards
   */
  async generatePDF(deals: ExportDeal[], userName: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#10B981'; // Green
      const textColor = '#1F2937';
      const mutedColor = '#6B7280';
      const cardBg = '#F9FAFB';

      // Header
      doc.fontSize(28)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text('Dispotree', 40, 40);

      doc.fontSize(12)
        .fillColor(mutedColor)
        .font('Helvetica')
        .text('Deal Export Report', 40, 75);

      doc.fontSize(10)
        .text(`Prepared for: ${userName}`, 40, 92);

      doc.text(`Generated: ${new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`, 40, 107);

      // Summary box
      doc.roundedRect(40, 135, 515, 50, 8)
        .fillColor('#ECFDF5')
        .fill();

      doc.fontSize(14)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(`${deals.length} Liked Deals`, 55, 150);

      const totalValue = deals.reduce((sum, d) => sum + (d.price || 0), 0);
      const avgMatch = deals.length > 0
        ? Math.round(deals.reduce((sum, d) => sum + (d.matchScore || 0), 0) / deals.length)
        : 0;

      doc.fontSize(10)
        .fillColor(mutedColor)
        .font('Helvetica')
        .text(`Total Value: $${totalValue.toLocaleString()}  |  Avg Match Score: ${avgMatch}%`, 55, 168);

      let yPosition = 210;
      const pageHeight = doc.page.height - 80;
      const cardHeight = 140;

      // Deal cards
      deals.forEach((deal, index) => {
        // Check if we need a new page
        if (yPosition + cardHeight > pageHeight) {
          doc.addPage();
          yPosition = 40;
        }

        const price = deal.price || 0;
        const arv = deal.arv || 0;
        const equity = arv > 0 ? ((arv - price) / arv * 100) : 0;
        const profit = arv > 0 ? arv - price : 0;

        // Card background
        doc.roundedRect(40, yPosition, 515, cardHeight - 10, 8)
          .fillColor(cardBg)
          .fill();

        // Match score badge
        const matchColor = (deal.matchScore || 0) >= 80 ? '#10B981' :
          (deal.matchScore || 0) >= 60 ? '#F59E0B' : '#EF4444';

        doc.roundedRect(480, yPosition + 10, 60, 24, 4)
          .fillColor(matchColor)
          .fill();

        doc.fontSize(11)
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .text(`${deal.matchScore || 0}%`, 490, yPosition + 16, { width: 40, align: 'center' });

        // Price
        doc.fontSize(20)
          .fillColor(textColor)
          .font('Helvetica-Bold')
          .text(`$${price.toLocaleString()}`, 55, yPosition + 12);

        // Address
        doc.fontSize(11)
          .fillColor(textColor)
          .font('Helvetica')
          .text(`${deal.address || 'Unknown Address'}`, 55, yPosition + 38);

        doc.fontSize(10)
          .fillColor(mutedColor)
          .text(`${deal.city || ''}, ${deal.state || ''} ${deal.zip || ''}`, 55, yPosition + 52);

        // Property details row
        const detailsY = yPosition + 72;
        doc.fontSize(9)
          .fillColor(mutedColor);

        let xPos = 55;
        if (deal.propertyType) {
          doc.text(this.formatPropertyType(deal.propertyType), xPos, detailsY);
          xPos += 80;
        }
        if (deal.bedrooms) {
          doc.text(`${deal.bedrooms} bed`, xPos, detailsY);
          xPos += 45;
        }
        if (deal.bathrooms) {
          doc.text(`${deal.bathrooms} bath`, xPos, detailsY);
          xPos += 50;
        }
        if (deal.sqft) {
          doc.text(`${deal.sqft.toLocaleString()} sqft`, xPos, detailsY);
          xPos += 70;
        }
        if (deal.yearBuilt) {
          doc.text(`Built ${deal.yearBuilt}`, xPos, detailsY);
        }

        // Financial metrics row
        const metricsY = yPosition + 92;
        doc.fontSize(9);

        if (arv > 0) {
          doc.fillColor(mutedColor)
            .text('ARV: ', 55, metricsY, { continued: true })
            .fillColor(primaryColor)
            .font('Helvetica-Bold')
            .text(`$${arv.toLocaleString()}`, { continued: false });
        }

        if (equity > 0) {
          doc.fillColor(mutedColor)
            .font('Helvetica')
            .text('Equity: ', 155, metricsY, { continued: true })
            .fillColor(primaryColor)
            .font('Helvetica-Bold')
            .text(`${equity.toFixed(1)}%`, { continued: false });
        }

        if (profit > 0) {
          doc.fillColor(mutedColor)
            .font('Helvetica')
            .text('Profit: ', 255, metricsY, { continued: true })
            .fillColor(primaryColor)
            .font('Helvetica-Bold')
            .text(`$${profit.toLocaleString()}`, { continued: false });
        }

        // Notes if present
        if (deal.notes) {
          doc.fontSize(8)
            .fillColor(mutedColor)
            .font('Helvetica-Oblique')
            .text(`Notes: ${deal.notes}`, 55, yPosition + 112, {
              width: 480,
              ellipsis: true,
            });
        }

        yPosition += cardHeight;
      });

      // Footer on last page
      doc.fontSize(8)
        .fillColor(mutedColor)
        .font('Helvetica')
        .text(
          'Generated by Dispotree - B2B Real Estate Wholesale Platform',
          40,
          doc.page.height - 40,
          { align: 'center', width: 515 }
        );

      doc.end();
    });
  }

  /**
   * Format property type for display
   */
  private formatPropertyType(type: string): string {
    const types: Record<string, string> = {
      single_family: 'Single Family',
      multi_family: 'Multi-Family',
      townhouse: 'Townhouse',
      condo: 'Condo',
      duplex: 'Duplex',
      triplex: 'Triplex',
      fourplex: 'Fourplex',
      land: 'Land',
      commercial: 'Commercial',
    };
    return types[type] || type;
  }

  /**
   * Send export email with CSV and PDF attachments
   */
  async sendExportEmail(
    to: string,
    userName: string,
    deals: ExportDeal[]
  ): Promise<{ success: boolean; message: string }> {
    if (!this.resend) {
      console.log('Resend not configured, logging export request');
      return { success: false, message: 'Email service not configured' };
    }

    try {
      // Generate attachments
      const csvContent = this.generateCSV(deals);
      const pdfBuffer = await this.generatePDF(deals, userName);

      const totalValue = deals.reduce((sum, d) => sum + (d.price || 0), 0);

      await this.resend.emails.send({
        from: 'Dispotree <deals@dispotree.com>',
        to,
        subject: `Your Liked Deals Export - ${deals.length} Properties`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
              .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
              .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
              .logo { font-size: 28px; font-weight: bold; color: #10B981; margin-bottom: 24px; }
              h1 { font-size: 24px; color: #1f2937; margin: 0 0 16px; }
              p { color: #6b7280; line-height: 1.6; margin: 0 0 16px; }
              .stats { background: #ecfdf5; border-radius: 8px; padding: 20px; margin: 24px 0; }
              .stat { display: inline-block; margin-right: 32px; }
              .stat-value { font-size: 24px; font-weight: bold; color: #10B981; }
              .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
              .attachments { background: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 24px; }
              .attachment { display: flex; align-items: center; padding: 8px 0; }
              .attachment-icon { width: 32px; height: 32px; background: #10B981; border-radius: 6px; margin-right: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; }
              .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="card">
                <div class="logo">Dispotree</div>
                <h1>Your Liked Deals Export</h1>
                <p>Hi ${userName},</p>
                <p>Here's your export of ${deals.length} liked deals. We've attached both a CSV file for spreadsheet analysis and a beautifully formatted PDF report.</p>

                <div class="stats">
                  <div class="stat">
                    <div class="stat-value">${deals.length}</div>
                    <div class="stat-label">Properties</div>
                  </div>
                  <div class="stat">
                    <div class="stat-value">$${(totalValue / 1000000).toFixed(1)}M</div>
                    <div class="stat-label">Total Value</div>
                  </div>
                </div>

                <div class="attachments">
                  <p style="margin: 0 0 12px; font-weight: 600; color: #1f2937;">Attachments:</p>
                  <div class="attachment">
                    <div class="attachment-icon">CSV</div>
                    <span>liked-deals.csv - Full data for analysis</span>
                  </div>
                  <div class="attachment">
                    <div class="attachment-icon">PDF</div>
                    <span>liked-deals.pdf - Formatted report</span>
                  </div>
                </div>
              </div>

              <div class="footer">
                <p>Dispotree - B2B Real Estate Wholesale Platform</p>
              </div>
            </div>
          </body>
          </html>
        `,
        attachments: [
          {
            filename: 'liked-deals.csv',
            content: Buffer.from(csvContent).toString('base64'),
          },
          {
            filename: 'liked-deals.pdf',
            content: pdfBuffer.toString('base64'),
          },
        ],
      });

      return { success: true, message: 'Export email sent successfully' };
    } catch (error) {
      console.error('Failed to send export email:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }
}

export const dealExportService = new DealExportService();
export default dealExportService;
