/**
 * State Knowledge Base Model
 *
 * Stores reference information, documents, legal requirements, and
 * forms for each state. Used by AI agent during compliance checks
 * and deal analysis.
 */

import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export type KnowledgeType =
  | 'law'                  // State statutes and laws (e.g., Texas Property Code)
  | 'regulation'           // Administrative rules and regulations
  | 'legal_requirement'    // Practical legal requirements
  | 'form'                 // Required forms (disclosure, contract addendums)
  | 'license_info'         // Licensing requirements
  | 'fee_structure'        // Recording fees, transfer taxes
  | 'timeline'             // Required timelines (inspection periods, etc.)
  | 'disclosure'           // Disclosure requirements
  | 'restriction'          // What's NOT allowed in this state
  | 'penalty'              // Penalties for violations
  | 'case_law'             // Relevant court cases
  | 'best_practice'        // Recommended practices
  | 'contact'              // State board contacts
  | 'link'                 // External resource links
  | 'note';                // General notes

export interface StateKnowledgeAttributes {
  id?: number;
  state: string;                    // State code (e.g., 'TX', 'CA')
  type: KnowledgeType;
  title: string;
  content: string;                  // Main content (markdown supported)
  summary?: string;                 // Short summary for quick reference
  category?: string;                // Category for organization
  tags?: string[];                  // Searchable tags
  sourceUrl?: string;               // Link to official source
  sourceName?: string;              // Name of source (e.g., "Texas Real Estate Commission")
  effectiveDate?: Date;             // When this became effective
  expirationDate?: Date;            // When this expires (if applicable)
  priority: number;                 // Higher = more important
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

class StateKnowledge extends Model<StateKnowledgeAttributes> implements StateKnowledgeAttributes {
  public id!: number;
  public state!: string;
  public type!: KnowledgeType;
  public title!: string;
  public content!: string;
  public summary?: string;
  public category?: string;
  public tags?: string[];
  public sourceUrl?: string;
  public sourceName?: string;
  public effectiveDate?: Date;
  public expirationDate?: Date;
  public priority!: number;
  public enabled!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Get all knowledge for a state
   */
  static async getForState(state: string): Promise<StateKnowledge[]> {
    return this.findAll({
      where: {
        state: [state.toUpperCase(), 'ALL'],
        enabled: true,
      },
      order: [['priority', 'DESC'], ['type', 'ASC']],
    });
  }

  /**
   * Get knowledge by type for a state
   */
  static async getByType(state: string, type: KnowledgeType): Promise<StateKnowledge[]> {
    return this.findAll({
      where: {
        state: [state.toUpperCase(), 'ALL'],
        type,
        enabled: true,
      },
      order: [['priority', 'DESC']],
    });
  }

  /**
   * Search knowledge base
   */
  static async search(query: string, state?: string): Promise<StateKnowledge[]> {
    const { Op } = require('sequelize');

    const where: any = {
      enabled: true,
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { content: { [Op.iLike]: `%${query}%` } },
        { summary: { [Op.iLike]: `%${query}%` } },
        { tags: { [Op.contains]: [query.toLowerCase()] } },
      ],
    };

    if (state) {
      where.state = [state.toUpperCase(), 'ALL'];
    }

    return this.findAll({
      where,
      order: [['priority', 'DESC']],
      limit: 50,
    });
  }

