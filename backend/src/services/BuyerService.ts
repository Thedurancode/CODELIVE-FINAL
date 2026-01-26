/**
 * Buyer Service
 *
 * Handles CRUD operations for buyers, CSV import, and property matching
 */

import { Op } from 'sequelize';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import Buyer from '../models/Buyer';
import BuyerContact from '../models/BuyerContact';
import Property from '../models/Property';
import type { BuyerStatus } from '../models/Buyer';
import type { PhoneEntry } from '../models/BuyerContact';
import { activityFeedService } from './ActivityFeedService';

interface BuyerFilters {
  page?: number;
  limit?: number;
  search?: string;
  county?: string;
  state?: string;
  zip?: string;
  status?: BuyerStatus;
  hotOnly?: boolean;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

interface CreateBuyerData {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  buyingCounties?: string[];
  buyingState?: string;
  purchases6Month?: number;
  status?: BuyerStatus;
  notes?: string;
  tags?: string[];
}

interface UpdateBuyerData {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  buyingCounties?: string[];
  buyingState?: string;
  purchases6Month?: number;
  status?: BuyerStatus;
  notes?: string;
  tags?: string[];
}

interface MatchedBuyer {
  buyer: Buyer;
  contacts: BuyerContact[];
  matchType: 'zipcode' | 'county';
  isHotPotential: boolean;
  priority: number;
}

// CSV Row interface matching the NJ Buyers List structure
interface CSVBuyerRow {
  Fips: string;
  'County Name': string;
  'State Name': string;
  BuyerName: string;
  BuyerAddress: string;
  BuyerCity: string;
  BuyerState: string;
  BuyerZip: string;
  BuyerPurchases6MSum: string;
  // Person 1-5 fields dynamically accessed
  [key: string]: string;
}

class BuyerService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('✅ BuyerService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get all buyers with filtering and pagination
   */
  async getBuyers(filters: BuyerFilters = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      county,
      state,
      zip,
      status,
      hotOnly,
      sortBy = 'purchases6Month',
      sortOrder = 'DESC',
    } = filters;

    const offset = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (county) {
      // Search in buyingCounties array
      where.buyingCounties = { [Op.contains]: [county] };
    }

    if (state) {
      where.buyingState = state.toUpperCase();
    }

    if (zip) {
      where.zip = zip;
    }

    if (status) {
      where.status = status;
    }

    if (hotOnly) {
      where.purchases6Month = { [Op.gt]: 10 };
    }

    if (search) {
      where[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { zip: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Buyer.findAndCountAll({
      where,
      include: [
        {
          model: BuyerContact,
          as: 'contacts',
          required: false,
        },
      ],
      order: [[sortBy, sortOrder]],
      limit,
      offset,
      distinct: true,
    });

    // Add isHotPotential to each buyer
    const buyersWithHot = rows.map((buyer) => ({
      ...buyer.toJSON(),
      isHotPotential: buyer.purchases6Month > 10,
    }));

    return {
      data: buyersWithHot,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get a single buyer by ID with contacts
   */
  async getBuyer(id: string): Promise<Buyer | null> {
    return await Buyer.findByPk(id, {
      include: [
        {
          model: BuyerContact,
          as: 'contacts',
          order: [['personIndex', 'ASC']],
        },
      ],
    });
  }

  /**
   * Create a new buyer
   */
  async createBuyer(data: CreateBuyerData, userId?: string, userName?: string): Promise<Buyer> {
    const buyer = await Buyer.create({
      name: data.name,
      address: data.address || null,
      city: data.city || null,
      state: data.state?.toUpperCase() || null,
      zip: data.zip || null,
      buyingCounties: data.buyingCounties || [],
      buyingState: data.buyingState?.toUpperCase() || 'NJ',
      purchases6Month: data.purchases6Month || 0,
      status: data.status || 'active',
      notes: data.notes || null,
      tags: data.tags || [],
    });

    // Log activity feed event
    activityFeedService.logBuyerActivity(
      'buyer_created',
      buyer.id,
      buyer.name,
      {
        id: userId || 'system',
        name: userName || 'System',
        type: 'user',
      },
      {
        buyingState: buyer.buyingState,
        buyingCounties: buyer.buyingCounties,
        status: buyer.status,
      }
    ).catch(err => console.warn('Activity logging failed:', err.message));

    return buyer;
  }

  /**
   * Update an existing buyer
   */
  async updateBuyer(id: string, data: UpdateBuyerData, userId?: string, userName?: string): Promise<Buyer | null> {
    const buyer = await Buyer.findByPk(id);
    if (!buyer) {
      return null;
    }

    await buyer.update(data);

    // Log activity feed event
    activityFeedService.logBuyerActivity(
      'buyer_updated',
      buyer.id,
      buyer.name,
      {
        id: userId || 'system',
        name: userName || 'System',
        type: 'user',
      },
      {
        updatedFields: Object.keys(data),
        buyingState: buyer.buyingState,
        status: buyer.status,
      }
    ).catch(err => console.warn('Activity logging failed:', err.message));

    return buyer;
  }

  /**
   * Delete a buyer
   */
  async deleteBuyer(id: string): Promise<boolean> {
    const deleted = await Buyer.destroy({ where: { id } });
    return deleted > 0;
  }

  /**
   * Match buyers to a property by county (buyers who buy in that county)
   * Returns sorted list with hot potential buyers first
   */
  async matchBuyersToProperty(propertyId: number): Promise<MatchedBuyer[]> {
    const property = await Property.findByPk(propertyId);
    if (!property) {
      throw new Error('Property not found');
    }

    const propertyCounty = property.county;
    const propertyState = property.state;

    if (!propertyCounty) {
      return [];
    }

    // Find buyers who buy in this county
    const buyers = await Buyer.findAll({
      where: {
        buyingState: propertyState,
        status: 'active',
        buyingCounties: { [Op.contains]: [propertyCounty] },
      },
      include: [
        {
          model: BuyerContact,
          as: 'contacts',
        },
      ],
      order: [['purchases6Month', 'DESC']],
    });

    // Build matched buyers with priority scoring
    const matchedBuyers: MatchedBuyer[] = buyers.map((buyer) => {
      const isHotPotential = buyer.purchases6Month > 10;

      // Priority: Hot = 2, Regular = 1
      const priority = isHotPotential ? 2 : 1;

      return {
        buyer,
        contacts: (buyer as any).contacts || [],
        matchType: 'county' as const,
        isHotPotential,
        priority,
      };
    });

    // Sort by priority (descending), then by purchases (descending)
    matchedBuyers.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.buyer.purchases6Month - a.buyer.purchases6Month;
    });

    return matchedBuyers;
  }

  /**
   * Get buyer statistics
   */
  async getBuyerStats() {
    const total = await Buyer.count();
    const hotBuyers = await Buyer.count({
      where: { purchases6Month: { [Op.gt]: 10 } },
    });

    // Get all unique counties across all buyers
    const buyers = await Buyer.findAll({
      attributes: ['buyingCounties'],
      raw: true,
    });

    const allCounties = new Set<string>();
    buyers.forEach((b: any) => {
      if (b.buyingCounties && Array.isArray(b.buyingCounties)) {
        b.buyingCounties.forEach((c: string) => allCounties.add(c));
      }
    });

    return {
      total,
      hotBuyers,
      regularBuyers: total - hotBuyers,
      countiesCovered: allCounties.size,
      topCounties: Array.from(allCounties).slice(0, 10),
    };
  }

  /**
   * Import buyers from CSV content or file path
   * Deduplicates buyers by name+address and aggregates counties
   */
  async importFromCSV(input: string, isContent: boolean = false): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    // Get CSV content - either from the input directly or by reading a file
    let fileContent: string;
    if (isContent) {
      fileContent = input;
    } else {
      const absolutePath = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
      fileContent = fs.readFileSync(absolutePath, 'utf-8');
    }

    const records: CSVBuyerRow[] = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`📥 Processing ${records.length} CSV rows...`);

    // Step 1: Group by buyer (name + address = unique buyer)
    const buyerMap = new Map<string, {
      name: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      buyingState: string;
      counties: Set<string>;
      purchases6Month: number;
      contacts: Map<string, {
        personIndex: number;
        firstName: string | null;
        lastName: string | null;
        phones: PhoneEntry[];
        emails: string[];
      }>;
    }>();

    for (const row of records) {
      const buyerName = row.BuyerName?.trim() || '';
      const buyerAddress = row.BuyerAddress?.trim() || '';

      if (!buyerName) continue;

      // Unique key: name + address
      const key = `${buyerName}|||${buyerAddress}`;
      const countyName = row['County Name']?.trim();
      const buyingState = row['State Name']?.trim() || 'NJ';

      if (!buyerMap.has(key)) {
        buyerMap.set(key, {
          name: buyerName,
          address: buyerAddress || null,
          city: row.BuyerCity?.trim() || null,
          state: row.BuyerState?.trim() || null,
          zip: row.BuyerZip?.trim() || null,
          buyingState,
          counties: new Set(),
          purchases6Month: parseInt(row.BuyerPurchases6MSum) || 0,
          contacts: new Map(),
        });
      }

      const buyerData = buyerMap.get(key)!;

      // Add county to set (automatically deduplicates)
      if (countyName) {
        buyerData.counties.add(countyName);
      }

      // Aggregate contacts (dedupe by name)
      for (let personNum = 1; personNum <= 5; personNum++) {
        const firstName = row[`Person ${personNum} First Name`]?.trim();
        const lastName = row[`Person ${personNum} Last Name`]?.trim();

        if (!firstName && !lastName) continue;

        const contactKey = `${firstName || ''}|||${lastName || ''}`;

        if (!buyerData.contacts.has(contactKey)) {
          // Collect phones
          const phones: PhoneEntry[] = [];
          for (let phoneNum = 1; phoneNum <= 5; phoneNum++) {
            const phoneNumber = row[`Person ${personNum} Phone ${phoneNum}`]?.trim();
            if (phoneNumber) {
              phones.push({
                number: phoneNumber,
                type: row[`Person ${personNum} Phone ${phoneNum} Type`]?.trim() || null,
                lastReported: row[`Person ${personNum} Phone ${phoneNum} Last Reported`]?.trim() || null,
              });
            }
          }

          // Collect emails
          const emails: string[] = [];
          for (let emailNum = 1; emailNum <= 5; emailNum++) {
            const email = row[`Person ${personNum} Email ${emailNum}`]?.trim();
            if (email) {
              emails.push(email);
            }
          }

          buyerData.contacts.set(contactKey, {
            personIndex: buyerData.contacts.size + 1,
            firstName: firstName || null,
            lastName: lastName || null,
            phones,
            emails,
          });
        }
      }
    }

    console.log(`📊 Found ${buyerMap.size} unique buyers from ${records.length} rows`);

    // Step 2: Create deduplicated buyers
    let index = 0;
    for (const [, buyerData] of buyerMap) {
      try {
        // Create buyer with aggregated counties
        const buyer = await Buyer.create({
          name: buyerData.name,
          address: buyerData.address,
          city: buyerData.city,
          state: buyerData.state,
          zip: buyerData.zip,
          buyingCounties: Array.from(buyerData.counties),
          buyingState: buyerData.buyingState,
          purchases6Month: buyerData.purchases6Month,
          status: 'active',
          tags: [],
        });

        // Create contacts
        let contactIndex = 1;
        for (const [, contactData] of buyerData.contacts) {
          await BuyerContact.create({
            buyerId: buyer.id,
            personIndex: contactIndex,
            firstName: contactData.firstName,
            lastName: contactData.lastName,
            phones: contactData.phones,
            emails: contactData.emails,
            isPrimary: contactIndex === 1,
          });
          contactIndex++;
        }

        imported++;
        index++;

        // Log progress every 100 buyers
        if (imported % 100 === 0) {
          console.log(`   Imported ${imported}/${buyerMap.size} buyers...`);
        }
      } catch (error) {
        errors.push(`Buyer "${buyerData.name}": ${(error as Error).message}`);
      }
    }

    console.log(`✅ Import complete: ${imported} unique buyers imported, ${errors.length} errors`);

    return { imported, errors };
  }

  /**
   * Search buyers by query
   */
  async searchBuyers(query: string, limit: number = 10) {
    return await Buyer.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: `%${query}%` } },
          { buyingState: { [Op.iLike]: `%${query}%` } },
          { city: { [Op.iLike]: `%${query}%` } },
          { zip: { [Op.iLike]: `%${query}%` } },
        ],
      },
      include: [
        {
          model: BuyerContact,
          as: 'contacts',
          required: false,
        },
      ],
      limit,
      order: [['purchases6Month', 'DESC']],
    });
  }

  /**
   * Get buyers by county (buyers who buy in that county)
   */
  async getBuyersByCounty(county: string, state: string) {
    return await Buyer.findAll({
      where: {
        buyingCounties: { [Op.contains]: [county] },
        buyingState: state.toUpperCase(),
        status: 'active',
      },
      include: [
        {
          model: BuyerContact,
          as: 'contacts',
        },
      ],
      order: [['purchases6Month', 'DESC']],
    });
  }

  /**
   * Get buyers by mailing zipcode
   */
  async getBuyersByZip(zip: string) {
    return await Buyer.findAll({
      where: {
        zip,
        status: 'active',
      },
      include: [
        {
          model: BuyerContact,
          as: 'contacts',
        },
      ],
      order: [['purchases6Month', 'DESC']],
    });
  }

  /**
   * Get hot potential buyers (>10 purchases in 6 months)
   */
  async getHotBuyers(state?: string) {
    const where: Record<string, unknown> = {
      purchases6Month: { [Op.gt]: 10 },
      status: 'active',
    };

    if (state) {
      where.buyingState = state.toUpperCase();
    }

    return await Buyer.findAll({
      where,
      include: [
        {
          model: BuyerContact,
          as: 'contacts',
        },
      ],
      order: [['purchases6Month', 'DESC']],
    });
  }
}

export const buyerService = new BuyerService();
export default buyerService;
