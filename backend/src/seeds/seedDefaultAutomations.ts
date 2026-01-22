/**
 * Seed Default Automations
 *
 * Creates default automation rules for common real estate deal workflows.
 * Run with: npm run seed:automations
 */

import { automationEngine } from '../plugins/automation/AutomationEngine';
import { Automation } from '../plugins/types';
import sequelize from '../config/database';

const DEFAULT_AUTOMATIONS: Automation[] = [
  // ============================================================================
  // 1. NEW PROPERTY EMAIL NOTIFICATION
  // ============================================================================
  {
    id: 'auto-new-property-email',
    name: 'New Property Email Notification',
    description: 'Sends an email notification when a new property is added',
    enabled: true,
    trigger: {
      type: 'deal_received',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-send-email',
        type: 'send_email',
        order: 1,
        config: {
          to: 'emprezarioinc@gmail.com',
          subject: 'New Property Added: {{deal.address.street}}, {{deal.city}}',
          template: 'new_deal',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 2. AUTO-SCORE AGAINST ALL BUY BOXES (after enrichment)
  // ============================================================================
  {
    id: 'auto-score-new-deals',
    name: 'Auto-Score New Deals',
    description: 'Automatically scores every new deal against all buy boxes after enrichment',
    enabled: true,
    trigger: {
      type: 'deal_enriched',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-score',
        type: 'score_against_buybox',
        order: 1,
        config: {},
        continueOnError: true,
      },
      {
        id: 'action-log',
        type: 'log_event',
        order: 2,
        config: {
          level: 'info',
          message: 'Deal {{deal.address.street}} scored. Best match: {{bestMatch.buyBoxName}} at {{bestMatch.percentage}}%',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 3. HOT DEAL ALERT (80%+ MATCH)
  // ============================================================================
  {
    id: 'auto-hot-deal-alert',
    name: 'Hot Deal Alert',
    description: 'Alerts team when a deal scores 80%+ against a buy box',
    enabled: true,
    trigger: {
      type: 'deal_scored',
      config: {},
    },
    conditions: [
      {
        id: 'cond-high-score',
        field: 'bestMatch.percentage',
        operator: 'greater_or_equal',
        value: 80,
      },
    ],
    actions: [
      {
        id: 'action-slack-hot',
        type: 'send_slack',
        order: 1,
        config: {
          channel: '#hot-deals',
          message: '🔥 HOT DEAL ALERT!\n\n*{{deal.address.street}}, {{deal.city}}, {{deal.state}}*\n\n• Match Score: {{bestMatch.percentage}}%\n• Buy Box: {{bestMatch.buyBoxName}}\n• Asking: ${{deal.askingPrice}}\n• ARV: ${{deal.arv}}',
        },
        continueOnError: true,
      },
      {
        id: 'action-email-hot',
        type: 'send_email',
        order: 2,
        config: {
          to: 'emprezarioinc@gmail.com',
          subject: '🔥 HOT DEAL: {{deal.address.street}} - {{bestMatch.percentage}}% Match',
          template: 'score_alert',
        },
        continueOnError: true,
      },
      {
        id: 'action-tag-hot',
        type: 'add_tag',
        order: 3,
        config: {
          tag: 'hot-deal',
        },
        continueOnError: true,
      },
    ],
    cooldown: 60000, // 1 minute cooldown per deal
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 4. AUTO-COMPLIANCE CHECK
  // ============================================================================
  {
    id: 'auto-compliance-check',
    name: 'Auto-Compliance Check',
    description: 'Runs state-specific compliance check on every new deal',
    enabled: true,
    trigger: {
      type: 'deal_received',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-compliance',
        type: 'run_compliance_check',
        order: 1,
        config: {},
        continueOnError: true,
      },
      {
        id: 'action-log-compliance',
        type: 'log_event',
        order: 2,
        config: {
          level: 'info',
          message: 'Compliance check for {{deal.state}}: {{complianceResult.status}} ({{complianceResult.passedRules}}/{{complianceResult.totalRules}} rules passed)',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 5. COMPLIANCE FAILURE ALERT
  // ============================================================================
  {
    id: 'auto-compliance-alert',
    name: 'Compliance Failure Alert',
    description: 'Alerts when a deal has compliance issues',
    enabled: true,
    trigger: {
      type: 'compliance_checked',
      config: {},
    },
    conditions: [
      {
        id: 'cond-compliance-fail',
        field: 'complianceResult.failedRules',
        operator: 'greater_than',
        value: 0,
      },
    ],
    actions: [
      {
        id: 'action-slack-compliance',
        type: 'send_slack',
        order: 1,
        config: {
          channel: '#compliance-alerts',
          message: '⚠️ COMPLIANCE ISSUE\n\n*{{deal.address.street}}, {{deal.state}}*\n\nStatus: {{complianceResult.status}}\nIssues: {{complianceResult.failedRules}} rule(s) failed',
        },
        continueOnError: true,
      },
      {
        id: 'action-tag-compliance',
        type: 'add_tag',
        order: 2,
        config: {
          tag: 'compliance-review',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 6. AUTO-CALCULATE MAO (Max Allowable Offer)
  // ============================================================================
  {
    id: 'auto-calculate-mao',
    name: 'Auto-Calculate MAO',
    description: 'Calculates Max Allowable Offer for deals with ARV',
    enabled: true,
    trigger: {
      type: 'deal_received',
      config: {},
    },
    conditions: [
      {
        id: 'cond-has-arv',
        field: 'deal.arv',
        operator: 'greater_than',
        value: 0,
      },
    ],
    actions: [
      {
        id: 'action-calc-mao',
        type: 'calculate_mao',
        order: 1,
        config: {
          profitMargin: 0.3,
          repairBuffer: 1.1,
        },
        continueOnError: true,
      },
      {
        id: 'action-log-mao',
        type: 'log_event',
        order: 2,
        config: {
          level: 'info',
          message: 'MAO calculated for {{deal.address.street}}: ${{calculatedMao}} (ARV: ${{deal.arv}})',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 7. AUTO-ENRICH WITH MARKET DATA
  // ============================================================================
  {
    id: 'auto-enrich-deals',
    name: 'Auto-Enrich with Market Data',
    description: 'Enriches new deals with Zillow data (Zestimate, rent estimate, comps)',
    enabled: true,
    trigger: {
      type: 'deal_received',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-enrich',
        type: 'enrich_deal',
        order: 1,
        config: {},
        continueOnError: true,
      },
      {
        id: 'action-log-enrich',
        type: 'log_event',
        order: 2,
        config: {
          level: 'info',
          message: 'Deal enriched: {{deal.address.street}} - Zestimate: ${{enrichmentResult.data.zestimate}}',
        },
        continueOnError: true,
      },
      {
        id: 'action-email-enriched',
        type: 'send_email',
        order: 3,
        config: {
          to: 'emprezarioinc@gmail.com',
          subject: '📊 Enriched Deal: {{deal.address.street}}, {{deal.city}} {{deal.state}}',
          html: `
<h2>🏠 Deal Enriched with Market Data</h2>

<h3>Property Details</h3>
<table style="border-collapse: collapse; width: 100%;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Address</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.address.street}}, {{deal.city}}, {{deal.state}} {{deal.zip}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Property Type</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.propertyType}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Beds / Baths</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.bedrooms}} / {{deal.bathrooms}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Sq Ft</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.sqft}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Year Built</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.yearBuilt}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Lot Size</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.lotSize}} sq ft</td></tr>
</table>

<h3>💰 Pricing & Values</h3>
<table style="border-collapse: collapse; width: 100%;">
  <tr style="background-color: #f8f9fa;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Asking Price</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{deal.askingPrice}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>ARV (After Repair Value)</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{deal.arv}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Repair Estimate</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{deal.repairEstimate}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Assignment Fee</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{deal.assignmentFee}}</td></tr>
</table>

<h3>📈 Zillow Enrichment Data</h3>
<table style="border-collapse: collapse; width: 100%;">
  <tr style="background-color: #e8f5e9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Zestimate</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{enrichmentResult.data.zestimate}}</td></tr>
  <tr style="background-color: #e8f5e9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>Rent Zestimate</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{enrichmentResult.data.rentZestimate}}/mo</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Price per Sq Ft</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{enrichmentResult.data.pricePerSqft}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Tax Assessment</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{enrichmentResult.data.taxAssessment}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Annual Taxes</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{enrichmentResult.data.annualTaxes}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>HOA Fee</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{enrichmentResult.data.hoaFee}}/mo</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Days on Market</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{enrichmentResult.data.daysOnMarket}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Zillow Link</strong></td><td style="padding: 8px; border: 1px solid #ddd;"><a href="{{enrichmentResult.data.zillowUrl}}">View on Zillow</a></td></tr>
</table>

<h3>📊 Market Analysis</h3>
<table style="border-collapse: collapse; width: 100%;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Equity (Zestimate - Asking)</strong></td><td style="padding: 8px; border: 1px solid #ddd;">\${{enrichmentResult.data.equityVsZestimate}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Discount %</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{enrichmentResult.data.discountPercent}}%</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Cap Rate (Est.)</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{enrichmentResult.data.capRate}}%</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Gross Rent Multiplier</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{enrichmentResult.data.grm}}</td></tr>
</table>

<h3>👤 Wholesaler Info</h3>
<table style="border-collapse: collapse; width: 100%;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.wholesalerName}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Company</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.wholesalerCompany}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.wholesalerEmail}}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{{deal.wholesalerPhone}}</td></tr>
</table>

<p style="margin-top: 20px; color: #666; font-size: 12px;">
  Source: {{deal.sourceName}} | Enriched at: {{enrichmentResult.timestamp}}
</p>
          `,
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 8. SLACK NEW DEALS CHANNEL
  // ============================================================================
  {
    id: 'auto-slack-new-deals',
    name: 'Slack New Deals Notification',
    description: 'Posts all new deals to Slack for team visibility',
    enabled: true,
    trigger: {
      type: 'deal_received',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-slack-new',
        type: 'send_slack',
        order: 1,
        config: {
          channel: '#new-deals',
          message: '📥 New Deal Received\n\n*{{deal.address.street}}, {{deal.city}}, {{deal.state}} {{deal.zip}}*\n\n• Asking: ${{deal.askingPrice}}\n• ARV: ${{deal.arv}}\n• Beds/Baths: {{deal.bedrooms}}/{{deal.bathrooms}}\n• Sq Ft: {{deal.sqft}}\n• Source: {{deal.sourceName}}',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 9. DISCORD NEW DEALS NOTIFICATION
  // ============================================================================
  {
    id: 'auto-discord-new-deals',
    name: 'Discord New Deals Notification',
    description: 'Posts all new deals to Discord for team visibility',
    enabled: true,
    trigger: {
      type: 'deal_received',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-discord-new',
        type: 'send_discord',
        order: 1,
        config: {
          message: '📥 New Deal: {{deal.address.street}}, {{deal.city}}, {{deal.state}}',
          username: 'Dispotree Bot',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 10. STALE DEAL FOLLOW-UP
  // ============================================================================
  {
    id: 'auto-stale-deal-followup',
    name: 'Stale Deal Follow-up',
    description: 'Creates follow-up task for deals with no activity in 7+ days',
    enabled: true,
    trigger: {
      type: 'deal_stale',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-followup-stale',
        type: 'create_followup',
        order: 1,
        config: {
          daysFromNow: 1,
          title: 'Follow up on stale deal: {{deal.address.street}}',
          description: 'This deal has had no activity. Check status and take action.',
          priority: 'medium',
        },
        continueOnError: true,
      },
      {
        id: 'action-tag-stale',
        type: 'add_tag',
        order: 2,
        config: {
          tag: 'needs-followup',
        },
        continueOnError: true,
      },
      {
        id: 'action-email-stale',
        type: 'send_email',
        order: 3,
        config: {
          to: 'emprezarioinc@gmail.com',
          subject: 'Follow-up Needed: {{deal.address.street}} - No Activity',
          html: '<h2>Stale Deal Alert</h2><p>The deal at <strong>{{deal.address.street}}, {{deal.city}}</strong> has had no activity recently.</p><p>Please review and take action.</p>',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 11. PRICE DROP ALERT
  // ============================================================================
  {
    id: 'auto-price-drop-alert',
    name: 'Price Drop Alert',
    description: 'Alerts when a property asking price drops and re-scores',
    enabled: true,
    trigger: {
      type: 'price_dropped',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-rescore',
        type: 'score_against_buybox',
        order: 1,
        config: {},
        continueOnError: true,
      },
      {
        id: 'action-recalc-mao',
        type: 'calculate_mao',
        order: 2,
        config: {
          profitMargin: 0.3,
        },
        continueOnError: true,
      },
      {
        id: 'action-slack-price',
        type: 'send_slack',
        order: 3,
        config: {
          channel: '#price-drops',
          message: '💰 PRICE DROP!\n\n*{{deal.address.street}}, {{deal.city}}*\n\n• New Price: ${{deal.askingPrice}}\n• New MAO: ${{calculatedMao}}\n• New Score: {{bestMatch.percentage}}%',
        },
        continueOnError: true,
      },
      {
        id: 'action-email-price',
        type: 'send_email',
        order: 4,
        config: {
          to: 'emprezarioinc@gmail.com',
          subject: '💰 Price Drop: {{deal.address.street}}',
          html: '<h2>Price Dropped!</h2><p><strong>{{deal.address.street}}, {{deal.city}}</strong></p><p>New asking price: ${{deal.askingPrice}}</p><p>Updated MAO: ${{calculatedMao}}</p>',
        },
        continueOnError: true,
      },
      {
        id: 'action-tag-price',
        type: 'add_tag',
        order: 5,
        config: {
          tag: 'price-reduced',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 12. AUTO-GENERATE OFFER LETTER (85%+ Match)
  // ============================================================================
  {
    id: 'auto-generate-offer',
    name: 'Auto-Generate Offer Letter',
    description: 'Generates offer letter for deals scoring 85%+ against buy box',
    enabled: true,
    trigger: {
      type: 'deal_scored',
      config: {},
    },
    conditions: [
      {
        id: 'cond-high-match',
        field: 'bestMatch.percentage',
        operator: 'greater_or_equal',
        value: 85,
      },
    ],
    actions: [
      {
        id: 'action-calc-mao-offer',
        type: 'calculate_mao',
        order: 1,
        config: {
          profitMargin: 0.3,
        },
        continueOnError: false,
      },
      {
        id: 'action-generate-offer',
        type: 'generate_offer_letter',
        order: 2,
        config: {
          template: 'standard',
          buyerCompany: 'Dispotree Investments LLC',
        },
        continueOnError: false,
      },
      {
        id: 'action-slack-offer',
        type: 'send_slack',
        order: 3,
        config: {
          channel: '#offers',
          message: '📄 Offer Letter Generated\n\n*{{deal.address.street}}*\n\n• Offer Amount: ${{offerLetter.offerAmount}}\n• Expires: {{offerLetter.expiresAt}}\n• PDF: {{offerLetter.pdfUrl}}',
        },
        continueOnError: true,
      },
      {
        id: 'action-tag-offer',
        type: 'add_tag',
        order: 4,
        config: {
          tag: 'offer-generated',
        },
        continueOnError: true,
      },
    ],
    cooldown: 300000, // 5 minute cooldown
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 13. PIPELINE STAGE CHANGE NOTIFICATION
  // ============================================================================
  {
    id: 'auto-pipeline-notification',
    name: 'Pipeline Stage Change Notification',
    description: 'Notifies team when a deal moves to a new pipeline stage',
    enabled: true,
    trigger: {
      type: 'pipeline_stage_changed',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-slack-pipeline',
        type: 'send_slack',
        order: 1,
        config: {
          channel: '#deal-pipeline',
          message: '📊 Pipeline Update\n\n*{{deal.address.street}}*\n\nMoved to: *{{currentStage}}*',
        },
        continueOnError: true,
      },
      {
        id: 'action-log-pipeline',
        type: 'log_event',
        order: 2,
        config: {
          level: 'info',
          message: 'Deal {{deal.externalId}} moved to stage: {{currentStage}}',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 14. RUN COMPS ANALYSIS ON NEW DEALS
  // ============================================================================
  {
    id: 'auto-comps-analysis',
    name: 'Auto-Run Comps Analysis',
    description: 'Automatically runs comparable property analysis on new deals',
    enabled: true,
    trigger: {
      type: 'deal_received',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-comps',
        type: 'run_comps_analysis',
        order: 1,
        config: {
          radius: 0.5,
          maxAge: 180,
          limit: 10,
        },
        continueOnError: true,
      },
      {
        id: 'action-log-comps',
        type: 'log_event',
        order: 2,
        config: {
          level: 'info',
          message: 'Comps analysis complete: {{compsAnalysis.comparables.length}} comps found, avg price: ${{compsAnalysis.averageSoldPrice}}',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 15. OFFER ACCEPTED CELEBRATION
  // ============================================================================
  {
    id: 'auto-offer-accepted',
    name: 'Offer Accepted Notification',
    description: 'Celebrates and notifies team when an offer is accepted',
    enabled: true,
    trigger: {
      type: 'offer_accepted',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-slack-accepted',
        type: 'send_slack',
        order: 1,
        config: {
          channel: '#wins',
          message: '🎉 OFFER ACCEPTED!\n\n*{{deal.address.street}}, {{deal.city}}*\n\n• Purchase Price: ${{deal.askingPrice}}\n• ARV: ${{deal.arv}}\n\nTime to close this deal!',
        },
        continueOnError: true,
      },
      {
        id: 'action-discord-accepted',
        type: 'send_discord',
        order: 2,
        config: {
          message: '🎉 OFFER ACCEPTED: {{deal.address.street}} for ${{deal.askingPrice}}!',
          username: 'Deal Wins Bot',
        },
        continueOnError: true,
      },
      {
        id: 'action-email-accepted',
        type: 'send_email',
        order: 3,
        config: {
          to: 'emprezarioinc@gmail.com',
          subject: '🎉 Offer Accepted: {{deal.address.street}}',
          html: '<h1>🎉 Congratulations!</h1><h2>Your offer was accepted!</h2><p><strong>{{deal.address.street}}, {{deal.city}}, {{deal.state}}</strong></p><p>Purchase Price: ${{deal.askingPrice}}</p>',
        },
        continueOnError: true,
      },
      {
        id: 'action-tag-accepted',
        type: 'add_tag',
        order: 4,
        config: {
          tag: 'under-contract',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 16. OFFER REJECTED - FOLLOW UP
  // ============================================================================
  {
    id: 'auto-offer-rejected',
    name: 'Offer Rejected Follow-up',
    description: 'Creates follow-up when an offer is rejected',
    enabled: true,
    trigger: {
      type: 'offer_rejected',
      config: {},
    },
    conditions: [],
    actions: [
      {
        id: 'action-followup-rejected',
        type: 'create_followup',
        order: 1,
        config: {
          daysFromNow: 3,
          title: 'Re-engage on rejected offer: {{deal.address.street}}',
          description: 'Consider counter-offer or wait for price drop',
          priority: 'medium',
        },
        continueOnError: true,
      },
      {
        id: 'action-slack-rejected',
        type: 'send_slack',
        order: 2,
        config: {
          channel: '#deals',
          message: '❌ Offer Rejected: {{deal.address.street}}\n\nFollow-up scheduled in 3 days.',
        },
        continueOnError: true,
      },
      {
        id: 'action-tag-rejected',
        type: 'add_tag',
        order: 3,
        config: {
          tag: 'offer-rejected',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 17. PIPELINE STAGE: DEAL APPROVED
  // ============================================================================
  {
    id: 'auto-pipeline-approved',
    name: 'Pipeline Deal Approved',
    description: 'Log when a deal becomes active in the pipeline',
    enabled: true,
    trigger: {
      type: 'pipeline_stage_changed',
      config: {},
    },
    conditions: [
      {
        id: 'cond-active',
        field: 'toState',
        operator: 'equals',
        value: 'active',
      },
    ],
    actions: [
      {
        id: 'action-log-approved',
        type: 'log_event',
        order: 1,
        config: {
          level: 'info',
          message: '✅ Deal {{propertyId}} is now ACTIVE (from {{fromState}})',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 18. PIPELINE STAGE: DEAL REJECTED
  // ============================================================================
  {
    id: 'auto-pipeline-rejected',
    name: 'Pipeline Deal Rejected',
    description: 'Log when a deal is rejected in the pipeline',
    enabled: true,
    trigger: {
      type: 'pipeline_stage_changed',
      config: {},
    },
    conditions: [
      {
        id: 'cond-rejected',
        field: 'toState',
        operator: 'equals',
        value: 'rejected',
      },
    ],
    actions: [
      {
        id: 'action-log-rejected',
        type: 'log_event',
        order: 1,
        config: {
          level: 'warn',
          message: '❌ Deal {{propertyId}} rejected (from {{fromState}})',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },

  // ============================================================================
  // 19. PIPELINE STAGE: DEAL BLOCKED
  // ============================================================================
  {
    id: 'auto-pipeline-blocked',
    name: 'Pipeline Deal Blocked',
    description: 'Log when a deal is blocked in the pipeline',
    enabled: true,
    trigger: {
      type: 'pipeline_stage_changed',
      config: {},
    },
    conditions: [
      {
        id: 'cond-blocked',
        field: 'toState',
        operator: 'equals',
        value: 'blocked',
      },
    ],
    actions: [
      {
        id: 'action-log-blocked',
        type: 'log_event',
        order: 1,
        config: {
          level: 'warn',
          message: '⛔ Deal {{propertyId}} blocked (from {{fromState}})',
        },
        continueOnError: true,
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
  },
];

async function seedAutomations(): Promise<void> {
  console.log('🌱 Seeding default automations...');
  console.log(`📋 ${DEFAULT_AUTOMATIONS.length} automations to process\n`);

  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // Load existing automations
    await automationEngine.loadFromDatabase();
    const existing = automationEngine.getAllAutomations();
    console.log(`📋 Found ${existing.length} existing automations in database\n`);

    let created = 0;
    let skipped = 0;
    let updated = 0;

    for (const automation of DEFAULT_AUTOMATIONS) {
      // Check if automation already exists
      const exists = existing.some(a => a.id === automation.id);

      if (exists) {
        console.log(`⏭️  Skipping "${automation.name}" (already exists)`);
        skipped++;
        continue;
      }

      // Save new automation
      await automationEngine.saveAutomation(automation);
      console.log(`✅ Created "${automation.name}"`);
      created++;
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Summary:`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`${'='.repeat(50)}`);
    console.log('\n✅ Seeding complete!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedAutomations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { seedAutomations, DEFAULT_AUTOMATIONS };
