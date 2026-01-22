/**
 * LLC Profile Model
 *
 * Represents a Legal Entity (LLC) that wholesalers use to submit deals.
 * Phase 0 requirement: Must have complete profile + CSA before submitting deals.
 */

import { Model, DataTypes, Sequelize } from 'sequelize';

export interface LLCProfileAttributes {
  id?: number;
  userId: number;
  legalName: string;
  ein: string;
  stateOfFormation: string;
  formationDate: Date;
  businessAddress: string;
  status: 'incomplete' | 'complete' | 'verified';
  createdAt?: Date;
  updatedAt?: Date;
}

class LLCProfile extends Model<LLCProfileAttributes> implements LLCProfileAttributes {
  public id!: number;
  public userId!: number;
  public legalName!: string;
  public ein!: string;
  public stateOfFormation!: string;
  public formationDate!: Date;
  public businessAddress!: string;
  public status!: 'incomplete' | 'complete' | 'verified';
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Check if LLC profile is complete and ready for deal submission
   */
  async isReadyForSubmission(): Promise<boolean> {
    if (this.status !== 'complete' && this.status !== 'verified') {
      return false;
    }

    // Check if has all required documents
    const LLCDocument = (await import('./LLCDocument')).default;
    const documents = await LLCDocument.findAll({
      where: { llcId: this.id },
    });

    const hasArticles = documents.some(doc => doc.documentType === 'articles_of_organization');
    const hasOperatingAgreement = documents.some(doc => doc.documentType === 'operating_agreement');

    if (!hasArticles || !hasOperatingAgreement) {
      return false;
    }

    // Check if has authorized signer
    const LLCAuthorizedSigner = (await import('./LLCAuthorizedSigner')).default;
    const signer = await LLCAuthorizedSigner.findOne({
      where: { llcId: this.id },
    });

    if (!signer) {
      return false;
    }

    // Check if has executed CSA
    const Agreement = (await import('./Agreement')).default;
    const csa = await Agreement.findOne({
      where: {
        llcId: this.id,
        agreementType: 'CSA',
        status: 'executed',
      },
    });

    return !!csa;
  }

  /**
   * Get authorized signer for this LLC
   */
  async getAuthorizedSigner() {
    const LLCAuthorizedSigner = (await import('./LLCAuthorizedSigner')).default;
    return LLCAuthorizedSigner.findOne({
      where: { llcId: this.id },
    });
  }

  /**
   * Get executed CSA for this LLC
   */
  async getExecutedCSA() {
    const Agreement = (await import('./Agreement')).default;
    return Agreement.findOne({
      where: {
        llcId: this.id,
        agreementType: 'CSA',
        status: 'executed',
      },
    });
  }
}

export function initLLCProfile(sequelize: Sequelize): typeof LLCProfile {
  LLCProfile.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id',
      },
      legalName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'legal_name',
      },
      ein: {
        type: DataTypes.STRING(9),
        allowNull: false,
        unique: true,
        validate: {
          len: [9, 9],
          isNumeric: true,
        },
      },
      stateOfFormation: {
        type: DataTypes.STRING(2),
        allowNull: false,
        field: 'state_of_formation',
        validate: {
          len: [2, 2],
          isUppercase: true,
        },
      },
      formationDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'formation_date',
      },
      businessAddress: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'business_address',
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'incomplete',
        validate: {
          isIn: [['incomplete', 'complete', 'verified']],
        },
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at',
      },
    },
    {
      sequelize,
      tableName: 'llc_profiles',
      timestamps: true,
      underscored: true,
    }
  );

  return LLCProfile;
}

export default LLCProfile;
