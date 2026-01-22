/**
 * State Compliance Rule Model
 *
 * Stores state-specific compliance requirements for real estate transactions.
 * Each state can have multiple rules with different fields, conditions, and severities.
 */

import { Model, DataTypes, Op } from 'sequelize';
import sequelize from '../config/database';

export type ComplianceSeverity = 'critical' | 'warning' | 'info';
export type ComplianceOperator =
  | 'required'           // Field must exist and be non-empty
  | 'equals'             // Field must equal value
  | 'not_equals'         // Field must not equal value
  | 'contains'           // Field must contain value (string)
  | 'min_value'          // Field must be >= value (number)
  | 'max_value'          // Field must be <= value (number)
  | 'min_days_until'     // Date field must be at least X days in future
  | 'max_days_until'     // Date field must be at most X days in future
  | 'regex'              // Field must match regex pattern
  | 'in_list'            // Field must be one of values (comma-separated)
  | 'not_in_list'        // Field must not be one of values
  | 'is_true'            // Boolean field must be true
  | 'is_false';          // Boolean field must be false

export type EvidenceRequirement =
  | {
      type: 'document';
      documentType: string;
      status?: string;
    }
  | {
      type: 'contact';
      role: string;
      field?: string;
    };

export type SeverityOverride = {
  when?: {
    transactionType?: string | string[];
    dealStage?: string | string[];
    brokerStatus?: string | string[];
    priorViolations?: number | { min?: number; max?: number };
  };
  severity: ComplianceSeverity;
};

export interface ComplianceRuleAttributes {
  id?: number;
  state: string;                    // State code (e.g., 'TX', 'CA', 'FL')
  name: string;                     // Human-readable rule name
  description?: string;             // Detailed description
  category: string;                 // Category (contract, disclosure, licensing, etc.)
  field: string;                    // Property field to check (supports dot notation)
  operator: ComplianceOperator;     // How to evaluate
  value?: string;                   // Value to compare against (if applicable)
  severity: ComplianceSeverity;     // critical = Red, warning = Yellow, info = Green
  message: string;                  // Message to display when rule fails
  enabled: boolean;                 // Whether rule is active
  order: number;                    // Order of evaluation
  evidenceRequirements?: EvidenceRequirement[]; // Optional evidence requirements
  evidenceSeverity?: ComplianceSeverity;        // Severity for missing evidence
  severityOverrides?: SeverityOverride[];       // Optional contextual severity overrides
  validFrom?: Date;                              // Rule validity start
  validTo?: Date;                                // Rule validity end
  county?: string;                               // Optional county overlay
  createdAt?: Date;
  updatedAt?: Date;
}

class StateComplianceRule extends Model<ComplianceRuleAttributes> implements ComplianceRuleAttributes {
  declare id: number;
  declare state: string;
  declare name: string;
  declare description?: string;
  declare category: string;
  declare field: string;
  declare operator: ComplianceOperator;
  declare value?: string;
  declare severity: ComplianceSeverity;
  declare message: string;
  declare enabled: boolean;
  declare order: number;
  declare evidenceRequirements?: EvidenceRequirement[];
  declare evidenceSeverity?: ComplianceSeverity;
  declare severityOverrides?: SeverityOverride[];
  declare validFrom?: Date;
  declare validTo?: Date;
  declare county?: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * Get rules for a specific state (includes federal/universal rules)
   */
  static async getRulesForState(
    state: string,
    options: { asOf?: Date; county?: string } = {}
  ): Promise<StateComplianceRule[]> {
    const { asOf, county } = options;
    const upperState = state.toUpperCase();
    const where: any = {
      state: [upperState, 'ALL'], // State-specific + universal rules
      enabled: true,
    };

    if (asOf) {
      where[Op.and] = [
        {
          [Op.or]: [
            { validFrom: { [Op.is]: null } },
            { validFrom: { [Op.lte]: asOf } },
          ],
        },
        {
          [Op.or]: [
            { validTo: { [Op.is]: null } },
            { validTo: { [Op.gte]: asOf } },
          ],
        },
      ];
    }

    if (county) {
      const countyValue = county.trim();
      where[Op.and] = [
        ...(where[Op.and] || []),
        {
          [Op.or]: [
            { county: { [Op.is]: null } },
            { county: { [Op.iLike]: countyValue } },
          ],
        },
      ];
    }

    return this.findAll({
      where,
      order: [
        ['state', 'DESC'], // State-specific rules first, then ALL
        ['order', 'ASC'],
      ],
    });
  }

