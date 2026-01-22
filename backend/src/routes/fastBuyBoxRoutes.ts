/**
 * Fast Buy Box Routes
 *
 * Public endpoint for quick buy box creation without authentication.
 * Designed for easy onboarding of new investors.
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Op } from 'sequelize';
import HedgeFundBuyBox from '../models/HedgeFundBuyBox';
import Fund from '../models/Fund';
import Contact from '../models/Contact';
import MagicLinkToken from '../models/MagicLinkToken';
import { dealProcessingService } from '../plugins';
import { parseCustomCriteria, toScoringEngineCriteria } from '../utils/customCriteriaParser';
import {
  fastBuyBoxSchema,
  detailedBuyBoxSchema,
  validateBody,
  type FastBuyBoxInput
} from '../validation/buyBoxSchemas';
import { MarketContact } from '../types';
import { Resend } from 'resend';

// State abbreviation to full name mapping for tags
const STATE_NAMES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia',
  HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland',
  MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri',
  MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new-hampshire', NJ: 'new-jersey',
  NM: 'new-mexico', NY: 'new-york', NC: 'north-carolina', ND: 'north-dakota', OH: 'ohio',
  OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode-island', SC: 'south-carolina',
  SD: 'south-dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont',
  VA: 'virginia', WA: 'washington', WV: 'west-virginia', WI: 'wisconsin', WY: 'wyoming',
  DC: 'washington-dc',
};

function getStateTag(stateAbbr: string): string {
  return STATE_NAMES[stateAbbr.toUpperCase()] || stateAbbr.toLowerCase();
}

/**
 * Find or create/update a buyer contact
 * - If contact exists by email, update it with new info
 * - If not, create new contact
 * - Uses fundId in metadata to track ownership since public submissions have no userId
 */
async function upsertBuyerContact(data: {
  email: string;
  name: string;
  phone?: string | null;
  company: string;
  state?: string | null;
  zip?: string | null;
  tags: string[];
  fundId: string;
  buyBoxId: string;
  source: string;
  additionalMetadata?: Record<string, any>;
}): Promise<void> {
  const emailLower = data.email.toLowerCase();
  const phoneNormalized = data.phone?.replace(/\D/g, '') || null; // Strip non-digits

  try {
    // Check if contact already exists by email OR phone
    let existingContact = await Contact.findOne({
      where: { email: emailLower, type: 'buyer' },
    });

    // If not found by email, try phone (if provided)
    if (!existingContact && phoneNormalized && phoneNormalized.length >= 10) {
      existingContact = await Contact.findOne({
        where: {
          type: 'buyer',
          phone: { [Op.or]: [phoneNormalized, data.phone] }, // Match normalized or original
        },
      });
    }

    const metadata = {
      fundId: data.fundId,
      buyBoxId: data.buyBoxId,
      source: data.source,
      ...data.additionalMetadata,
    };

    if (existingContact) {
      // Update existing contact - merge tags, update metadata
      const existingTags = existingContact.tags || [];
      const mergedTags = [...new Set([...existingTags, ...data.tags])];

      // Update with latest info
      await existingContact.update({
        name: data.name || existingContact.name,
        phone: data.phone || existingContact.phone,
        company: data.company || existingContact.company,
        state: data.state || existingContact.state,
        zip: data.zip || existingContact.zip,
        tags: mergedTags,
        metadata: { ...existingContact.metadata, ...metadata },
      });
      console.log(`📇 Updated buyer contact: ${emailLower}`);
    } else {
      // Create new contact - use fundId as pseudo-userId for public submissions
      await Contact.create({
        userId: data.fundId, // Use fundId as owner reference
        type: 'buyer',
        name: data.name,
        email: emailLower,
        phone: data.phone || null,
        company: data.company,
        state: data.state || null,
        zip: data.zip || null,
        status: 'active',
        tags: data.tags,
        metadata,
      });
      console.log(`📇 Created buyer contact: ${emailLower}`);
    }
  } catch (error) {
    console.error(`Failed to upsert contact ${emailLower}:`, error);
  }
}

const router = Router();

// Initialize email service
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Admin email for notifications
const ADMIN_EMAIL = 'emprezarioinc@gmail.com';

/**
 * Send Discord webhook notification for new buy box
 */
async function sendDiscordNotification(buyBox: any, fund: any, isNewFund: boolean): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('Discord webhook not configured, skipping notification');
    return;
  }

  try {
    const embed = {
      title: '🎯 New Buy Box Created!',
      color: 0x22c55e, // Green
      fields: [
        { name: 'Buy Box Name', value: buyBox.name, inline: true },
        { name: 'Fund', value: fund.name + (isNewFund ? ' (New)' : ''), inline: true },
        { name: 'Contact', value: buyBox.contactEmail, inline: true },
        { name: 'States', value: buyBox.criteria?.states?.join(', ') || 'N/A', inline: true },
        { name: 'Price Range', value: `$${buyBox.criteria?.minPrice?.toLocaleString()} - $${buyBox.criteria?.maxPrice?.toLocaleString()}`, inline: true },
        { name: 'Property Types', value: buyBox.criteria?.propertyTypes?.join(', ') || 'N/A', inline: true },
      ],
      footer: { text: 'Dispotree Fast Buy Box' },
      timestamp: new Date().toISOString(),
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Dispotree',
        embeds: [embed],
      }),
    });

    console.log('📨 Discord notification sent for new buy box');
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
  }
}

/**
 * Send email notifications for new buy box
 */
