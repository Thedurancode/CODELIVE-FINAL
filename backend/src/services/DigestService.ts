/**
 * DigestService - Daily Email Digest for Pipeline Updates
 *
 * Sends daily summary emails with:
 * - New deals received
 * - Pipeline stage changes
 * - Stale deals (no activity in X days)
 * - Win/loss summary
 * - Portfolio updates
 */

// @ts-ignore - nodemailer types
import nodemailer from 'nodemailer';
import { pipelineService } from './PipelineService';
import { portfolioService } from './PortfolioService';
import DealPipeline from '../models/DealPipeline';
import Property from '../models/Property';
import { Op, literal } from 'sequelize';

export interface DigestConfig {
  recipients: string[];
  fromEmail: string;
  staleDaysThreshold: number;
  includeNewDeals: boolean;
  includePipelineChanges: boolean;
  includeStaleDeals: boolean;
  includeWinLoss: boolean;
  includePortfolio: boolean;
}

export interface DigestData {
  generatedAt: Date;
  period: { start: Date; end: Date };
  newDeals: {
    count: number;
    deals: Array<{
      address: string;
      price: number;
      arv?: number;
      equity?: number;
      receivedAt: Date;
    }>;
  };
  pipelineChanges: {
    count: number;
    changes: Array<{
      dealId: string;
      address: string;
      fromStage: string;
      toStage: string;
      changedAt: Date;
    }>;
  };
  staleDeals: {
    count: number;
    deals: Array<{
      dealId: string;
      address: string;
      stage: string;
      daysSinceActivity: number;
    }>;
  };
  winLoss: {
    won: number;
    lost: number;
    withdrawn: number;
    winRate: number;
    totalValue: number;
  };
  portfolioSummary: {
    totalProperties: number;
    totalEquity: number;
    monthlyIncome: number;
    newAdditions: number;
  };
}