  /**
   * Get all unique states with rules
   */
  static async getStatesWithRules(): Promise<string[]> {
    const results = await this.findAll({
      attributes: ['state'],
      group: ['state'],
      where: { enabled: true },
    });
    return results.map(r => r.state).filter(s => s !== 'ALL');
  }

  /**
   * Seed default rules for common states
   */
  static async seedDefaultRules(): Promise<void> {
    const existingCount = await this.count();
    if (existingCount > 0) {
      console.log(`📋 ${existingCount} compliance rules already exist, skipping seed`);
      return;
    }

    const defaultRules: Omit<ComplianceRuleAttributes, 'id' | 'createdAt' | 'updatedAt'>[] = [
      // ============== UNIVERSAL RULES (ALL STATES) ==============
      {
        state: 'ALL',
        name: 'Wholesaler LLC Required',
        category: 'contract',
        field: 'wholesalerLlcName',
        operator: 'required',
        severity: 'warning',
        message: 'Missing wholesaler LLC name',
        enabled: true,
        order: 1,
      },
      {
        state: 'ALL',
        name: 'LLC Owner Email Required',
        category: 'contract',
        field: 'llcOwnerEmail',
        operator: 'required',
        severity: 'warning',
        message: 'Missing LLC owner email for communication',
        enabled: true,
        order: 2,
      },
      {
        state: 'ALL',
        name: 'Contract Must Be Assignable',
        category: 'contract',
        field: 'assignable',
        operator: 'is_true',
        severity: 'critical',
        message: 'Contract is not marked as assignable - cannot wholesale',
        enabled: true,
        order: 3,
      },
      {
        state: 'ALL',
        name: 'Marketing Clause Verification',
        category: 'contract',
        field: 'marketingClauseFound',
        operator: 'is_true',
        severity: 'warning',
        message: 'Marketing clause not verified in contract',
        enabled: true,
        order: 4,
      },
      {
        state: 'ALL',
        name: 'Contract Expiration Warning (14 days)',
        category: 'contract',
        field: 'purchaseContractExpiration',
        operator: 'min_days_until',
        value: '14',
        severity: 'warning',
        message: 'Contract expires in less than 14 days',
        enabled: true,
        order: 5,
      },
      {
        state: 'ALL',
        name: 'Contract Expiration Critical (7 days)',
        category: 'contract',
        field: 'purchaseContractExpiration',
        operator: 'min_days_until',
        value: '7',
        severity: 'critical',
        message: 'Contract expires in less than 7 days - urgent action required',
        enabled: true,
        order: 6,
      },

      // ============== ALABAMA (AL) ==============
      {
        state: 'AL',
        name: 'Alabama Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Alabama Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'AL',
        name: 'Alabama Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Alabama requires disclosure of known material defects',
        enabled: true,
        order: 11,
      },

      // ============== ALASKA (AK) ==============
      {
        state: 'AK',
        name: 'Alaska Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Alaska Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'AK',
        name: 'Alaska Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Alaska Residential Real Property Transfer Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== ARIZONA (AZ) ==============
      {
        state: 'AZ',
        name: 'Arizona ADRE License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Arizona Department of Real Estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'AZ',
        name: 'Arizona SPDS Required',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Arizona Seller Property Disclosure Statement (SPDS) required',
        enabled: true,
        order: 11,
      },
      {
        state: 'AZ',
        name: 'Arizona Affidavit of Disclosure',
        category: 'disclosure',
        field: 'condition',
        operator: 'required',
        severity: 'warning',
        message: 'Arizona Affidavit of Disclosure required for unincorporated areas',
        enabled: true,
        order: 12,
      },

      // ============== ARKANSAS (AR) ==============
      {
        state: 'AR',
        name: 'Arkansas Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Arkansas Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'AR',
        name: 'Arkansas Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Arkansas Property Disclosure Form required',
        enabled: true,
        order: 11,
      },

      // ============== CALIFORNIA (CA) ==============
      {
        state: 'CA',
        name: 'California DRE License Required',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'California Department of Real Estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'CA',
        name: 'California Broker License',
        category: 'licensing',
        field: 'brokerLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'California requires supervising broker license number',
        enabled: true,
        order: 11,
      },
      {
        state: 'CA',
        name: 'California TDS Required',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'California Transfer Disclosure Statement (TDS) required',
        enabled: true,
        order: 12,
      },
      {
        state: 'CA',
        name: 'California Natural Hazard Disclosure',
        category: 'disclosure',
        field: 'condition',
        operator: 'required',
        severity: 'warning',
        message: 'California Natural Hazard Disclosure Statement required',
        enabled: true,
        order: 13,
      },

      // ============== COLORADO (CO) ==============
      {
        state: 'CO',
        name: 'Colorado Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Colorado Division of Real Estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'CO',
        name: 'Colorado Seller Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Colorado Seller Property Disclosure form required',
        enabled: true,
        order: 11,
      },
      {
        state: 'CO',
        name: 'Colorado Green Disclosures',
        category: 'disclosure',
        field: 'condition',
        operator: 'required',
        severity: 'info',
        message: 'Colorado requires disclosure of green/energy features if applicable',
        enabled: true,
        order: 12,
      },

      // ============== CONNECTICUT (CT) ==============
      {
        state: 'CT',
        name: 'Connecticut Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Connecticut Department of Consumer Protection license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'CT',
        name: 'Connecticut Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Connecticut Residential Property Condition Disclosure Report required',
        enabled: true,
        order: 11,
      },

      // ============== DELAWARE (DE) ==============
      {
        state: 'DE',
        name: 'Delaware Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Delaware Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'DE',
        name: 'Delaware Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Delaware Seller Disclosure of Real Property Condition required',
        enabled: true,
        order: 11,
      },

      // ============== FLORIDA (FL) ==============
      {
        state: 'FL',
        name: 'Florida Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Florida DBPR real estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'FL',
        name: 'Florida Assignment Disclosure',
        category: 'disclosure',
        field: 'assignable',
        operator: 'is_true',
        severity: 'critical',
        message: 'Florida requires clear assignment rights disclosure',
        enabled: true,
        order: 11,
      },
      {
        state: 'FL',
        name: 'Florida HOA Disclosure',
        category: 'disclosure',
        field: 'hoa',
        operator: 'required',
        severity: 'warning',
        message: 'Florida requires HOA status disclosure',
        enabled: true,
        order: 12,
      },
      {
        state: 'FL',
        name: 'Florida Radon Disclosure',
        category: 'disclosure',
        field: 'condition',
        operator: 'required',
        severity: 'warning',
        message: 'Florida requires radon gas disclosure',
        enabled: true,
        order: 13,
      },

      // ============== GEORGIA (GA) ==============
      {
        state: 'GA',
        name: 'Georgia GREC License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Georgia Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'GA',
        name: 'Georgia Broker Affiliation',
        category: 'licensing',
        field: 'brokerCompany',
        operator: 'required',
        severity: 'warning',
        message: 'Georgia requires broker affiliation disclosure',
        enabled: true,
        order: 11,
      },
      {
        state: 'GA',
        name: 'Georgia Seller Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Georgia Seller Property Disclosure Statement required',
        enabled: true,
        order: 12,
      },

      // ============== HAWAII (HI) ==============
      {
        state: 'HI',
        name: 'Hawaii Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Hawaii Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'HI',
        name: 'Hawaii Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Hawaii Seller Real Property Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== IDAHO (ID) ==============
      {
        state: 'ID',
        name: 'Idaho Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Idaho Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'ID',
        name: 'Idaho Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Idaho Seller Property Disclosure Form required',
        enabled: true,
        order: 11,
      },

      // ============== ILLINOIS (IL) ==============
      {
        state: 'IL',
        name: 'Illinois Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Illinois IDFPR real estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'IL',
        name: 'Illinois Residential Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Illinois Residential Real Property Disclosure Report required',
        enabled: true,
        order: 11,
      },
      {
        state: 'IL',
        name: 'Illinois Radon Disclosure',
        category: 'disclosure',
        field: 'condition',
        operator: 'required',
        severity: 'warning',
        message: 'Illinois Radon Disclosure required',
        enabled: true,
        order: 12,
      },

      // ============== INDIANA (IN) ==============
      {
        state: 'IN',
        name: 'Indiana Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Indiana Professional Licensing Agency license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'IN',
        name: 'Indiana Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Indiana Seller Residential Real Estate Sales Disclosure required',
        enabled: true,
        order: 11,
      },

      // ============== IOWA (IA) ==============
      {
        state: 'IA',
        name: 'Iowa Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Iowa Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'IA',
        name: 'Iowa Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Iowa Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== KANSAS (KS) ==============
      {
        state: 'KS',
        name: 'Kansas Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Kansas Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'KS',
        name: 'Kansas Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Kansas Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== KENTUCKY (KY) ==============
      {
        state: 'KY',
        name: 'Kentucky Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Kentucky Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'KY',
        name: 'Kentucky Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Kentucky Seller Disclosure of Property Condition required',
        enabled: true,
        order: 11,
      },

      // ============== LOUISIANA (LA) ==============
      {
        state: 'LA',
        name: 'Louisiana Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Louisiana Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'LA',
        name: 'Louisiana Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Louisiana Property Disclosure Document required',
        enabled: true,
        order: 11,
      },

      // ============== MAINE (ME) ==============
      {
        state: 'ME',
        name: 'Maine Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Maine Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'ME',
        name: 'Maine Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Maine Property Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== MARYLAND (MD) ==============
      {
        state: 'MD',
        name: 'Maryland Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Maryland Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'MD',
        name: 'Maryland Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Maryland Residential Property Disclosure and Disclaimer Statement required',
        enabled: true,
        order: 11,
      },

      // ============== MASSACHUSETTS (MA) ==============
      {
        state: 'MA',
        name: 'Massachusetts Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Massachusetts Board of Real Estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'MA',
        name: 'Massachusetts Lead Paint Disclosure',
        category: 'disclosure',
        field: 'condition',
        operator: 'required',
        severity: 'critical',
        message: 'Massachusetts Lead Paint Notification required for pre-1978 homes',
        enabled: true,
        order: 11,
      },

      // ============== MICHIGAN (MI) ==============
      {
        state: 'MI',
        name: 'Michigan Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Michigan LARA real estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'MI',
        name: 'Michigan Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Michigan Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== MINNESOTA (MN) ==============
      {
        state: 'MN',
        name: 'Minnesota Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Minnesota Department of Commerce license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'MN',
        name: 'Minnesota Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Minnesota Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== MISSISSIPPI (MS) ==============
      {
        state: 'MS',
        name: 'Mississippi Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Mississippi Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'MS',
        name: 'Mississippi Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Mississippi Property Condition Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== MISSOURI (MO) ==============
      {
        state: 'MO',
        name: 'Missouri Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Missouri Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'MO',
        name: 'Missouri Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Missouri Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== MONTANA (MT) ==============
      {
        state: 'MT',
        name: 'Montana Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Montana Board of Realty Regulation license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'MT',
        name: 'Montana Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Montana Seller Property Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== NEBRASKA (NE) ==============
      {
        state: 'NE',
        name: 'Nebraska Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Nebraska Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'NE',
        name: 'Nebraska Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Nebraska Seller Property Condition Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== NEVADA (NV) ==============
      {
        state: 'NV',
        name: 'Nevada Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Nevada Real Estate Division license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'NV',
        name: 'Nevada Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Nevada Seller Real Property Disclosure Form required',
        enabled: true,
        order: 11,
      },

      // ============== NEW HAMPSHIRE (NH) ==============
      {
        state: 'NH',
        name: 'New Hampshire Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'New Hampshire Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'NH',
        name: 'New Hampshire Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'New Hampshire Seller Disclosure Form required',
        enabled: true,
        order: 11,
      },

      // ============== NEW JERSEY (NJ) ==============
      {
        state: 'NJ',
        name: 'New Jersey Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'New Jersey Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'NJ',
        name: 'NJ Broker License Required',
        category: 'licensing',
        field: 'brokerLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'New Jersey requires supervising broker license number',
        enabled: true,
        order: 11,
      },
      {
        state: 'NJ',
        name: 'NJ Seller Disclosure Statement',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'New Jersey Seller Disclosure Statement recommended',
        enabled: true,
        order: 12,
      },
      {
        state: 'NJ',
        name: 'NJ Attorney Review Period',
        category: 'contract',
        field: 'condition',
        operator: 'required',
        severity: 'warning',
        message: 'New Jersey has 3-day attorney review period - ensure contract reflects this',
        enabled: true,
        order: 13,
      },
      {
        state: 'NJ',
        name: 'NJ Contract Assignability',
        category: 'contract',
        field: 'assignable',
        operator: 'is_true',
        severity: 'critical',
        message: 'Contract must explicitly allow assignment for NJ wholesale transactions',
        enabled: true,
        order: 14,
      },
      {
        state: 'NJ',
        name: 'NJ Flood Zone Disclosure',
        category: 'disclosure',
        field: 'floodZone',
        operator: 'required',
        severity: 'warning',
        message: 'New Jersey requires flood zone disclosure for properties in flood areas',
        enabled: true,
        order: 15,
      },

      // ============== NEW MEXICO (NM) ==============
      {
        state: 'NM',
        name: 'New Mexico Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'New Mexico Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'NM',
        name: 'New Mexico Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'New Mexico Seller Property Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== NEW YORK (NY) ==============
      {
        state: 'NY',
        name: 'New York DOS License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'New York Department of State real estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'NY',
        name: 'New York Property Condition Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'New York Property Condition Disclosure Statement required (or $500 credit)',
        enabled: true,
        order: 11,
      },
      {
        state: 'NY',
        name: 'New York Lead Paint Disclosure',
        category: 'disclosure',
        field: 'condition',
        operator: 'required',
        severity: 'warning',
        message: 'Lead paint disclosure required for pre-1978 properties',
        enabled: true,
        order: 12,
      },

      // ============== NORTH CAROLINA (NC) ==============
      {
        state: 'NC',
        name: 'North Carolina Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'North Carolina Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'NC',
        name: 'North Carolina Residential Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'North Carolina Residential Property and Owners Association Disclosure required',
        enabled: true,
        order: 11,
      },
      {
        state: 'NC',
        name: 'North Carolina Mineral Rights Disclosure',
        category: 'disclosure',
        field: 'condition',
        operator: 'required',
        severity: 'warning',
        message: 'North Carolina Mineral and Oil/Gas Rights Mandatory Disclosure required',
        enabled: true,
        order: 12,
      },

      // ============== NORTH DAKOTA (ND) ==============
      {
        state: 'ND',
        name: 'North Dakota Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'North Dakota Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'ND',
        name: 'North Dakota Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'North Dakota Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== OHIO (OH) ==============
      {
        state: 'OH',
        name: 'Ohio Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'warning',
        message: 'Ohio Division of Real Estate license recommended for wholesale transactions',
        enabled: true,
        order: 10,
      },
      {
        state: 'OH',
        name: 'Ohio Residential Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Ohio Residential Property Disclosure Form required',
        enabled: true,
        order: 11,
      },

      // ============== OKLAHOMA (OK) ==============
      {
        state: 'OK',
        name: 'Oklahoma Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Oklahoma Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'OK',
        name: 'Oklahoma Residential Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Oklahoma Residential Property Condition Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== OREGON (OR) ==============
      {
        state: 'OR',
        name: 'Oregon Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Oregon Real Estate Agency license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'OR',
        name: 'Oregon Seller Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Oregon Seller Property Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== PENNSYLVANIA (PA) ==============
      {
        state: 'PA',
        name: 'Pennsylvania Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Pennsylvania Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'PA',
        name: 'Pennsylvania Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Pennsylvania Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== RHODE ISLAND (RI) ==============
      {
        state: 'RI',
        name: 'Rhode Island Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Rhode Island Department of Business Regulation license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'RI',
        name: 'Rhode Island Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Rhode Island Seller Disclosure Form required',
        enabled: true,
        order: 11,
      },

      // ============== SOUTH CAROLINA (SC) ==============
      {
        state: 'SC',
        name: 'South Carolina Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'South Carolina Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'SC',
        name: 'South Carolina Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'South Carolina Residential Property Condition Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== SOUTH DAKOTA (SD) ==============
      {
        state: 'SD',
        name: 'South Dakota Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'South Dakota Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'SD',
        name: 'South Dakota Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'South Dakota Seller Property Condition Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== TENNESSEE (TN) ==============
      {
        state: 'TN',
        name: 'Tennessee Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Tennessee Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'TN',
        name: 'Tennessee Residential Property Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Tennessee Residential Property Condition Disclosure required',
        enabled: true,
        order: 11,
      },

      // ============== TEXAS (TX) ==============
      {
        state: 'TX',
        name: 'Texas TREC License Required',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Texas Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'TX',
        name: 'Texas Broker on File',
        category: 'licensing',
        field: 'brokerOnFile',
        operator: 'is_true',
        severity: 'critical',
        message: 'Texas requires broker to be on file for wholesale transactions',
        enabled: true,
        order: 11,
      },
      {
        state: 'TX',
        name: 'Texas Seller Disclosure Notice',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Texas Seller Disclosure Notice required',
        enabled: true,
        order: 12,
      },

      // ============== UTAH (UT) ==============
      {
        state: 'UT',
        name: 'Utah Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Utah Division of Real Estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'UT',
        name: 'Utah Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Utah Seller Property Condition Disclosure required',
        enabled: true,
        order: 11,
      },

      // ============== VERMONT (VT) ==============
      {
        state: 'VT',
        name: 'Vermont Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Vermont Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'VT',
        name: 'Vermont Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Vermont Seller Property Information Report required',
        enabled: true,
        order: 11,
      },

      // ============== VIRGINIA (VA) ==============
      {
        state: 'VA',
        name: 'Virginia Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Virginia Real Estate Board license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'VA',
        name: 'Virginia Residential Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Virginia Residential Property Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== WASHINGTON (WA) ==============
      {
        state: 'WA',
        name: 'Washington Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Washington Department of Licensing real estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'WA',
        name: 'Washington Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Washington Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== WEST VIRGINIA (WV) ==============
      {
        state: 'WV',
        name: 'West Virginia Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'West Virginia Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'WV',
        name: 'West Virginia Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'West Virginia Seller Disclosure Statement required',
        enabled: true,
        order: 11,
      },

      // ============== WISCONSIN (WI) ==============
      {
        state: 'WI',
        name: 'Wisconsin Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Wisconsin DSPS real estate license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'WI',
        name: 'Wisconsin Real Estate Condition Report',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'critical',
        message: 'Wisconsin Real Estate Condition Report required',
        enabled: true,
        order: 11,
      },

      // ============== WYOMING (WY) ==============
      {
        state: 'WY',
        name: 'Wyoming Real Estate License',
        category: 'licensing',
        field: 'agentLicenseNumber',
        operator: 'required',
        severity: 'critical',
        message: 'Wyoming Real Estate Commission license required',
        enabled: true,
        order: 10,
      },
      {
        state: 'WY',
        name: 'Wyoming Seller Disclosure',
        category: 'disclosure',
        field: 'knownMaterialDefects',
        operator: 'required',
        severity: 'warning',
        message: 'Wyoming Seller Property Condition Disclosure Statement required',
        enabled: true,
        order: 11,
      },
    ];

    await this.bulkCreate(defaultRules as any);
    console.log(`📋 Seeded ${defaultRules.length} default compliance rules`);
  }
}

// Initialize the model
StateComplianceRule.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      state: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: {
          isUppercase: true,
        },
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'general',
      },
      field: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      operator: {
        type: DataTypes.ENUM(
          'required',
          'equals',
          'not_equals',
          'contains',
          'min_value',
          'max_value',
          'min_days_until',
          'max_days_until',
          'regex',
          'in_list',
          'not_in_list',
          'is_true',
          'is_false'
        ),
        allowNull: false,
      },
      value: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      severity: {
        type: DataTypes.ENUM('critical', 'warning', 'info'),
        allowNull: false,
        defaultValue: 'warning',
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
      },
      evidenceRequirements: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    evidenceSeverity: {
      type: DataTypes.ENUM('critical', 'warning', 'info'),
      allowNull: true,
    },
    severityOverrides: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: true,
    },
      validTo: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      county: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'state_compliance_rules',
      timestamps: true,
      indexes: [
        { fields: ['state'] },
        { fields: ['state', 'enabled'] },
        { fields: ['category'] },
      ],
    }
  );

export default StateComplianceRule;