async function sendEmailNotifications(buyBox: any, fund: any, isNewFund: boolean, magicLinkToken?: string): Promise<void> {
  if (!resend) {
    console.log('Email service not configured, skipping notifications');
    return;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Dispotree <noreply@dispotree.com>';
  const frontendUrl = process.env.FRONTEND_URL || 'https://dispotree.com';

  // Build magic link URL - this will auto-create account and log them in
  const magicLinkUrl = magicLinkToken
    ? `${frontendUrl}/auth/magic?token=${magicLinkToken}`
    : `${frontendUrl}/login`;

  // Email template for user
  const userHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 10px; letter-spacing: 1px;">
          🌳 DISPOTREE
        </div>
        <h1 style="color: white; margin: 0; font-size: 24px;">🎯 Buy Box Created!</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <p style="font-size: 16px; color: #374151;">Hi there,</p>
        <p style="font-size: 16px; color: #374151;">Your buy box <strong>"${buyBox.name}"</strong> has been successfully created and is now active!</p>

        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <h3 style="margin-top: 0; color: #111827;">Buy Box Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6b7280;">States:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.states?.join(', ') || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Price Range:</td><td style="padding: 8px 0; color: #111827;">$${buyBox.criteria?.minPrice?.toLocaleString()} - $${buyBox.criteria?.maxPrice?.toLocaleString()}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Property Types:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.propertyTypes?.join(', ') || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Strategies:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.investmentStrategies?.join(', ') || 'N/A'}</td></tr>
          </table>
        </div>

        <p style="font-size: 16px; color: #374151;">We'll start matching deals to your criteria right away. Click the button below to access your dashboard and view matched deals.</p>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${magicLinkUrl}" style="background: #22c55e; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Access Your Deals</a>
        </div>

        <p style="font-size: 13px; color: #6b7280; margin-top: 25px; text-align: center;">
          ${magicLinkToken ? 'This link expires in 72 hours. After that, you can request a new link from the login page.' : ''}
        </p>
      </div>
      <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
        <p>Dispotree - Real Estate Deal Management</p>
      </div>
    </div>
  `;

  // Email template for admin
  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 10px; letter-spacing: 1px;">
          🌳 DISPOTREE
        </div>
        <h1 style="color: white; margin: 0; font-size: 24px;">📋 New Buy Box Submission</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <p style="font-size: 16px; color: #374151;">A new buy box has been submitted via Fast Buy Box:</p>

        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <h3 style="margin-top: 0; color: #111827;">Contact Info</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6b7280;">Name:</td><td style="padding: 8px 0; color: #111827;">${buyBox.name}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Fund:</td><td style="padding: 8px 0; color: #111827;">${fund.name} ${isNewFund ? '(NEW FUND)' : '(Existing)'}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Email:</td><td style="padding: 8px 0; color: #111827;"><a href="mailto:${buyBox.contactEmail}">${buyBox.contactEmail}</a></td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Phone:</td><td style="padding: 8px 0; color: #111827;">${buyBox.contactPhone || 'N/A'}</td></tr>
          </table>
        </div>

        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <h3 style="margin-top: 0; color: #111827;">Buy Box Criteria</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6b7280;">States:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.states?.join(', ') || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Price Range:</td><td style="padding: 8px 0; color: #111827;">$${buyBox.criteria?.minPrice?.toLocaleString()} - $${buyBox.criteria?.maxPrice?.toLocaleString()}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Property Types:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.propertyTypes?.join(', ') || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Strategies:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.investmentStrategies?.join(', ') || 'N/A'}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Bedrooms:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.minBedrooms} - ${buyBox.criteria?.maxBedrooms}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Match Strictness:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.matchStrictness || 'flexible'}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Delivery:</td><td style="padding: 8px 0; color: #111827;">${buyBox.criteria?.deliveryFrequency || 'realtime'}</td></tr>
          </table>
        </div>

        <p style="font-size: 14px; color: #6b7280;">Buy Box ID: ${buyBox.id}</p>
        <p style="font-size: 14px; color: #6b7280;">Fund ID: ${fund.id}</p>
      </div>
    </div>
  `;

  try {
    // Send to user
    const userResult = await resend.emails.send({
      from: fromEmail,
      to: [buyBox.contactEmail],
      subject: `🎯 Your Buy Box "${buyBox.name}" is Now Active!`,
      html: userHtml,
    });
    console.log(`📧 Confirmation email sent to ${buyBox.contactEmail}:`, userResult.data?.id);

    // Send to admin
    const adminResult = await resend.emails.send({
      from: fromEmail,
      to: [ADMIN_EMAIL],
      subject: `📋 New Buy Box: ${buyBox.name} - ${fund.name}`,
      html: adminHtml,
    });
    console.log(`📧 Admin notification sent to ${ADMIN_EMAIL}:`, adminResult.data?.id);
  } catch (error) {
    console.error('Failed to send email notifications:', error);
  }
}

// Rate limit - more restrictive for public endpoint
const fastBuyBoxLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 submissions per hour per IP
  message: { success: false, error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(fastBuyBoxLimiter);

/**
 * POST /api/fastbuybox
 * Create a buy box quickly without authentication
 *
 * Uses Zod schema validation via middleware for type-safe input validation
 */
router.post('/', validateBody(fastBuyBoxSchema), async (req: Request, res: Response) => {
  try {
    // Input is already validated and transformed by the middleware
    const validatedInput = req.body as FastBuyBoxInput;

    const {
      // Basic info
      name,
      fundName,
      contactEmail,
      contactPhone,
      description,

      // Geographic criteria
      states,
      zipcodes,
      markets,
      excludedStates,
      excludedMarkets,

      // Additional contacts
      contacts,

      // Property criteria
      propertyTypes,
      minPrice,
      maxPrice,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minYearBuilt,
      maxYearBuilt,
      minSqft,
      maxSqft,

      // Investment strategy
      investmentStrategies,
      conditionLevels,
      occupancyStatuses,

      // Risk tolerance - Property Features
      allowHoa,
      allowPool,
      allowSolarPanels,
      allowSeptic,
      allowWell,
      allowMainRoad,
      maxHoaMonthly,

      // Risk tolerance - Property Issues
      allowFloodZone,
      allowFoundationIssues,
      allowStructuralIssues,
      allowFireDamage,
      allowCodeViolations,
      allowOpenPermits,
      allowLiensIfCurable,

      // Risk tolerance - Community & Location
      allowLeasingRestrictions,
      allowAgeRestrictions,
      crimeTolerance,

      // Custom criteria
      customCriteria,

      // Hard requirements - configurable deal breakers
      hardRequirements,

      // Scoring
      autoSubmit,
      autoSubmitThreshold,

      // === ADVANCED OPTIONS ===
      minLotSizeSqft,
      maxLotSizeSqft,
      minRehabBudget,
      maxRehabBudget,
      dealSourcePreference,

      // Strategy-specific: Fix & Flip
      flipMinBelowArvPercent,
      flipMinExpectedProfit,
      flipMaxClosingDays,

      // Strategy-specific: Long-Term Rental
      rentalMinHoldYears,
      rentalMinMonthlyRent,
      rentalMaxMonthlyRent,
      rentalMinRentToPrice,
      rentalMinCapRate,
      rentalMinCashOnCash,
      rentalAllowBelowMarket,
      rentalLeaseTypes,

      // Zestimate
      maxPercentBelowZestimate,

      // Notification settings
      matchStrictness,
      deliveryFrequency,
    } = validatedInput;

    // Note: Input validation is handled by the Zod middleware
    // The code below now receives validated and transformed data

    // Validate zipcodes if provided (now supports objects with optional contacts)
    const validZipcodes: Array<{ zipcode: string; contact?: { name: string; email: string; phone?: string } }> = [];
    if (zipcodes && Array.isArray(zipcodes)) {
      for (const entry of zipcodes) {
        // Support both string format and object format
        if (typeof entry === 'string') {
          const cleanZip = entry.trim();
          if (/^\d{5}$/.test(cleanZip)) {
            validZipcodes.push({ zipcode: cleanZip });
          }
        } else if (entry && typeof entry === 'object' && entry.zipcode) {
          const cleanZip = String(entry.zipcode).trim();
          if (/^\d{5}$/.test(cleanZip)) {
            const zipcodeEntry: { zipcode: string; contact?: { name: string; email: string; phone?: string } } = {
              zipcode: cleanZip,
            };
            // Add contact if provided and valid
            if (entry.contact && entry.contact.name && entry.contact.email) {
              zipcodeEntry.contact = {
                name: String(entry.contact.name).trim(),
                email: String(entry.contact.email).trim().toLowerCase(),
                phone: entry.contact.phone ? String(entry.contact.phone).trim() : undefined,
              };
            }
            validZipcodes.push(zipcodeEntry);
          }
        }
      }
    }

    // Validate custom criteria if provided
    const validCustomCriteria: Array<{ name: string; enabled: boolean }> = [];
    if (customCriteria && Array.isArray(customCriteria)) {
      for (const criteria of customCriteria) {
        if (criteria && criteria.name && typeof criteria.name === 'string') {
          validCustomCriteria.push({
            name: String(criteria.name).trim(),
            enabled: criteria.enabled !== false,
          });
        }
      }
    }

    // Validate contacts if provided
    const validContacts: MarketContact[] = [];
    if (contacts && Array.isArray(contacts)) {
      for (const contact of contacts) {
        if (contact.name && contact.email && contact.email.includes('@')) {
          validContacts.push({
            name: String(contact.name).trim(),
            email: String(contact.email).trim().toLowerCase(),
            phone: contact.phone ? String(contact.phone).trim() : undefined,
            markets: Array.isArray(contact.markets) ? contact.markets.map((m: string) => String(m).toUpperCase()) : [],
          });
        }
      }
    }

    // Build criteria object
    const criteria: Record<string, any> = {
      // Geographic
      states: states.map((s: string) => s.toUpperCase()),
      zipcodes: validZipcodes,
      markets: markets || [],
      excludedStates: excludedStates || [],
      excludedMarkets: excludedMarkets || [],

      // Property type
      propertyTypes: propertyTypes || ['single_family'],

      // Price range
      minPrice: minPrice || 0,
      maxPrice: maxPrice || 10000000,

      // Bedrooms/Bathrooms
      minBedrooms: minBedrooms || 1,
      maxBedrooms: maxBedrooms || 10,
      minBathrooms: minBathrooms || 1,
      maxBathrooms: maxBathrooms || 10,

      // Year built
      minYearBuilt: minYearBuilt || 1900,
      maxYearBuilt: maxYearBuilt || new Date().getFullYear(),

      // Square footage
      minSqft: minSqft || 500,
      maxSqft: maxSqft || 10000,

      // Lot size
      minLotSizeSqft: minLotSizeSqft || 0,
      maxLotSizeSqft: maxLotSizeSqft || 0,

      // Investment
      investmentStrategies: investmentStrategies || ['fix_and_flip', 'long_term_rental'],
      conditionLevels: conditionLevels || ['any'],
      occupancyStatuses: occupancyStatuses || ['vacant_only', 'vacant_preferred', 'tenant_in_place'],
      dealSourcePreference: dealSourcePreference || 'both',

      // Rehab preferences
      minRehabBudget: minRehabBudget || 0,
      maxRehabBudget: maxRehabBudget || 0,

      // Fix & Flip strategy
      flipMinBelowArvPercent: flipMinBelowArvPercent || 0,
      flipMinExpectedProfit: flipMinExpectedProfit || 0,
      flipMaxClosingDays: flipMaxClosingDays || 0,

      // Long-Term Rental strategy
      rentalMinHoldYears: rentalMinHoldYears || 0,
      rentalMinMonthlyRent: rentalMinMonthlyRent || 0,
      rentalMaxMonthlyRent: rentalMaxMonthlyRent || 0,
      rentalMinRentToPrice: rentalMinRentToPrice || 0,
      rentalMinCapRate: rentalMinCapRate || 0,
      rentalMinCashOnCash: rentalMinCashOnCash || 0,
      rentalAllowBelowMarket: rentalAllowBelowMarket || false,
      rentalLeaseTypes: rentalLeaseTypes || [],

      // Zestimate
      maxPercentBelowZestimate: maxPercentBelowZestimate || 0,

      // Property Features
      allowHoa: allowHoa !== false,
      allowPool: allowPool !== false,
      allowSolarPanels: allowSolarPanels !== false,
      allowSeptic: allowSeptic !== false,
      allowWell: allowWell !== false,
      allowMainRoad: allowMainRoad !== false,
      maxHoaMonthly: maxHoaMonthly || 500,

      // Property Issues (Higher Risk)
      allowFloodZone: allowFloodZone === true,
      allowFoundationIssues: allowFoundationIssues === true,
      allowStructuralIssues: allowStructuralIssues === true,
      allowFireDamage: allowFireDamage === true,
      allowCodeViolations: allowCodeViolations === true,
      allowOpenPermits: allowOpenPermits === true,
      allowLiensIfCurable: allowLiensIfCurable !== false,

      // Community & Location
      allowLeasingRestrictions: allowLeasingRestrictions === true,
      allowAgeRestrictions: allowAgeRestrictions === true,
      crimeTolerance: crimeTolerance || 'medium',

      // Notification settings
      matchStrictness: matchStrictness || 'flexible',
      deliveryFrequency: deliveryFrequency || 'realtime',

      // Additional contacts for this buy box
      additionalContacts: validContacts,

      // Custom criteria - both raw and parsed for scoring
      customCriteria: validCustomCriteria,
      customCriteriaParsed: toScoringEngineCriteria(parseCustomCriteria(validCustomCriteria, 10)),

      // Hard requirements - configurable deal breakers
      // Default: state is hard, everything else is soft
      hardRequirements: hardRequirements || {
        state: true,        // Wrong state = excluded
        maxPrice: false,    // Over budget = reduced score (15% tolerance)
        propertyType: false,
        minBedrooms: false,
        maxBedrooms: false,
        minBathrooms: false,
        maxBathrooms: false,
        minYearBuilt: false,
        allowHoa: false,
        allowFloodZone: false,
        allowStructuralIssues: false,
      },
    };

    // Default scoring weights - custom criteria gets 10 points if any are defined
    const hasCustomCriteria = validCustomCriteria.some(c => c.enabled);
    const scoringWeights = {
      geographic: 25,
      price: 20,
      propertyType: 15,
      bedrooms: 10,
      bathrooms: 5,
      yearBuilt: 5,
      occupancy: 5,
      hoa: 5,
      photos: hasCustomCriteria ? 0 : 5, // Reduce photos weight if custom criteria used
      condition: 5,
      riskFactors: 0,
      strategyMetrics: 0,
      custom: hasCustomCriteria ? 10 : 0, // 10 points for custom criteria if defined
    };

    // Find or create the Fund entity by email/phone
    // This associates all buy boxes from the same contact together
    const { fund, created: fundCreated } = await Fund.findOrCreateByEmail({
      name: fundName?.trim() || name.trim(),
      companyName: fundName?.trim(),
      contactEmail: contactEmail.trim().toLowerCase(),
      contactPhone: contactPhone?.trim(),
    });

    if (fundCreated) {
      console.log(`Created new fund: ${fund.name} (${fund.id})`);
    } else {
      console.log(`Linked to existing fund: ${fund.name} (${fund.id})`);
    }

    // Create the buy box and link it to the Fund
    const buyBox = await HedgeFundBuyBox.create({
      name: name.trim(),
      fundId: fund.id,
      fundName: fundName?.trim() || name.trim(),
      contactEmail: contactEmail.trim().toLowerCase(),
      contactPhone: contactPhone?.trim(),
      description: description?.trim() || `Buy box for ${name} - Created via Fast Buy Box`,
      enabled: true,
      priority: 1,
      criteria,
      scoringWeights,
      autoSubmit: autoSubmit === true,
      autoSubmitThreshold: autoSubmitThreshold || 75,
    });

    // Create/update contact records for all buyers associated with this buybox
    const fundCompanyName = fundName?.trim() || name.trim();
    const stateTags = states.map((s: string) => getStateTag(s));

    // 1. Primary fund contact (always upsert - updates if exists)
    await upsertBuyerContact({
      email: contactEmail,
      name: fundCompanyName,
      phone: contactPhone?.trim(),
      company: fundCompanyName,
      state: states?.[0]?.toUpperCase(),
      tags: ['buyer', 'buybox-submission', 'primary-contact', ...stateTags],
      fundId: fund.id,
      buyBoxId: buyBox.id,
      source: 'fast-buybox',
      additionalMetadata: {
        states,
        propertyTypes: propertyTypes || ['single_family'],
        priceRange: { min: minPrice || 0, max: maxPrice || 10000000 },
      },
    });

    // 2. Market-specific contacts
    for (const marketContact of validContacts) {
      const marketStateTags = (marketContact.markets || []).map((m: string) => getStateTag(m));
      await upsertBuyerContact({
        email: marketContact.email,
        name: marketContact.name,
        phone: marketContact.phone,
        company: fundCompanyName,
        state: marketContact.markets?.[0]?.toUpperCase(),
        tags: ['buyer', 'buybox-submission', 'market-contact', ...marketStateTags],
        fundId: fund.id,
        buyBoxId: buyBox.id,
        source: 'fast-buybox-market-contact',
        additionalMetadata: { markets: marketContact.markets || [] },
      });
    }

    // 3. Zipcode-specific contacts
    for (const zipcodeEntry of validZipcodes) {
      if (!zipcodeEntry.contact) continue;
      await upsertBuyerContact({
        email: zipcodeEntry.contact.email,
        name: zipcodeEntry.contact.name,
        phone: zipcodeEntry.contact.phone,
        company: fundCompanyName,
        zip: zipcodeEntry.zipcode,
        tags: ['buyer', 'buybox-submission', 'zipcode-contact'],
        fundId: fund.id,
        buyBoxId: buyBox.id,
        source: 'fast-buybox-zipcode-contact',
        additionalMetadata: { zipcode: zipcodeEntry.zipcode },
      });
    }

    // Reload buy boxes in the deal processing service
    try {
      await dealProcessingService.loadBuyBoxesFromDatabase();
    } catch (e) {
      console.log('Note: Could not reload buy boxes cache');
    }

    // Generate magic link token for passwordless access
    let magicLinkToken: string | undefined;
    try {
      const tokenRecord = await MagicLinkToken.generateToken({
        email: contactEmail.trim().toLowerCase(),
        fundId: fund.id,
        buyBoxId: buyBox.id,
        expiresInHours: 72, // 3 days
      });
      magicLinkToken = tokenRecord.token;
      console.log(`🔗 Generated magic link token for ${contactEmail}`);
    } catch (e) {
      console.error('Failed to generate magic link token:', e);
    }

    // Send notifications (don't await - fire and forget)
    sendEmailNotifications(buyBox, fund, fundCreated, magicLinkToken).catch(e => console.error('Email notification error:', e));
    sendDiscordNotification(buyBox, fund, fundCreated).catch(e => console.error('Discord notification error:', e));

    // Count zipcodes with contacts
    const zipcodesWithContacts = validZipcodes.filter(z => z.contact).length;

    res.status(201).json({
      success: true,
      message: fundCreated
        ? 'Buy box created successfully with new fund!'
        : 'Buy box created successfully and linked to existing fund!',
      data: {
        id: buyBox.id,
        name: buyBox.name,
        fundId: fund.id,
        fundName: buyBox.fundName,
        fundIsNew: fundCreated,
        contactEmail: buyBox.contactEmail,
        states: criteria.states,
        zipcodes: validZipcodes.length,
        zipcodesWithContacts,
        propertyTypes: criteria.propertyTypes,
        priceRange: {
          min: criteria.minPrice,
          max: criteria.maxPrice,
        },
        contactsCount: validContacts.length,
        customCriteriaCount: validCustomCriteria.length,
        enabled: buyBox.enabled,
        createdAt: buyBox.createdAt,
      },
    });
  } catch (error) {
    console.error('Fast buy box creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create buy box',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/fastbuybox/detailed
 * Create a comprehensive buy box with all available criteria
 * For experienced investors and institutions who need fine-grained control
 */
router.post('/detailed', async (req: Request, res: Response) => {
  try {
    const {
      // =============================================================================
      // BASIC INFO
      // =============================================================================
      name,
      fundName,
      contactEmail,
      contactPhone,
      description,
      contacts,

      // =============================================================================
      // GEOGRAPHIC CRITERIA
      // =============================================================================
      states,
      counties,
      cities,
      zipcodes,
      excludeStates,
      excludeCounties,
      excludeCities,
      excludeZipcodes,
      msaMetroAreas,
      excludeMsaMetroAreas,
      radiusCenterZip,
      radiusMiles,

      // =============================================================================
      // PROPERTY TYPES & DEAL TAGS
      // =============================================================================
      propertyTypes,
      excludePropertyTypes,
      acceptDealTags,
      excludeDealTags,
      requireDealTags,

      // =============================================================================
      // MOTIVATION INDICATORS
      // =============================================================================
      acceptMotivationIndicators,
      requireMotivationIndicators,
      excludeMotivationIndicators,

      // =============================================================================
      // PHYSICAL CHARACTERISTICS
      // =============================================================================
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minSqft,
      maxSqft,
      minLotSizeSqft,
      maxLotSizeSqft,
      minLotSizeAcres,
      maxLotSizeAcres,
      minStories,
      maxStories,
      minUnits,
      maxUnits,

      // Garage
      minGarages,
      maxGarages,
      allowCarport,
      requireGarage,
      allowNoGarage,

      // Basement
      requireBasement,
      allowNoBasement,
      allowFinishedBasement,
      allowUnfinishedBasement,

      // =============================================================================
      // PROPERTY AGE
      // =============================================================================
      minYearBuilt,
      maxYearBuilt,
      maxPropertyAge,

      // =============================================================================
      // PROPERTY SYSTEMS & INFRASTRUCTURE
      // =============================================================================
      // Roof
      maxRoofAge,
      roofTypes,
      allowRoofIssues,

      // HVAC
      maxHvacAge,
      hvacTypes,
      requireCentralAir,
      requireCentralHeat,
      allowNoAc,
      allowNoHeat,

      // Water Heater
      maxWaterHeaterAge,
      waterHeaterTypes,

      // Electrical
      electricalTypes,
      allowKnobAndTube,
      allowAluminumWiring,
      allowFuseBox,

      // Plumbing
      plumbingTypes,
      allowPolybutylenePipes,
      allowGalvanizedPipes,
      allowCastIronPipes,

      // Foundation
      foundationTypes,
      allowFoundationIssues,
      allowCrawlSpaceMoisture,

      // Utilities
      waterUtilityType,
      sewerUtilityType,
      gasUtilityType,

      // =============================================================================
      // FINANCIAL CRITERIA
      // =============================================================================
      minPrice,
      maxPrice,
      minArv,
      maxArv,
      minEquityPercent,
      maxEquityPercent,
      maxPercentOfArv,
      minGrossMargin,
      minGrossMarginPercent,
      minBelowMarketPercent,
      minAssignmentFee,
      maxAssignmentFee,
      minGrossYield,
      minNetYield,
      minRentToPrice,
      minDaysOnMarket,
      maxDaysOnMarket,
      minPricePerSqft,
      maxPricePerSqft,

      // =============================================================================
      // CONDITION & REHAB
      // =============================================================================
      investmentStrategies,
      conditionLevels,
      dealSourcePreference,
      minRehabBudget,
      maxRehabBudget,
      allowStructuralIssues,
      allowFireDamage,
      allowMold,
      allowAsbestos,
      allowLeadPaint,
      allowTermiteDamage,
      allowWaterDamage,
      allowRoofDamage,
      allowEnvironmentalIssues,
      allowHazardousMaterials,
      allowDemolitionRequired,

      // =============================================================================
      // PROPERTY FEATURES
      // =============================================================================
      allowPool,
      requirePool,
      allowSolarPanels,
      allowSolarLease,
      allowSeptic,
      allowWell,
      allowPrivateRoad,
      allowSharedDriveway,

      // =============================================================================
      // HOA & COMMUNITY
      // =============================================================================
      allowHoa,
      maxHoaMonthly,
      maxHoaAnnual,
      allowSpecialAssessments,
      allowLeasingRestrictions,
      allowAgeRestrictions,
      allowPetRestrictions,
      allowRentalCaps,
      allowGatedCommunity,

      // =============================================================================
      // LOCATION & NEIGHBORHOOD
      // =============================================================================
      minSchoolScore,
      maxSchoolScore,
      minWalkScore,
      minTransitScore,
      minBikeScore,
      neighborhoodClasses,
      excludeNeighborhoodClasses,
      allowMainRoad,
      allowHighTrafficArea,
      allowIndustrialArea,
      allowCommercialArea,

      // Lot characteristics
      lotTypes,
      excludeLotTypes,
      requireCornerLot,
      requireCulDeSac,
      allowWaterfront,
      requireWaterfront,
      allowWaterView,
      allowGolfCourse,

      // Zoning
      zoningTypes,
      allowZoningIssues,
      allowNonConforming,
      allowEasements,
      allowEncroachments,

      // =============================================================================
      // RISK PREFERENCES
      // =============================================================================
      allowCodeViolations,
      allowOpenPermits,
      allowLiensIfCurable,
      allowFloodZone,
      floodZoneTypes,
      allowFloodInsuranceRequired,
      crimeTolerance,
      hardNos,
      allowTitleIssues,
      allowCloudedTitle,
      allowQuitClaimOnly,
      allowLisPendens,

      // =============================================================================
      // OCCUPANCY
      // =============================================================================
      occupancyStatuses,
      allowEvictionNeeded,
      allowLongTermTenant,
      maxExistingLeaseMonths,
      allowBelowMarketRent,
      allowSection8Tenant,

      // =============================================================================
      // CREATIVE FINANCING
      // =============================================================================
      acceptSellerFinancing,
      sellerFinanceMinDown,
      sellerFinanceMaxDown,
      sellerFinanceMinTermMonths,
      sellerFinanceMaxTermMonths,
      sellerFinanceMaxInterestRate,
      sellerFinanceAllowBalloon,

      acceptSubjectTo,
      subjectToMaxLoanBalance,
      subjectToMaxLtv,
      subjectToMaxInterestRate,
      subjectToAllowArmLoans,
      subjectToMinEquity,

      acceptLeaseOption,
      leaseOptionMinTerm,
      leaseOptionMaxTerm,

      acceptAssumableLoan,
      assumableLoanTypes,

      // =============================================================================
      // STRATEGY-SPECIFIC OPTIONS
      // =============================================================================
      // Fix & Flip
      flipMinBelowArvPercent,
      flipMaxPercentOfArv,
      flipMinExpectedProfit,
      flipMinProfitPercent,
      flipMaxClosingDays,
      flipMaxHoldingPeriod,
      flipMinRoi,

      // Long-Term Rental
      rentalMinHoldYears,
      rentalMinMonthlyRent,
      rentalMaxMonthlyRent,
      rentalMinRentToPrice,
      rentalMinCapRate,
      rentalMinCashOnCash,
      rentalMinDscr,
      rentalAllowBelowMarket,
      rentalLeaseTypes,
      rentalAllowNegativeCashFlow,

      // Short-Term Rental (STR)
      strAllowed,
      strMinNightlyRate,
      strMinOccupancy,
      strMinAnnualRevenue,
      strRequirePermit,
      strMaxRegulations,

      // BRRRR
      brrrrMinEquityAfterRefinance,
      brrrrMaxAllInCost,
      brrrrMinArvForRefinance,
      brrrrMaxLtvForRefinance,
      brrrrMinCashOutPercent,

      // Wholesale
      wholesaleMinSpread,
      wholesaleMaxDaysToClose,
      wholesaleRequireAssignable,
      wholesaleMinAssignmentFee,
      wholesaleMaxContractPrice,

      // =============================================================================
      // ZESTIMATE & COMPARABLES
      // =============================================================================
      maxPercentBelowZestimate,
      minPercentBelowZestimate,
      requireZestimate,
      minComparables,
      maxDaysComps,

      // =============================================================================
      // PHOTOS & DOCUMENTATION
      // =============================================================================
      minPhotos,
      requirePhotos,
      requireInteriorPhotos,
      requireExteriorPhotos,
      require3DTour,
      requireFloorPlan,

      // =============================================================================
      // MATCHING & SCORING
      // =============================================================================
      matchStrictness,
      priorityFields,
      customCriteria,
      autoSubmit,
      autoSubmitThreshold,
      scoringWeights,

      // Hard requirements - configurable deal breakers
      hardRequirements,
    } = req.body;

    // Validation
    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Buy box name is required (min 2 characters)',
      });
    }

    if (!contactEmail || !contactEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Valid contact email is required',
      });
    }

    if (!states || !Array.isArray(states) || states.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one state is required',
      });
    }

    // Process zipcodes
    const validZipcodes: string[] = [];
    if (zipcodes && Array.isArray(zipcodes)) {
      for (const zip of zipcodes) {
        const cleanZip = typeof zip === 'string' ? zip.trim() : String(zip?.zipcode || '').trim();
        if (/^\d{5}$/.test(cleanZip)) {
          validZipcodes.push(cleanZip);
        }
      }
    }

    // Process contacts
    const validContacts: MarketContact[] = [];
    if (contacts && Array.isArray(contacts)) {
      for (const contact of contacts) {
        if (contact.name && contact.email && contact.email.includes('@')) {
          validContacts.push({
            name: String(contact.name).trim(),
            email: String(contact.email).trim().toLowerCase(),
            phone: contact.phone ? String(contact.phone).trim() : undefined,
            markets: Array.isArray(contact.markets) ? contact.markets.map((m: string) => String(m).toUpperCase()) : [],
          });
        }
      }
    }

    // Process custom criteria
    const validCustomCriteria: Array<{ text: string; enabled: boolean; weight?: number }> = [];
    if (customCriteria && Array.isArray(customCriteria)) {
      for (const c of customCriteria) {
        if (c && (c.text || c.name)) {
          validCustomCriteria.push({
            text: String(c.text || c.name).trim(),
            enabled: c.enabled !== false,
            weight: c.weight,
          });
        }
      }
    }

    // Build the comprehensive criteria object
    const criteria: Record<string, any> = {
      // Geographic
      states: states.map((s: string) => s.toUpperCase()),
      counties: counties || [],
      cities: cities || [],
      zipCodes: validZipcodes,
      excludeStates: excludeStates || [],
      excludeCounties: excludeCounties || [],
      excludeCities: excludeCities || [],
      excludeZipCodes: excludeZipcodes || [],
      msaMetroAreas: msaMetroAreas || [],
      excludeMsaMetroAreas: excludeMsaMetroAreas || [],
      radiusCenterZip,
      radiusMiles,

      // Property Types & Deal Tags
      propertyTypes: propertyTypes || ['single_family'],
      excludePropertyTypes: excludePropertyTypes || [],
      acceptDealTags: acceptDealTags || [],
      excludeDealTags: excludeDealTags || [],
      requireDealTags: requireDealTags || [],

      // Motivation Indicators
      acceptMotivationIndicators: acceptMotivationIndicators || [],
      requireMotivationIndicators: requireMotivationIndicators || [],
      excludeMotivationIndicators: excludeMotivationIndicators || [],

      // Physical Characteristics
      minBedrooms: minBedrooms ?? 1,
      maxBedrooms: maxBedrooms ?? 10,
      minBathrooms: minBathrooms ?? 1,
      maxBathrooms: maxBathrooms ?? 10,
      minSqft: minSqft ?? 500,
      maxSqft: maxSqft ?? 10000,
      minLotSizeSqft,
      maxLotSizeSqft,
      minLotSizeAcres,
      maxLotSizeAcres,
      minStories,
      maxStories,
      minUnits,
      maxUnits,
      minGarages,
      maxGarages,
      allowCarport: allowCarport !== false,
      requireGarage: requireGarage === true,
      allowNoGarage: allowNoGarage !== false,
      requireBasement: requireBasement === true,
      allowNoBasement: allowNoBasement !== false,
      allowFinishedBasement: allowFinishedBasement !== false,
      allowUnfinishedBasement: allowUnfinishedBasement !== false,

      // Property Age
      minYearBuilt: minYearBuilt ?? 1900,
      maxYearBuilt: maxYearBuilt ?? new Date().getFullYear(),
      maxPropertyAge,

      // Property Systems
      maxRoofAge,
      roofTypes: roofTypes || [],
      allowRoofIssues: allowRoofIssues === true,
      maxHvacAge,
      hvacTypes: hvacTypes || [],
      requireCentralAir: requireCentralAir === true,
      requireCentralHeat: requireCentralHeat === true,
      allowNoAc: allowNoAc !== false,
      allowNoHeat: allowNoHeat === true,
      maxWaterHeaterAge,
      waterHeaterTypes: waterHeaterTypes || [],
      electricalTypes: electricalTypes || [],
      allowKnobAndTube: allowKnobAndTube === true,
      allowAluminumWiring: allowAluminumWiring === true,
      allowFuseBox: allowFuseBox !== false,
      plumbingTypes: plumbingTypes || [],
      allowPolybutylenePipes: allowPolybutylenePipes === true,
      allowGalvanizedPipes: allowGalvanizedPipes !== false,
      allowCastIronPipes: allowCastIronPipes !== false,
      foundationTypes: foundationTypes || [],
      allowFoundationIssues: allowFoundationIssues === true,
      allowCrawlSpaceMoisture: allowCrawlSpaceMoisture === true,
      waterUtilityType: waterUtilityType || 'any',
      sewerUtilityType: sewerUtilityType || 'any',
      gasUtilityType: gasUtilityType || 'any',

      // Financial
      minPrice: minPrice ?? 0,
      maxPrice: maxPrice ?? 10000000,
      minArv,
      maxArv,
      minEquityPercent,
      maxEquityPercent,
      maxPercentOfArv,
      minGrossMargin,
      minGrossMarginPercent,
      minBelowMarketPercent,
      minAssignmentFee,
      maxAssignmentFee,
      minGrossYield,
      minNetYield,
      minRentToPrice,
      minDaysOnMarket,
      maxDaysOnMarket,
      minPricePerSqft,
      maxPricePerSqft,

      // Condition & Rehab
      investmentStrategies: investmentStrategies || ['fix_and_flip', 'long_term_rental'],
      conditionLevels: conditionLevels || ['any'],
      dealSourcePreference: dealSourcePreference || 'both',
      minRehabBudget,
      maxRehabBudget,
      allowStructuralIssues: allowStructuralIssues === true,
      allowFireDamage: allowFireDamage === true,
      allowMold: allowMold === true,
      allowAsbestos: allowAsbestos === true,
      allowLeadPaint: allowLeadPaint === true,
      allowTermiteDamage: allowTermiteDamage === true,
      allowWaterDamage: allowWaterDamage === true,
      allowRoofDamage: allowRoofDamage === true,
      allowEnvironmentalIssues: allowEnvironmentalIssues === true,
      allowHazardousMaterials: allowHazardousMaterials === true,
      allowDemolitionRequired: allowDemolitionRequired === true,

      // Property Features
      allowPool: allowPool !== false,
      requirePool: requirePool === true,
      allowSolarPanels: allowSolarPanels !== false,
      allowSolarLease: allowSolarLease === true,
      allowSeptic: allowSeptic !== false,
      allowWell: allowWell !== false,
      allowPrivateRoad: allowPrivateRoad !== false,
      allowSharedDriveway: allowSharedDriveway !== false,

      // HOA & Community
      allowHoa: allowHoa !== false,
      maxHoaMonthly: maxHoaMonthly ?? 500,
      maxHoaAnnual,
      allowSpecialAssessments: allowSpecialAssessments !== false,
      allowLeasingRestrictions: allowLeasingRestrictions === true,
      allowAgeRestrictions: allowAgeRestrictions === true,
      allowPetRestrictions: allowPetRestrictions !== false,
      allowRentalCaps: allowRentalCaps === true,
      allowGatedCommunity: allowGatedCommunity !== false,

      // Location & Neighborhood
      minSchoolScore,
      maxSchoolScore,
      minWalkScore,
      minTransitScore,
      minBikeScore,
      neighborhoodClasses: neighborhoodClasses || [],
      excludeNeighborhoodClasses: excludeNeighborhoodClasses || [],
      allowMainRoad: allowMainRoad !== false,
      allowHighTrafficArea: allowHighTrafficArea !== false,
      allowIndustrialArea: allowIndustrialArea !== false,
      allowCommercialArea: allowCommercialArea !== false,
      lotTypes: lotTypes || [],
      excludeLotTypes: excludeLotTypes || [],
      requireCornerLot: requireCornerLot === true,
      requireCulDeSac: requireCulDeSac === true,
      allowWaterfront: allowWaterfront !== false,
      requireWaterfront: requireWaterfront === true,
      allowWaterView: allowWaterView !== false,
      allowGolfCourse: allowGolfCourse !== false,
      zoningTypes: zoningTypes || [],
      allowZoningIssues: allowZoningIssues === true,
      allowNonConforming: allowNonConforming === true,
      allowEasements: allowEasements !== false,
      allowEncroachments: allowEncroachments === true,

      // Risk Preferences
      allowCodeViolations: allowCodeViolations === true,
      allowOpenPermits: allowOpenPermits === true,
      allowLiensIfCurable: allowLiensIfCurable !== false,
      allowFloodZone: allowFloodZone === true,
      floodZoneTypes: floodZoneTypes || [],
      allowFloodInsuranceRequired: allowFloodInsuranceRequired === true,
      crimeTolerance: crimeTolerance || 'medium',
      hardNos,
      allowTitleIssues: allowTitleIssues === true,
      allowCloudedTitle: allowCloudedTitle === true,
      allowQuitClaimOnly: allowQuitClaimOnly === true,
      allowLisPendens: allowLisPendens === true,

      // Occupancy
      occupancyStatuses: occupancyStatuses || ['vacant_only', 'vacant_preferred', 'tenant_occupied_ok'],
      allowEvictionNeeded: allowEvictionNeeded === true,
      allowLongTermTenant: allowLongTermTenant !== false,
      maxExistingLeaseMonths,
      allowBelowMarketRent: allowBelowMarketRent !== false,
      allowSection8Tenant: allowSection8Tenant !== false,

      // Creative Financing
      acceptSellerFinancing: acceptSellerFinancing === true,
      sellerFinanceMinDown,
      sellerFinanceMaxDown,
      sellerFinanceMinTermMonths,
      sellerFinanceMaxTermMonths,
      sellerFinanceMaxInterestRate,
      sellerFinanceAllowBalloon: sellerFinanceAllowBalloon !== false,
      acceptSubjectTo: acceptSubjectTo === true,
      subjectToMaxLoanBalance,
      subjectToMaxLtv,
      subjectToMaxInterestRate,
      subjectToAllowArmLoans: subjectToAllowArmLoans === true,
      subjectToMinEquity,
      acceptLeaseOption: acceptLeaseOption === true,
      leaseOptionMinTerm,
      leaseOptionMaxTerm,
      acceptAssumableLoan: acceptAssumableLoan === true,
      assumableLoanTypes: assumableLoanTypes || [],

      // Fix & Flip Strategy
      flipMinBelowArvPercent,
      flipMaxPercentOfArv,
      flipMinExpectedProfit,
      flipMinProfitPercent,
      flipMaxClosingDays,
      flipMaxHoldingPeriod,
      flipMinRoi,

      // Long-Term Rental Strategy
      rentalMinHoldYears,
      rentalMinMonthlyRent,
      rentalMaxMonthlyRent,
      rentalMinRentToPrice,
      rentalMinCapRate,
      rentalMinCashOnCash,
      rentalMinDscr,
      rentalAllowBelowMarket: rentalAllowBelowMarket !== false,
      rentalLeaseTypes: rentalLeaseTypes || [],
      rentalAllowNegativeCashFlow: rentalAllowNegativeCashFlow === true,

      // Short-Term Rental Strategy
      strAllowed: strAllowed !== false,
      strMinNightlyRate,
      strMinOccupancy,
      strMinAnnualRevenue,
      strRequirePermit: strRequirePermit === true,
      strMaxRegulations,

      // BRRRR Strategy
      brrrrMinEquityAfterRefinance,
      brrrrMaxAllInCost,
      brrrrMinArvForRefinance,
      brrrrMaxLtvForRefinance,
      brrrrMinCashOutPercent,

      // Wholesale Strategy
      wholesaleMinSpread,
      wholesaleMaxDaysToClose,
      wholesaleRequireAssignable: wholesaleRequireAssignable !== false,
      wholesaleMinAssignmentFee,
      wholesaleMaxContractPrice,

      // Zestimate & Comparables
      maxPercentBelowZestimate,
      minPercentBelowZestimate,
      requireZestimate: requireZestimate === true,
      minComparables,
      maxDaysComps,

      // Photos & Documentation
      minPhotos,
      requirePhotos: requirePhotos === true,
      requireInteriorPhotos: requireInteriorPhotos === true,
      requireExteriorPhotos: requireExteriorPhotos === true,
      require3DTour: require3DTour === true,
      requireFloorPlan: requireFloorPlan === true,

      // Matching
      matchStrictness: matchStrictness || 'flexible',
      priorityFields: priorityFields || [],

      // Custom Criteria
      customCriteria: validCustomCriteria,
      customCriteriaParsed: validCustomCriteria.length > 0
        ? toScoringEngineCriteria(parseCustomCriteria(validCustomCriteria.map(c => ({ name: c.text, enabled: c.enabled })), 10))
        : [],

      // Additional contacts
      additionalContacts: validContacts,

      // Hard requirements - configurable deal breakers
      // Default: state is hard, everything else is soft
      hardRequirements: hardRequirements || {
        state: true,        // Wrong state = excluded
        maxPrice: false,    // Over budget = reduced score (15% tolerance)
        propertyType: false,
        minBedrooms: false,
        maxBedrooms: false,
        minBathrooms: false,
        maxBathrooms: false,
        minYearBuilt: false,
        allowHoa: false,
        allowFloodZone: false,
        allowStructuralIssues: false,
        allowFoundationIssues: false,
        allowFireDamage: false,
      },
    };

    // Custom scoring weights or defaults
    const hasCustomCriteria = validCustomCriteria.some(c => c.enabled);
    const finalScoringWeights = scoringWeights || {
      geographic: 20,
      price: 15,
      propertyType: 10,
      bedrooms: 5,
      bathrooms: 5,
      yearBuilt: 5,
      occupancy: 5,
      hoa: 5,
      photos: 5,
      condition: 5,
      riskFactors: 5,
      strategyMetrics: 5,
      custom: hasCustomCriteria ? 10 : 0,
      dealTags: acceptDealTags?.length ? 5 : 0,
      motivationIndicators: acceptMotivationIndicators?.length ? 5 : 0,
    };

    // Find or create Fund
    const { fund, created: fundCreated } = await Fund.findOrCreateByEmail({
      name: fundName?.trim() || name.trim(),
      companyName: fundName?.trim(),
      contactEmail: contactEmail.trim().toLowerCase(),
      contactPhone: contactPhone?.trim(),
    });

    if (fundCreated) {
      console.log(`Created new fund: ${fund.name} (${fund.id})`);
    } else {
      console.log(`Linked to existing fund: ${fund.name} (${fund.id})`);
    }

    // Create the detailed buy box
    const buyBox = await HedgeFundBuyBox.create({
      name: name.trim(),
      fundId: fund.id,
      fundName: fundName?.trim() || name.trim(),
      contactEmail: contactEmail.trim().toLowerCase(),
      contactPhone: contactPhone?.trim(),
      description: description?.trim() || `Detailed buy box for ${name} - Created via Advanced Buy Box`,
      enabled: true,
      priority: 1,
      criteria,
      scoringWeights: finalScoringWeights,
      autoSubmit: autoSubmit === true,
      autoSubmitThreshold: autoSubmitThreshold || 80,
      marketContacts: validContacts,
    });

    // Create/update contact records for all buyers associated with this buybox
    const fundCompanyName = fundName?.trim() || name.trim();
    const stateTags = (states || []).map((s: string) => getStateTag(s));

    // 1. Primary fund contact (always upsert)
    await upsertBuyerContact({
      email: contactEmail,
      name: fundCompanyName,
      phone: contactPhone?.trim(),
      company: fundCompanyName,
      state: states?.[0]?.toUpperCase(),
      tags: ['buyer', 'buybox-submission', 'primary-contact', 'detailed', ...stateTags],
      fundId: fund.id,
      buyBoxId: buyBox.id,
      source: 'detailed-buybox',
      additionalMetadata: {
        states,
        propertyTypes: propertyTypes || ['single_family'],
        investmentStrategies: investmentStrategies || [],
        priceRange: { min: minPrice || 0, max: maxPrice || 10000000 },
      },
    });

    // 2. Market-specific contacts
    for (const marketContact of validContacts) {
      const marketStateTags = (marketContact.markets || []).map((m: string) => getStateTag(m));
      await upsertBuyerContact({
        email: marketContact.email,
        name: marketContact.name,
        phone: marketContact.phone,
        company: fundCompanyName,
        state: marketContact.markets?.[0]?.toUpperCase(),
        tags: ['buyer', 'buybox-submission', 'market-contact', 'detailed', ...marketStateTags],
        fundId: fund.id,
        buyBoxId: buyBox.id,
        source: 'detailed-buybox-market-contact',
        additionalMetadata: { markets: marketContact.markets || [] },
      });
    }

    // Note: Detailed endpoint uses string zipcodes without contacts

    // Reload buy boxes in the deal processing service
    try {
      await dealProcessingService.loadBuyBoxesFromDatabase();
    } catch (e) {
      console.log('Note: Could not reload buy boxes cache');
    }

    res.status(201).json({
      success: true,
      message: fundCreated
        ? 'Detailed buy box created successfully with new fund!'
        : 'Detailed buy box created successfully and linked to existing fund!',
      data: {
        id: buyBox.id,
        name: buyBox.name,
        fundId: fund.id,
        fundName: buyBox.fundName,
        fundIsNew: fundCreated,
        contactEmail: buyBox.contactEmail,
        type: 'detailed',
        criteriaCount: Object.keys(criteria).filter(k => criteria[k] !== undefined && criteria[k] !== null).length,
        states: criteria.states,
        propertyTypes: criteria.propertyTypes,
        investmentStrategies: criteria.investmentStrategies,
        dealTags: criteria.acceptDealTags?.length || 0,
        motivationIndicators: criteria.acceptMotivationIndicators?.length || 0,
        creativeFinancing: {
          sellerFinancing: criteria.acceptSellerFinancing,
          subjectTo: criteria.acceptSubjectTo,
          leaseOption: criteria.acceptLeaseOption,
          assumableLoan: criteria.acceptAssumableLoan,
        },
        priceRange: {
          min: criteria.minPrice,
          max: criteria.maxPrice,
        },
        contactsCount: validContacts.length,
        customCriteriaCount: validCustomCriteria.length,
        enabled: buyBox.enabled,
        createdAt: buyBox.createdAt,
      },
    });
  } catch (error) {
    console.error('Detailed buy box creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create detailed buy box',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/fastbuybox/options
 * Get available options for buy box creation (states, property types, etc.)
 * Comprehensive options covering all possible buy box criteria
 */
router.get('/options', async (req: Request, res: Response) => {
  const mode = req.query.mode as string; // 'simple' or 'detailed'

  // Simple options for Fast Buy Box (quick onboarding)
  const simpleOptions = {
    states: [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    ],
    propertyTypes: [
      { value: 'single_family', label: 'Single Family' },
      { value: 'townhouse', label: 'Townhouse' },
      { value: 'condo', label: 'Condo' },
      { value: 'multi_family', label: 'Multi-Family (2-4 units)' },
      { value: 'manufactured', label: 'Manufactured/Mobile' },
    ],
    investmentStrategies: [
      { value: 'fix_and_flip', label: 'Fix & Flip' },
      { value: 'long_term_rental', label: 'Long-Term Rental (Buy & Hold)' },
      { value: 'short_term_rental', label: 'Short-Term Rental (Airbnb)' },
      { value: 'wholesale', label: 'Wholesale' },
      { value: 'novation', label: 'Novation' },
      { value: 'subject_to', label: 'Subject-To' },
    ],
    conditionLevels: [
      { value: 'any', label: 'Any Condition' },
      { value: 'turnkey', label: 'Turnkey (Move-in Ready)' },
      { value: 'light_rehab', label: 'Light Rehab ($0-25k)' },
      { value: 'medium_rehab', label: 'Medium Rehab ($25-75k)' },
      { value: 'heavy_rehab', label: 'Heavy Rehab ($75k+)' },
    ],
    occupancyStatuses: [
      { value: 'vacant_only', label: 'Vacant Only' },
      { value: 'vacant_preferred', label: 'Vacant Preferred' },
      { value: 'tenant_in_place', label: 'Tenant OK' },
      { value: 'owner_occupied', label: 'Owner Occupied OK' },
    ],
    crimeTolerances: [
      { value: 'low', label: 'Low Crime Only' },
      { value: 'medium', label: 'Medium (Some Tolerance)' },
      { value: 'high', label: 'Any Area' },
    ],
    riskToleranceOptions: {
      propertyFeatures: [
        { key: 'allowHoa', label: 'Allow HOA', defaultValue: true },
        { key: 'allowPool', label: 'Allow Pools', defaultValue: true },
        { key: 'allowSolarPanels', label: 'Allow Solar Panels', defaultValue: true },
        { key: 'allowSeptic', label: 'Allow Septic System', defaultValue: true },
        { key: 'allowWell', label: 'Allow Well Water', defaultValue: true },
        { key: 'allowMainRoad', label: 'Allow Main Road Location', defaultValue: true },
      ],
      propertyIssues: [
        { key: 'allowFloodZone', label: 'Allow Flood Zone', defaultValue: false },
        { key: 'allowFoundationIssues', label: 'Allow Foundation Issues', defaultValue: false },
        { key: 'allowStructuralIssues', label: 'Allow Structural Issues', defaultValue: false },
        { key: 'allowFireDamage', label: 'Allow Fire Damage', defaultValue: false },
        { key: 'allowCodeViolations', label: 'Allow Code Violations', defaultValue: false },
        { key: 'allowOpenPermits', label: 'Allow Open Permits', defaultValue: false },
        { key: 'allowLiensIfCurable', label: 'Allow Liens (If Curable)', defaultValue: true },
      ],
      community: [
        { key: 'allowLeasingRestrictions', label: 'Allow Leasing Restrictions', defaultValue: false },
        { key: 'allowAgeRestrictions', label: 'Allow Age Restrictions (55+)', defaultValue: false },
      ],
    },
  };

  // If simple mode requested, return only simple options
  if (mode === 'simple') {
    return res.json({
      success: true,
      mode: 'simple',
      data: simpleOptions,
    });
  }

  // Return detailed/full options (default)
  res.json({
    success: true,
    mode: 'detailed',
    data: {
      // Include simple options for backwards compatibility
      ...simpleOptions,

      // =============================================================================
      // GEOGRAPHIC (Extended)
      // =============================================================================
      states: [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
      ],

      // =============================================================================
      // PROPERTY TYPES (Comprehensive)
      // =============================================================================
      propertyTypes: [
        // Residential
        { value: 'single_family', label: 'Single Family', category: 'residential' },
        { value: 'townhouse', label: 'Townhouse', category: 'residential' },
        { value: 'condo', label: 'Condo', category: 'residential' },
        { value: 'condo_townhome', label: 'Condo/Townhome', category: 'residential' },
        { value: 'duplex', label: 'Duplex (2 units)', category: 'residential' },
        { value: 'triplex', label: 'Triplex (3 units)', category: 'residential' },
        { value: 'fourplex', label: 'Fourplex (4 units)', category: 'residential' },
        { value: 'small_multifamily', label: 'Small Multi-Family (5-20 units)', category: 'residential' },
        { value: 'large_multifamily', label: 'Large Multi-Family (20+ units)', category: 'residential' },
        { value: 'apartment_building', label: 'Apartment Building', category: 'residential' },
        // Mobile/Manufactured
        { value: 'mobile_home', label: 'Mobile Home (Single)', category: 'manufactured' },
        { value: 'mobile_home_park', label: 'Mobile Home Park', category: 'manufactured' },
        { value: 'modular_home', label: 'Modular Home', category: 'manufactured' },
        { value: 'tiny_home', label: 'Tiny Home', category: 'manufactured' },
        // Commercial
        { value: 'commercial', label: 'Commercial', category: 'commercial' },
        { value: 'mixed_use', label: 'Mixed Use', category: 'commercial' },
        { value: 'office', label: 'Office', category: 'commercial' },
        { value: 'retail', label: 'Retail', category: 'commercial' },
        { value: 'light_industrial', label: 'Light Industrial', category: 'commercial' },
        { value: 'warehouse', label: 'Warehouse', category: 'commercial' },
        { value: 'storage_units', label: 'Self-Storage', category: 'commercial' },
        // Land
        { value: 'land', label: 'Land', category: 'land' },
        { value: 'vacant_land', label: 'Vacant Land', category: 'land' },
        { value: 'raw_land', label: 'Raw/Undeveloped Land', category: 'land' },
        { value: 'farm_ranch', label: 'Farm/Ranch', category: 'land' },
        // Special
        { value: 'adu', label: 'ADU (Accessory Dwelling Unit)', category: 'special' },
        { value: 'portfolio', label: 'Portfolio (Multiple Properties)', category: 'special' },
        { value: 'other', label: 'Other', category: 'special' },
      ],

      // =============================================================================
      // INVESTMENT STRATEGIES (Comprehensive)
      // =============================================================================
      investmentStrategies: [
        { value: 'fix_and_flip', label: 'Fix & Flip', description: 'Buy, renovate, sell quickly for profit' },
        { value: 'long_term_rental', label: 'Long-Term Rental (Buy & Hold)', description: 'Buy and hold for rental income' },
        { value: 'short_term_rental', label: 'Short-Term Rental (Airbnb/VRBO)', description: 'Vacation rental strategy' },
        { value: 'brrrr', label: 'BRRRR', description: 'Buy, Rehab, Rent, Refinance, Repeat' },
        { value: 'wholesale', label: 'Wholesale', description: 'Contract and assign to end buyer' },
        { value: 'novation', label: 'Novation', description: 'Replace original contract with new one' },
        { value: 'subject_to', label: 'Subject-To', description: 'Take over existing financing' },
        { value: 'seller_financing', label: 'Seller Financing', description: 'Seller carries the note' },
        { value: 'lease_option', label: 'Lease Option', description: 'Rent with option to buy' },
        { value: 'land_development', label: 'Land Development', description: 'Develop raw land' },
        { value: 'new_construction', label: 'New Construction', description: 'Build new property' },
        { value: 'commercial_conversion', label: 'Commercial Conversion', description: 'Convert to different use' },
      ],

      // =============================================================================
      // DEAL TAGS (Like InvestorLift)
      // =============================================================================
      dealTags: [
        // Deal Structure
        { value: 'portfolio_deal', label: 'Portfolio Deal', category: 'structure' },
        { value: 'seller_financing_available', label: 'Seller Financing Available', category: 'structure' },
        { value: 'subject_to_available', label: 'Subject-To Available', category: 'structure' },
        { value: 'lease_option_available', label: 'Lease Option Available', category: 'structure' },
        { value: 'assumable_loan', label: 'Assumable Loan', category: 'structure' },
        { value: 'cash_only', label: 'Cash Only', category: 'structure' },
        { value: 'quick_close', label: 'Quick Close Needed', category: 'structure' },
        { value: 'as_is', label: 'As-Is Sale', category: 'structure' },
        // Distressed/Motivated
        { value: 'pre_foreclosure', label: 'Pre-Foreclosure', category: 'distressed' },
        { value: 'short_sale', label: 'Short Sale', category: 'distressed' },
        { value: 'reo_bank_owned', label: 'REO/Bank Owned', category: 'distressed' },
        { value: 'auction', label: 'Auction', category: 'distressed' },
        { value: 'hud_home', label: 'HUD Home', category: 'distressed' },
        { value: 'va_foreclosure', label: 'VA Foreclosure', category: 'distressed' },
        { value: 'fannie_mae', label: 'Fannie Mae HomePath', category: 'distressed' },
        { value: 'freddie_mac', label: 'Freddie Mac HomeSteps', category: 'distressed' },
        { value: 'tax_lien', label: 'Tax Lien', category: 'distressed' },
        { value: 'tax_deed', label: 'Tax Deed', category: 'distressed' },
        // Estate/Life Events
        { value: 'probate', label: 'Probate', category: 'estate' },
        { value: 'pre_probate', label: 'Pre-Probate', category: 'estate' },
        { value: 'estate_sale', label: 'Estate Sale', category: 'estate' },
        { value: 'inherited', label: 'Inherited Property', category: 'estate' },
        { value: 'divorce', label: 'Divorce Sale', category: 'estate' },
        { value: 'bankruptcy', label: 'Bankruptcy Sale', category: 'estate' },
        // Condition
        { value: 'fire_damaged', label: 'Fire Damaged', category: 'condition' },
        { value: 'condemned', label: 'Condemned', category: 'condition' },
        { value: 'code_violation', label: 'Code Violation', category: 'condition' },
      ],

      // =============================================================================
      // MOTIVATION/DISTRESS INDICATORS (Like PropStream)
      // =============================================================================
      motivationIndicators: [
        // Financial Distress
        { value: 'pre_foreclosure', label: 'Pre-Foreclosure', category: 'financial' },
        { value: 'tax_delinquent', label: 'Tax Delinquent', category: 'financial' },
        { value: 'bankruptcy', label: 'Bankruptcy Filed', category: 'financial' },
        { value: 'utility_lien', label: 'Utility Lien', category: 'financial' },
        { value: 'hoa_lien', label: 'HOA Lien', category: 'financial' },
        { value: 'mechanics_lien', label: 'Mechanics Lien', category: 'financial' },
        { value: 'judgment_lien', label: 'Judgment Lien', category: 'financial' },
        // Life Events
        { value: 'probate', label: 'Probate', category: 'life_event' },
        { value: 'pre_probate', label: 'Pre-Probate (Owner Deceased)', category: 'life_event' },
        { value: 'divorce', label: 'Divorce Filed', category: 'life_event' },
        { value: 'inherited', label: 'Inherited Property', category: 'life_event' },
        { value: 'senior_owner', label: 'Senior Owner (65+)', category: 'life_event' },
        // Owner Type
        { value: 'absentee_owner', label: 'Absentee Owner', category: 'owner' },
        { value: 'out_of_state_owner', label: 'Out-of-State Owner', category: 'owner' },
        { value: 'corporate_owned', label: 'Corporate Owned', category: 'owner' },
        { value: 'long_term_owner', label: 'Long-Term Owner (10+ years)', category: 'owner' },
        { value: 'tired_landlord', label: 'Tired Landlord', category: 'owner' },
        // Equity
        { value: 'high_equity', label: 'High Equity (50%+)', category: 'equity' },
        { value: 'low_equity', label: 'Low Equity', category: 'equity' },
        { value: 'free_and_clear', label: 'Free & Clear (No Mortgage)', category: 'equity' },
        // Property Status
        { value: 'vacant', label: 'Vacant Property', category: 'status' },
        { value: 'code_violation', label: 'Code Violations', category: 'status' },
      ],

      // =============================================================================
      // CONDITION LEVELS
      // =============================================================================
      conditionLevels: [
        { value: 'any', label: 'Any Condition' },
        { value: 'turnkey', label: 'Turnkey (Move-in Ready)' },
        { value: 'light', label: 'Light Rehab ($0-25k)' },
        { value: 'medium', label: 'Medium Rehab ($25k-75k)' },
        { value: 'heavy', label: 'Heavy Rehab ($75k-150k)' },
        { value: 'full_gut', label: 'Full Gut Rehab ($150k+)' },
        { value: 'tear_down', label: 'Tear Down / Rebuild' },
      ],

      // =============================================================================
      // OCCUPANCY STATUSES
      // =============================================================================
      occupancyStatuses: [
        { value: 'vacant_only', label: 'Vacant Only' },
        { value: 'vacant_preferred', label: 'Vacant Preferred' },
        { value: 'tenant_occupied_ok', label: 'Tenant Occupied OK' },
        { value: 'owner_occupied_ok', label: 'Owner Occupied OK' },
        { value: 'section_8_ok', label: 'Section 8 Tenant OK' },
        { value: 'month_to_month_ok', label: 'Month-to-Month Tenant OK' },
        { value: 'unknown_ok', label: 'Unknown Status OK' },
      ],

      // =============================================================================
      // NEIGHBORHOOD CLASSES
      // =============================================================================
      neighborhoodClasses: [
        { value: 'A', label: 'Class A (Premium/Luxury)', description: 'High-end neighborhoods, low crime, excellent schools' },
        { value: 'B', label: 'Class B (Nice/Stable)', description: 'Good neighborhoods, established areas' },
        { value: 'C', label: 'Class C (Working Class)', description: 'Blue-collar areas, older homes' },
        { value: 'D', label: 'Class D (Challenging)', description: 'Higher crime, distressed areas' },
        { value: 'any', label: 'Any Neighborhood Class' },
      ],

      // =============================================================================
      // FOUNDATION TYPES
      // =============================================================================
      foundationTypes: [
        { value: 'slab', label: 'Slab' },
        { value: 'crawl_space', label: 'Crawl Space' },
        { value: 'basement', label: 'Basement' },
        { value: 'pier_and_beam', label: 'Pier & Beam' },
        { value: 'raised', label: 'Raised Foundation' },
        { value: 'any', label: 'Any Foundation Type' },
      ],

      // =============================================================================
      // LOT TYPES
      // =============================================================================
      lotTypes: [
        { value: 'flat', label: 'Flat Lot' },
        { value: 'sloped', label: 'Sloped Lot' },
        { value: 'corner', label: 'Corner Lot' },
        { value: 'cul_de_sac', label: 'Cul-de-sac' },
        { value: 'waterfront', label: 'Waterfront' },
        { value: 'water_view', label: 'Water View' },
        { value: 'golf_course', label: 'Golf Course' },
        { value: 'greenbelt', label: 'Greenbelt/Park Adjacent' },
        { value: 'flag_lot', label: 'Flag Lot' },
        { value: 'any', label: 'Any Lot Type' },
      ],

      // =============================================================================
      // CRIME TOLERANCES
      // =============================================================================
      crimeTolerances: [
        { value: 'low', label: 'Low Crime Only (Class A/B areas)' },
        { value: 'medium', label: 'Medium Tolerance (Most areas)' },
        { value: 'high', label: 'High Tolerance (Any area)' },
        { value: 'any', label: 'No Crime Preference' },
      ],

      // =============================================================================
      // PROPERTY SYSTEMS OPTIONS
      // =============================================================================
      propertySystems: {
        roofTypes: [
          { value: 'shingle', label: 'Asphalt Shingle' },
          { value: 'metal', label: 'Metal' },
          { value: 'tile', label: 'Tile' },
          { value: 'slate', label: 'Slate' },
          { value: 'flat', label: 'Flat/Built-Up' },
          { value: 'wood_shake', label: 'Wood Shake' },
          { value: 'any', label: 'Any Roof Type' },
        ],
        hvacTypes: [
          { value: 'central_ac', label: 'Central A/C' },
          { value: 'central_heat', label: 'Central Heat' },
          { value: 'heat_pump', label: 'Heat Pump' },
          { value: 'window_units', label: 'Window Units' },
          { value: 'mini_split', label: 'Mini-Split' },
          { value: 'radiant', label: 'Radiant Heat' },
          { value: 'none', label: 'No HVAC' },
          { value: 'any', label: 'Any HVAC Type' },
        ],
        electricalTypes: [
          { value: '100_amp', label: '100 Amp' },
          { value: '150_amp', label: '150 Amp' },
          { value: '200_amp', label: '200 Amp' },
          { value: '400_amp', label: '400 Amp' },
          { value: 'any', label: 'Any Electrical' },
        ],
        plumbingTypes: [
          { value: 'copper', label: 'Copper' },
          { value: 'pvc', label: 'PVC' },
          { value: 'pex', label: 'PEX' },
          { value: 'galvanized', label: 'Galvanized' },
          { value: 'cast_iron', label: 'Cast Iron' },
          { value: 'polybutylene', label: 'Polybutylene' },
          { value: 'any', label: 'Any Plumbing' },
        ],
      },

      // =============================================================================
      // FLOOD ZONES
      // =============================================================================
      floodZones: [
        { value: 'X', label: 'Zone X (Minimal Risk)' },
        { value: 'A', label: 'Zone A (High Risk)' },
        { value: 'AE', label: 'Zone AE (High Risk with BFE)' },
        { value: 'AH', label: 'Zone AH (Shallow Flooding)' },
        { value: 'AO', label: 'Zone AO (Sheet Flow)' },
        { value: 'V', label: 'Zone V (Coastal High Risk)' },
        { value: 'VE', label: 'Zone VE (Coastal with BFE)' },
        { value: 'any', label: 'Any Flood Zone' },
      ],

      // =============================================================================
      // CREATIVE FINANCING OPTIONS
      // =============================================================================
      creativeFinancingOptions: {
        sellerFinancing: {
          downPaymentRanges: [
            { value: '0-5', label: '0-5% Down' },
            { value: '5-10', label: '5-10% Down' },
            { value: '10-20', label: '10-20% Down' },
            { value: '20+', label: '20%+ Down' },
          ],
          termOptions: [
            { value: '12', label: '1 Year' },
            { value: '36', label: '3 Years' },
            { value: '60', label: '5 Years' },
            { value: '120', label: '10 Years' },
            { value: '180', label: '15 Years' },
            { value: '240', label: '20 Years' },
            { value: '360', label: '30 Years' },
          ],
          interestRates: [
            { value: '0-4', label: '0-4%' },
            { value: '4-6', label: '4-6%' },
            { value: '6-8', label: '6-8%' },
            { value: '8-10', label: '8-10%' },
            { value: '10+', label: '10%+' },
          ],
        },
        subjectTo: {
          ltvRanges: [
            { value: '0-60', label: '0-60% LTV' },
            { value: '60-70', label: '60-70% LTV' },
            { value: '70-80', label: '70-80% LTV' },
            { value: '80-90', label: '80-90% LTV' },
            { value: '90+', label: '90%+ LTV' },
          ],
          equityRanges: [
            { value: '10+', label: '10%+ Equity' },
            { value: '20+', label: '20%+ Equity' },
            { value: '30+', label: '30%+ Equity' },
            { value: '40+', label: '40%+ Equity' },
          ],
        },
        assumableLoanTypes: [
          { value: 'fha', label: 'FHA Loan' },
          { value: 'va', label: 'VA Loan' },
          { value: 'usda', label: 'USDA Loan' },
          { value: 'conventional', label: 'Conventional (Older)' },
        ],
      },

      // =============================================================================
      // RISK TOLERANCE OPTIONS (Comprehensive)
      // =============================================================================
      riskToleranceOptions: {
        // Property Features
        propertyFeatures: [
          { key: 'allowHoa', label: 'Allow HOA', defaultValue: true, category: 'features' },
          { key: 'allowPool', label: 'Allow Pool', defaultValue: true, category: 'features' },
          { key: 'requirePool', label: 'Require Pool', defaultValue: false, category: 'features' },
          { key: 'allowSolarPanels', label: 'Allow Solar Panels', defaultValue: true, category: 'features' },
          { key: 'allowSolarLease', label: 'Allow Leased Solar', defaultValue: false, category: 'features' },
          { key: 'allowSeptic', label: 'Allow Septic System', defaultValue: true, category: 'features' },
          { key: 'allowWell', label: 'Allow Well Water', defaultValue: true, category: 'features' },
          { key: 'allowPrivateRoad', label: 'Allow Private Road', defaultValue: true, category: 'features' },
          { key: 'allowSharedDriveway', label: 'Allow Shared Driveway', defaultValue: true, category: 'features' },
          { key: 'allowMainRoad', label: 'Allow Main Road Location', defaultValue: true, category: 'features' },
          { key: 'requireBasement', label: 'Require Basement', defaultValue: false, category: 'features' },
          { key: 'requireGarage', label: 'Require Garage', defaultValue: false, category: 'features' },
        ],
        // Structural/Condition Issues
        propertyIssues: [
          { key: 'allowFoundationIssues', label: 'Allow Foundation Issues', defaultValue: false, category: 'structural' },
          { key: 'allowStructuralIssues', label: 'Allow Structural Issues', defaultValue: false, category: 'structural' },
          { key: 'allowRoofDamage', label: 'Allow Roof Damage', defaultValue: false, category: 'structural' },
          { key: 'allowRoofIssues', label: 'Allow Roof Issues', defaultValue: false, category: 'structural' },
          { key: 'allowFireDamage', label: 'Allow Fire Damage', defaultValue: false, category: 'structural' },
          { key: 'allowWaterDamage', label: 'Allow Water Damage', defaultValue: false, category: 'structural' },
          { key: 'allowMold', label: 'Allow Mold', defaultValue: false, category: 'environmental' },
          { key: 'allowAsbestos', label: 'Allow Asbestos', defaultValue: false, category: 'environmental' },
          { key: 'allowLeadPaint', label: 'Allow Lead Paint', defaultValue: false, category: 'environmental' },
          { key: 'allowTermiteDamage', label: 'Allow Termite Damage', defaultValue: false, category: 'environmental' },
          { key: 'allowEnvironmentalIssues', label: 'Allow Environmental Issues', defaultValue: false, category: 'environmental' },
          { key: 'allowHazardousMaterials', label: 'Allow Hazardous Materials', defaultValue: false, category: 'environmental' },
          { key: 'allowDemolitionRequired', label: 'Allow Demolition Required', defaultValue: false, category: 'structural' },
        ],
        // Electrical/Plumbing Issues
        systemsIssues: [
          { key: 'allowKnobAndTube', label: 'Allow Knob & Tube Wiring', defaultValue: false, category: 'electrical' },
          { key: 'allowAluminumWiring', label: 'Allow Aluminum Wiring', defaultValue: false, category: 'electrical' },
          { key: 'allowFuseBox', label: 'Allow Fuse Box', defaultValue: true, category: 'electrical' },
          { key: 'allowPolybutylenePipes', label: 'Allow Polybutylene Pipes', defaultValue: false, category: 'plumbing' },
          { key: 'allowGalvanizedPipes', label: 'Allow Galvanized Pipes', defaultValue: true, category: 'plumbing' },
          { key: 'allowCastIronPipes', label: 'Allow Cast Iron Pipes', defaultValue: true, category: 'plumbing' },
          { key: 'allowNoAc', label: 'Allow No A/C', defaultValue: true, category: 'hvac' },
          { key: 'allowNoHeat', label: 'Allow No Heat', defaultValue: false, category: 'hvac' },
        ],
        // Legal/Title Issues
        legalIssues: [
          { key: 'allowFloodZone', label: 'Allow Flood Zone', defaultValue: false, category: 'legal' },
          { key: 'allowFloodInsuranceRequired', label: 'Allow Flood Insurance Required', defaultValue: false, category: 'legal' },
          { key: 'allowCodeViolations', label: 'Allow Code Violations', defaultValue: false, category: 'legal' },
          { key: 'allowOpenPermits', label: 'Allow Open Permits', defaultValue: false, category: 'legal' },
          { key: 'allowLiensIfCurable', label: 'Allow Liens (If Curable)', defaultValue: true, category: 'legal' },
          { key: 'allowTitleIssues', label: 'Allow Title Issues', defaultValue: false, category: 'legal' },
          { key: 'allowCloudedTitle', label: 'Allow Clouded Title', defaultValue: false, category: 'legal' },
          { key: 'allowQuitClaimOnly', label: 'Allow Quit Claim Only', defaultValue: false, category: 'legal' },
          { key: 'allowLisPendens', label: 'Allow Lis Pendens', defaultValue: false, category: 'legal' },
          { key: 'allowZoningIssues', label: 'Allow Zoning Issues', defaultValue: false, category: 'legal' },
          { key: 'allowNonConforming', label: 'Allow Non-Conforming Use', defaultValue: false, category: 'legal' },
          { key: 'allowEasements', label: 'Allow Easements', defaultValue: true, category: 'legal' },
          { key: 'allowEncroachments', label: 'Allow Encroachments', defaultValue: false, category: 'legal' },
        ],
        // Community/HOA Issues
        community: [
          { key: 'allowLeasingRestrictions', label: 'Allow Leasing Restrictions', defaultValue: false, category: 'hoa' },
          { key: 'allowAgeRestrictions', label: 'Allow Age Restrictions (55+)', defaultValue: false, category: 'hoa' },
          { key: 'allowPetRestrictions', label: 'Allow Pet Restrictions', defaultValue: true, category: 'hoa' },
          { key: 'allowRentalCaps', label: 'Allow Rental Caps', defaultValue: false, category: 'hoa' },
          { key: 'allowSpecialAssessments', label: 'Allow Special Assessments', defaultValue: true, category: 'hoa' },
          { key: 'allowGatedCommunity', label: 'Allow Gated Community', defaultValue: true, category: 'hoa' },
        ],
        // Occupancy/Tenant Issues
        occupancy: [
          { key: 'allowEvictionNeeded', label: 'Allow Eviction Needed', defaultValue: false, category: 'tenant' },
          { key: 'allowLongTermTenant', label: 'Allow Long-Term Tenant (2+ years)', defaultValue: true, category: 'tenant' },
          { key: 'allowBelowMarketRent', label: 'Allow Below Market Rent', defaultValue: true, category: 'tenant' },
          { key: 'allowSection8Tenant', label: 'Allow Section 8 Tenant', defaultValue: true, category: 'tenant' },
        ],
      },

      // =============================================================================
      // FINANCIAL METRICS OPTIONS
      // =============================================================================
      financialMetrics: {
        arvPercentages: [
          { value: 60, label: '60% of ARV' },
          { value: 65, label: '65% of ARV' },
          { value: 70, label: '70% of ARV (Standard)' },
          { value: 75, label: '75% of ARV' },
          { value: 80, label: '80% of ARV' },
        ],
        equityPercentages: [
          { value: 10, label: '10%+ Equity' },
          { value: 20, label: '20%+ Equity' },
          { value: 30, label: '30%+ Equity' },
          { value: 40, label: '40%+ Equity' },
          { value: 50, label: '50%+ Equity' },
        ],
        daysOnMarket: [
          { value: 7, label: 'New (< 7 days)' },
          { value: 30, label: 'Fresh (< 30 days)' },
          { value: 60, label: 'Standard (< 60 days)' },
          { value: 90, label: 'Stale (< 90 days)' },
          { value: 180, label: 'Very Stale (< 180 days)' },
          { value: 9999, label: 'Any Days on Market' },
        ],
        capRates: [
          { value: 4, label: '4%+ Cap Rate' },
          { value: 5, label: '5%+ Cap Rate' },
          { value: 6, label: '6%+ Cap Rate' },
          { value: 7, label: '7%+ Cap Rate' },
          { value: 8, label: '8%+ Cap Rate' },
          { value: 10, label: '10%+ Cap Rate' },
        ],
        rentToPrice: [
          { value: 0.007, label: '0.7% (Lower)' },
          { value: 0.008, label: '0.8%' },
          { value: 0.01, label: '1% (The 1% Rule)' },
          { value: 0.012, label: '1.2%' },
          { value: 0.015, label: '1.5%' },
          { value: 0.02, label: '2% (Strong Cash Flow)' },
        ],
      },

      // =============================================================================
      // LEASE TYPES
      // =============================================================================
      leaseTypes: [
        { value: 'fixed_term', label: 'Fixed Term Lease' },
        { value: 'month_to_month', label: 'Month-to-Month' },
        { value: 'section_8_ok', label: 'Section 8 Accepted' },
        { value: 'any', label: 'Any Lease Type' },
      ],

      // =============================================================================
      // ZONING TYPES
      // =============================================================================
      zoningTypes: [
        { value: 'residential_single', label: 'Residential - Single Family' },
        { value: 'residential_multi', label: 'Residential - Multi-Family' },
        { value: 'commercial', label: 'Commercial' },
        { value: 'mixed_use', label: 'Mixed Use' },
        { value: 'industrial', label: 'Industrial' },
        { value: 'agricultural', label: 'Agricultural' },
        { value: 'any', label: 'Any Zoning' },
      ],

      // =============================================================================
      // HARD REQUIREMENTS - Configurable deal breakers
      // When a criterion is marked as hard (true), failing it = excluded (score 0)
      // When soft (false or undefined), failing it = reduced score
      // =============================================================================
      hardRequirements: {
        description: 'Configure which criteria are deal-breakers vs soft preferences',
        options: [
          // Geographic
          { key: 'state', label: 'State Match', defaultValue: true, description: 'Wrong state = excluded (recommended)' },
          { key: 'county', label: 'County Match', defaultValue: false, description: 'Wrong county = excluded' },
          { key: 'city', label: 'City Match', defaultValue: false, description: 'Wrong city = excluded' },
          { key: 'zipCode', label: 'Zip Code Match', defaultValue: false, description: 'Wrong zip = excluded' },
          // Financial
          { key: 'maxPrice', label: 'Max Price', defaultValue: false, description: 'Over max budget = excluded' },
          { key: 'minPrice', label: 'Min Price', defaultValue: false, description: 'Under min budget = excluded' },
          // Property characteristics
          { key: 'propertyType', label: 'Property Type', defaultValue: false, description: 'Wrong type = excluded' },
          { key: 'minBedrooms', label: 'Min Bedrooms', defaultValue: false, description: 'Too few bedrooms = excluded' },
          { key: 'maxBedrooms', label: 'Max Bedrooms', defaultValue: false, description: 'Too many bedrooms = excluded' },
          { key: 'minBathrooms', label: 'Min Bathrooms', defaultValue: false, description: 'Too few bathrooms = excluded' },
          { key: 'maxBathrooms', label: 'Max Bathrooms', defaultValue: false, description: 'Too many bathrooms = excluded' },
          { key: 'minSqft', label: 'Min Square Feet', defaultValue: false, description: 'Too small = excluded' },
          { key: 'maxSqft', label: 'Max Square Feet', defaultValue: false, description: 'Too large = excluded' },
          { key: 'minYearBuilt', label: 'Min Year Built', defaultValue: false, description: 'Too old = excluded' },
          { key: 'maxYearBuilt', label: 'Max Year Built', defaultValue: false, description: 'Too new = excluded' },
          // Risk factors
          { key: 'allowHoa', label: 'HOA Restriction', defaultValue: false, description: 'Has HOA when not allowed = excluded' },
          { key: 'allowPool', label: 'Pool Restriction', defaultValue: false, description: 'Has pool when not allowed = excluded' },
          { key: 'allowSeptic', label: 'Septic Restriction', defaultValue: false, description: 'Has septic when not allowed = excluded' },
          { key: 'allowWell', label: 'Well Restriction', defaultValue: false, description: 'Has well when not allowed = excluded' },
          { key: 'allowFloodZone', label: 'Flood Zone Restriction', defaultValue: false, description: 'In flood zone when not allowed = excluded' },
          { key: 'allowStructuralIssues', label: 'Structural Issues', defaultValue: false, description: 'Has structural issues when not allowed = excluded' },
          { key: 'allowFoundationIssues', label: 'Foundation Issues', defaultValue: false, description: 'Has foundation issues when not allowed = excluded' },
          { key: 'allowFireDamage', label: 'Fire Damage', defaultValue: false, description: 'Has fire damage when not allowed = excluded' },
          // Occupancy
          { key: 'occupancyStatus', label: 'Occupancy Status', defaultValue: false, description: 'Wrong occupancy = excluded' },
        ],
        example: {
          state: true,        // Wrong state = excluded (recommended)
          maxPrice: true,     // Over budget = excluded (strict budget)
          propertyType: true, // Wrong type = excluded
          minBedrooms: false, // Too few bedrooms = reduced score only
          allowHoa: false,    // Has HOA when not allowed = reduced score only
        },
      },
    },
  });
});

export default router;