class DigestService {
  private transporter: nodemailer.Transporter | null = null;
  private defaultConfig: DigestConfig = {
    recipients: [],
    fromEmail: process.env.DIGEST_FROM_EMAIL || 'noreply@dispotree.com',
    staleDaysThreshold: 7,
    includeNewDeals: true,
    includePipelineChanges: true,
    includeStaleDeals: true,
    includeWinLoss: true,
    includePortfolio: true,
  };

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      console.log('📧 Digest email service initialized');
    } else {
      console.log('📧 Digest email service not configured (missing SMTP settings)');
    }
  }

  /**
   * Generate digest data for the past 24 hours
   */
  async generateDigestData(userId?: string): Promise<DigestData> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get new deals from the last 24 hours
    const newProperties = await Property.findAll({
      where: {
        createdAt: { [Op.gte]: yesterday },
      },
      order: [['createdAt', 'DESC']],
      limit: 20,
    });

    const newDeals = newProperties.map((p: any) => ({
      address: `${p.address?.street || ''}, ${p.city}, ${p.state}`,
      price: p.askingPrice || 0,
      arv: p.arv,
      equity: p.arv && p.askingPrice ? Math.round((1 - p.askingPrice / p.arv) * 100) : undefined,
      receivedAt: p.createdAt,
    }));

    // Get pipeline changes from the last 24 hours
    const pipelineItems = await DealPipeline.findAll({
      where: {
        updatedAt: { [Op.gte]: yesterday },
      },
    });

    const pipelineChanges: DigestData['pipelineChanges']['changes'] = [];
    for (const item of pipelineItems) {
      const data = (item as any).dataValues || item;
      const history = data.stageHistory || [];

      // Find stage changes in the last 24 hours
      for (let i = 1; i < history.length; i++) {
        const change = history[i];
        if (new Date(change.enteredAt) >= yesterday) {
          pipelineChanges.push({
            dealId: data.dealId,
            address: data.entrySnapshot?.address || 'Unknown',
            fromStage: history[i - 1]?.stage || 'unknown',
            toStage: change.stage,
            changedAt: new Date(change.enteredAt),
          });
        }
      }
    }

    // Get stale deals (no activity in X days)
    const staleThreshold = new Date(now.getTime() - this.defaultConfig.staleDaysThreshold * 24 * 60 * 60 * 1000);
    const stalePipeline = await DealPipeline.findAll({
      where: {
        updatedAt: { [Op.lt]: staleThreshold },
        outcome: { [Op.is]: null as any }, // Not closed
      } as any,
    });

    const staleDeals = stalePipeline.map((item: any) => {
      const data = item.dataValues || item;
      const daysSince = Math.floor((now.getTime() - new Date(data.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
      return {
        dealId: data.dealId,
        address: data.entrySnapshot?.address || 'Unknown',
        stage: data.stage,
        daysSinceActivity: daysSince,
      };
    });

    // Get win/loss stats for the period
    const closedDeals = await DealPipeline.findAll({
      where: {
        closedAt: { [Op.gte]: yesterday },
        outcome: { [Op.not]: null as any },
      } as any,
    });

    let won = 0, lost = 0, withdrawn = 0, totalValue = 0;
    for (const deal of closedDeals) {
      const data = (deal as any).dataValues || deal;
      if (data.outcome === 'won') {
        won++;
        totalValue += data.closePrice || 0;
      } else if (data.outcome === 'lost') {
        lost++;
      } else if (data.outcome === 'withdrawn') {
        withdrawn++;
      }
    }

    const totalClosed = won + lost;
    const winRate = totalClosed > 0 ? Math.round((won / totalClosed) * 100) : 0;

    // Get portfolio summary
    let portfolioSummary = {
      totalProperties: 0,
      totalEquity: 0,
      monthlyIncome: 0,
      newAdditions: 0,
    };

    try {
      const summary = await portfolioService.getPortfolioSummary(userId || 'all') as any;
      portfolioSummary = {
        totalProperties: summary.totalProperties || 0,
        totalEquity: summary.totalEquity || 0,
        monthlyIncome: summary.totalCashFlow || summary.monthlyIncome || 0,
        newAdditions: summary.recentActivity?.added || summary.newAdditions || 0,
      };
    } catch {
      // Portfolio service might not be available
    }

    return {
      generatedAt: now,
      period: { start: yesterday, end: now },
      newDeals: { count: newDeals.length, deals: newDeals },
      pipelineChanges: { count: pipelineChanges.length, changes: pipelineChanges },
      staleDeals: { count: staleDeals.length, deals: staleDeals },
      winLoss: { won, lost, withdrawn, winRate, totalValue },
      portfolioSummary,
    };
  }

  /**
   * Generate HTML email from digest data
   */
  generateEmailHtml(data: DigestData): string {
    const formatCurrency = (n: number) => `$${n.toLocaleString()}`;
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 8px 0 0; opacity: 0.9; }
    .section { padding: 20px; border-bottom: 1px solid #e5e7eb; }
    .section:last-child { border-bottom: none; }
    .section h2 { font-size: 16px; color: #374151; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
    .section h2 .badge { background: #2563eb; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .stat-box { background: #f9fafb; padding: 12px; border-radius: 6px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: #111827; }
    .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .deal-list { list-style: none; padding: 0; margin: 0; }
    .deal-item { padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
    .deal-item:last-child { border-bottom: none; }
    .deal-address { font-weight: 500; color: #111827; }
    .deal-meta { font-size: 13px; color: #6b7280; margin-top: 4px; }
    .stale-warning { color: #dc2626; }
    .win { color: #059669; }
    .loss { color: #dc2626; }
    .footer { background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Dispotree Daily Digest</h1>
      <p>${formatDate(data.period.start)} - ${formatDate(data.period.end)}</p>
    </div>

    <!-- Quick Stats -->
    <div class="section">
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-value">${data.newDeals.count}</div>
          <div class="stat-label">New Deals</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${data.pipelineChanges.count}</div>
          <div class="stat-label">Pipeline Updates</div>
        </div>
        <div class="stat-box">
          <div class="stat-value class="win"">${data.winLoss.won}</div>
          <div class="stat-label">Deals Won</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${data.winLoss.winRate}%</div>
          <div class="stat-label">Win Rate</div>
        </div>
      </div>
    </div>

    ${data.newDeals.count > 0 ? `
    <!-- New Deals -->
    <div class="section">
      <h2>🏠 New Deals <span class="badge">${data.newDeals.count}</span></h2>
      <ul class="deal-list">
        ${data.newDeals.deals.slice(0, 5).map(d => `
        <li class="deal-item">
          <div class="deal-address">${d.address}</div>
          <div class="deal-meta">${formatCurrency(d.price)}${d.equity ? ` • ${d.equity}% equity` : ''}</div>
        </li>
        `).join('')}
      </ul>
      ${data.newDeals.count > 5 ? `<p style="color:#6b7280;font-size:13px;">+ ${data.newDeals.count - 5} more deals</p>` : ''}
    </div>
    ` : ''}

    ${data.staleDeals.count > 0 ? `
    <!-- Stale Deals -->
    <div class="section">
      <h2>⚠️ Stale Deals <span class="badge" style="background:#dc2626">${data.staleDeals.count}</span></h2>
      <ul class="deal-list">
        ${data.staleDeals.deals.slice(0, 5).map(d => `
        <li class="deal-item">
          <div class="deal-address">${d.address}</div>
          <div class="deal-meta stale-warning">${d.daysSinceActivity} days without activity • Stage: ${d.stage}</div>
        </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${data.pipelineChanges.count > 0 ? `
    <!-- Pipeline Changes -->
    <div class="section">
      <h2>🔄 Pipeline Activity</h2>
      <ul class="deal-list">
        ${data.pipelineChanges.changes.slice(0, 5).map(c => `
        <li class="deal-item">
          <div class="deal-address">${c.address}</div>
          <div class="deal-meta">${c.fromStage} → <strong>${c.toStage}</strong></div>
        </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    <!-- Portfolio Summary -->
    <div class="section">
      <h2>💼 Portfolio</h2>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-value">${data.portfolioSummary.totalProperties}</div>
          <div class="stat-label">Properties</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${formatCurrency(data.portfolioSummary.totalEquity)}</div>
          <div class="stat-label">Total Equity</div>
        </div>
      </div>
    </div>

    <div class="footer">
      Dispotree - Real Estate Disposition Platform<br>
      <a href="#">Manage Preferences</a> | <a href="#">View Dashboard</a>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Send daily digest email
   */
  async sendDigest(userId?: string, recipientOverride?: string[]): Promise<{ success: boolean; error?: string }> {
    if (!this.transporter) {
      return { success: false, error: 'Email service not configured' };
    }

    const recipients = recipientOverride ||
      (process.env.DIGEST_RECIPIENTS?.split(',').map(e => e.trim()) || []);

    if (recipients.length === 0) {
      return { success: false, error: 'No recipients configured' };
    }

    try {
      const data = await this.generateDigestData(userId);
      const html = this.generateEmailHtml(data);

      await this.transporter.sendMail({
        from: this.defaultConfig.fromEmail,
        to: recipients.join(', '),
        subject: `📊 Dispotree Daily Digest - ${data.newDeals.count} new deals, ${data.winLoss.won} won`,
        html,
      });

      console.log(`📧 Daily digest sent to ${recipients.length} recipients`);
      return { success: true };
    } catch (error) {
      console.error('📧 Failed to send digest:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get digest preview (for testing without sending)
   */
  async getDigestPreview(userId?: string): Promise<{ data: DigestData; html: string }> {
    const data = await this.generateDigestData(userId);
    const html = this.generateEmailHtml(data);
    return { data, html };
  }

  /**
   * Check if digest service is configured
   */
  isConfigured(): boolean {
    return this.transporter !== null;
  }
}

export const digestService = new DigestService();