  /**
   * Get knowledge as context for AI agent
   */
  static async getContextForState(state: string): Promise<string> {
    const knowledge = await this.getForState(state);

    if (knowledge.length === 0) {
      return `No specific knowledge base entries for ${state}.`;
    }

    const sections: string[] = [
      `## ${state} State Compliance Knowledge Base\n`,
    ];

    // Group by type
    const byType: Record<string, StateKnowledge[]> = {};
    for (const k of knowledge) {
      if (!byType[k.type]) byType[k.type] = [];
      byType[k.type].push(k);
    }

    const typeLabels: Record<string, string> = {
      law: 'State Laws & Statutes',
      regulation: 'Regulations & Rules',
      legal_requirement: 'Legal Requirements',
      form: 'Required Forms',
      license_info: 'Licensing Information',
      fee_structure: 'Fees & Costs',
      timeline: 'Required Timelines',
      disclosure: 'Disclosure Requirements',
      restriction: 'Restrictions & Prohibitions',
      penalty: 'Penalties & Enforcement',
      case_law: 'Relevant Case Law',
      best_practice: 'Best Practices',
      contact: 'Important Contacts',
      link: 'Resources',
      note: 'Notes',
    };

    for (const [type, items] of Object.entries(byType)) {
      sections.push(`\n### ${typeLabels[type] || type}\n`);
      for (const item of items) {
        sections.push(`**${item.title}**`);
        if (item.summary) {
          sections.push(item.summary);
        } else {
          // Truncate content for context
          sections.push(item.content.substring(0, 500) + (item.content.length > 500 ? '...' : ''));
        }
        if (item.sourceUrl) {
          sections.push(`Source: ${item.sourceName || item.sourceUrl}`);
        }
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  /**
   * Seed default knowledge for common states
   */
  static async seedDefaultKnowledge(): Promise<void> {
    const existingCount = await this.count();
    if (existingCount > 0) {
      console.log(`📚 ${existingCount} knowledge entries already exist, skipping seed`);
      return;
    }

    const defaultKnowledge: Omit<StateKnowledgeAttributes, 'id' | 'createdAt' | 'updatedAt'>[] = [
      // ============== TEXAS ==============
      {
        state: 'TX',
        type: 'legal_requirement',
        title: 'Texas Wholesaling Requirements',
        content: `In Texas, wholesaling real estate is legal but requires careful compliance:

1. **License Requirement**: While not always required, having a license provides legal protection
2. **Equitable Interest**: Must have the property under contract before marketing
3. **Disclosure**: Must disclose your position as a wholesaler/assignor
4. **Marketing**: Can only market your "equitable interest," not the property itself
5. **Assignment Fee**: No cap on assignment fees, but must be disclosed

TREC (Texas Real Estate Commission) oversees all real estate transactions.`,
        summary: 'Texas allows wholesaling with proper contract and disclosure requirements',
        category: 'wholesaling',
        tags: ['wholesaling', 'license', 'disclosure', 'trec'],
        sourceName: 'Texas Real Estate Commission',
        sourceUrl: 'https://www.trec.texas.gov/',
        priority: 100,
        enabled: true,
      },
      {
        state: 'TX',
        type: 'law',
        title: 'Texas Occupations Code Chapter 1101',
        content: `**Texas Occupations Code, Chapter 1101 - Real Estate Brokers and Sales Agents**

Key sections for wholesaling:

**§1101.002 - Definitions**
- "Real estate broker" means a person who, for another person and for a fee, commission, or other valuable consideration, lists or offers to list, sells, or offers to sell real property.

**§1101.351 - License Required**
A person may not act as a broker or sales agent unless the person holds a license.

**§1101.352 - Exemptions**
License not required for:
- Owner selling their own property
- Attorney acting within scope of practice
- Person acting under court order

**§1101.652 - Grounds for Revocation**
Acting as broker without license is grounds for penalty up to $4,000 per violation.

**Wholesaling Interpretation:**
TREC has indicated that merely assigning a contract (selling your equitable interest) may not require a license, but marketing a property you don't own likely does.`,
        summary: 'Chapter 1101 governs who needs a real estate license in Texas',
        category: 'statute',
        tags: ['law', 'license', 'occupations code', 'chapter 1101'],
        sourceName: 'Texas Legislature',
        sourceUrl: 'https://statutes.capitol.texas.gov/Docs/OC/htm/OC.1101.htm',
        priority: 98,
        enabled: true,
      },
      {
        state: 'TX',
        type: 'law',
        title: 'Texas Property Code Chapter 5 - Conveyances',
        content: `**Texas Property Code, Chapter 5 - Conveyances**

**§5.008 - Seller's Disclosure of Property Condition**
Seller must provide written notice to purchaser disclosing known material defects.

**§5.008(b) - Required Disclosures:**
- Condition of structural components
- Defects in walls, roof, foundation
- Hazardous conditions
- Termite damage
- Previous flooding
- Lawsuits affecting property

**§5.008(e) - Exemptions:**
- Foreclosure sales
- Sale by fiduciary (estate)
- Court-ordered sales
- First sale of residential property

**§5.069 - Executory Contracts**
Special rules for seller-financed transactions, requires specific disclosures.`,
        summary: 'Chapter 5 governs property conveyances and seller disclosures',
        category: 'statute',
        tags: ['law', 'property code', 'disclosure', 'conveyance'],
        sourceName: 'Texas Legislature',
        sourceUrl: 'https://statutes.capitol.texas.gov/Docs/PR/htm/PR.5.htm',
        priority: 95,
        enabled: true,
      },
      {
        state: 'TX',
        type: 'penalty',
        title: 'Texas Penalties for Unlicensed Activity',
        content: `**Penalties for Acting Without License:**

**Administrative Penalties (TREC):**
- Up to $4,000 per transaction
- Cease and desist orders
- Injunctive relief

**Criminal Penalties:**
- Class A misdemeanor
- Fine up to $4,000
- Jail up to 1 year
- Each transaction is separate offense

**Civil Liability:**
- Contract may be voidable
- Loss of commissions/fees
- Liable for damages

**Recent Enforcement:**
TREC has increased focus on unlicensed wholesaling activity, particularly marketing properties without equitable interest.`,
        summary: 'Up to $4,000 per violation plus possible criminal charges',
        category: 'enforcement',
        tags: ['penalty', 'enforcement', 'unlicensed'],
        priority: 92,
        enabled: true,
      },
      {
        state: 'TX',
        type: 'form',
        title: 'Texas Seller Disclosure Notice',
        content: `Required form: Seller's Disclosure of Property Condition (TAR 1406)

Seller must disclose known material defects including:
- Foundation issues
- Roof condition
- Plumbing/electrical problems
- Flood history
- HOA information
- Environmental hazards

Exemptions exist for foreclosures, estate sales, and new construction.`,
        summary: 'TAR 1406 form required for seller disclosure',
        category: 'disclosure',
        tags: ['disclosure', 'form', 'seller'],
        priority: 90,
        enabled: true,
      },
      {
        state: 'TX',
        type: 'fee_structure',
        title: 'Texas Closing Costs & Fees',
        content: `Typical closing costs in Texas:

- **Title Insurance**: ~0.5-1% of purchase price
- **Recording Fees**: $25-50 per document
- **Survey**: $350-500
- **Escrow Fees**: $300-500
- **Attorney Fees**: Optional, $500-1500

Texas has NO state income tax and NO transfer tax (unlike many other states).`,
        summary: 'No transfer tax in Texas; title insurance typically 0.5-1%',
        category: 'fees',
        tags: ['closing costs', 'fees', 'title'],
        priority: 80,
        enabled: true,
      },
      {
        state: 'TX',
        type: 'timeline',
        title: 'Texas Contract Timelines',
        content: `Standard TREC contract timelines:

- **Option Period**: Negotiable (typically 7-10 days)
- **Title Commitment**: Within 20 days
- **Survey**: Before closing
- **Financing Contingency**: Per contract terms
- **Closing**: Per contract, typically 30-45 days

Option money is non-refundable but earnest money is refundable if contingencies not met.`,
        summary: 'Typical option period 7-10 days, closing 30-45 days',
        category: 'timeline',
        tags: ['option period', 'closing', 'timeline'],
        priority: 85,
        enabled: true,
      },

      // ============== CALIFORNIA ==============
      {
        state: 'CA',
        type: 'legal_requirement',
        title: 'California Wholesaling Requirements',
        content: `California has strict wholesaling regulations:

1. **License Required**: DRE license required if marketing properties you don't own
2. **Disclosure**: Must disclose role in transaction
3. **Marketing Restrictions**: Cannot market property without license
4. **Assignment**: Assignment must be disclosed to all parties
5. **Penalties**: Unlicensed activity can result in fines up to $20,000

The California Department of Real Estate (DRE) actively enforces these rules.`,
        summary: 'California requires DRE license for most wholesaling activities',
        category: 'wholesaling',
        tags: ['wholesaling', 'license', 'dre'],
        sourceName: 'California DRE',
        sourceUrl: 'https://www.dre.ca.gov/',
        priority: 100,
        enabled: true,
      },
      {
        state: 'CA',
        type: 'disclosure',
        title: 'California TDS Requirements',
        content: `Transfer Disclosure Statement (TDS) is mandatory in California:

**Required Disclosures:**
- All known material facts
- Property condition
- Neighborhood nuisances
- Deaths on property (within 3 years)
- Natural hazards (NHD required)
- Megan's Law database notice

**Exemptions:**
- Foreclosures
- Court-ordered sales
- Transfers between spouses`,
        summary: 'TDS required for most residential sales with specific exemptions',
        category: 'disclosure',
        tags: ['tds', 'disclosure', 'natural hazards'],
        priority: 95,
        enabled: true,
      },
      {
        state: 'CA',
        type: 'fee_structure',
        title: 'California Transfer Taxes',
        content: `California has multiple transfer taxes:

- **County Transfer Tax**: $1.10 per $1,000 (most counties)
- **City Transfer Tax**: Varies by city
  - Los Angeles: $4.50 per $1,000
  - San Francisco: $5.00-$6.00 per $1,000
  - Oakland: Tiered, up to $15 per $1,000

Some cities have "mansion taxes" on high-value properties.`,
        summary: 'County tax $1.10/$1000 plus city taxes vary significantly',
        category: 'fees',
        tags: ['transfer tax', 'closing costs'],
        priority: 85,
        enabled: true,
      },

      // ============== FLORIDA ==============
      {
        state: 'FL',
        type: 'legal_requirement',
        title: 'Florida Wholesaling Requirements',
        content: `Florida is considered wholesaler-friendly:

1. **No License Required**: For assigning contracts (not acting as agent)
2. **Equitable Interest**: Must have property under contract
3. **Disclosure**: Should disclose wholesaler status
4. **Assignment Clause**: Contract must allow assignment
5. **Marketing**: Market the contract, not the property

The Florida DBPR oversees real estate licensing.`,
        summary: 'Florida allows wholesaling without license when properly structured',
        category: 'wholesaling',
        tags: ['wholesaling', 'assignment', 'license'],
        sourceName: 'Florida DBPR',
        sourceUrl: 'https://www.myfloridalicense.com/dbpr/',
        priority: 100,
        enabled: true,
      },
      {
        state: 'FL',
        type: 'disclosure',
        title: 'Florida Disclosure Requirements',
        content: `Florida seller disclosures:

**Required:**
- Coastal Construction Control Line
- Lead-based paint (pre-1978)
- HOA disclosure (within 3 days)
- Radon gas notice
- Energy efficiency rating

**Not Required:**
- General property condition disclosure (unlike most states)
- Stigmatized property disclosure

Florida follows "caveat emptor" (buyer beware) for many property conditions.`,
        summary: 'Florida has limited seller disclosure requirements - caveat emptor applies',
        category: 'disclosure',
        tags: ['disclosure', 'hoa', 'caveat emptor'],
        priority: 90,
        enabled: true,
      },
      {
        state: 'FL',
        type: 'fee_structure',
        title: 'Florida Documentary Stamp Tax',
        content: `Florida transfer taxes:

- **Documentary Stamp Tax**: $0.70 per $100 (statewide)
- **Miami-Dade County**: Additional $0.45 per $100 (single-family exempt)
- **Intangible Tax**: $0.002 per $1 on new mortgages

On a $300,000 sale:
- Doc stamps: ~$2,100
- Recording: ~$50-100`,
        summary: 'Doc stamp tax $0.70/$100 statewide, higher in Miami-Dade',
        category: 'fees',
        tags: ['doc stamps', 'transfer tax', 'closing costs'],
        priority: 85,
        enabled: true,
      },

      // ============== UNIVERSAL ==============
      {
        state: 'ALL',
        type: 'best_practice',
        title: 'Wholesaling Best Practices',
        content: `Universal best practices for wholesaling:

1. **Always use contracts** - Never verbal agreements
2. **Disclose your role** - Transparency protects you
3. **Build your buyers list** - Know your exit before you enter
4. **Verify title** - Run title search before marketing
5. **Use proper entity** - LLC provides liability protection
6. **Keep records** - Document everything
7. **Know your numbers** - ARV, repairs, and MAO
8. **Stay compliant** - Follow state-specific rules`,
        summary: 'Core wholesaling practices applicable in all states',
        category: 'general',
        tags: ['best practices', 'wholesaling'],
        priority: 100,
        enabled: true,
      },
      {
        state: 'ALL',
        type: 'legal_requirement',
        title: 'Federal Lead Paint Disclosure',
        content: `Federal law requires lead-based paint disclosure for all properties built before 1978:

**Requirements:**
1. Provide EPA-approved pamphlet
2. Disclose known lead-based paint
3. Provide any available records
4. Allow 10-day inspection period (can be waived)
5. Include specific disclosure language in contract

**Penalties:**
- Up to $16,000 per violation
- Triple damages in lawsuits`,
        summary: 'Lead paint disclosure required for pre-1978 properties nationwide',
        category: 'disclosure',
        tags: ['lead paint', 'federal', 'disclosure'],
        sourceName: 'EPA',
        sourceUrl: 'https://www.epa.gov/lead',
        priority: 95,
        enabled: true,
      },
    ];

    await this.bulkCreate(defaultKnowledge as any);
    console.log(`📚 Seeded ${defaultKnowledge.length} default knowledge entries`);
  }
}

// Initialize the model
StateKnowledge.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      state: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM(
          'law',
          'regulation',
          'legal_requirement',
          'form',
          'license_info',
          'fee_structure',
          'timeline',
          'disclosure',
          'restriction',
          'penalty',
          'case_law',
          'best_practice',
          'contact',
          'link',
          'note'
        ),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
      },
      sourceUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sourceName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      effectiveDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expirationDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      tableName: 'state_knowledge',
      timestamps: true,
      indexes: [
        { fields: ['state'] },
        { fields: ['state', 'type'] },
        { fields: ['state', 'enabled'] },
        { fields: ['tags'], using: 'gin' },
      ],
    }
  );

export default StateKnowledge;
