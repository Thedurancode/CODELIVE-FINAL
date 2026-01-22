/**
 * Agreement Model
 *
 * Tracks CSA, MSA, and ASA agreements
 * - CSA: Client Services Agreement (LLC-scoped, required in Phase 0)
 * - MSA: Marketing Services Agreement (required if distributing)
 * - ASA: Auction Services Agreement (required if using auction channel)
 */

import { Model, DataTypes, Sequelize } from 'sequelize';

export interface AgreementAttributes {
  id?: number;
  llcId?: number;
  userId?: number;
  dealId?: number;
  agreementType: 'CSA' | 'MSA' | 'ASA';
  agreementVersion: string;
  status: 'pending' | 'executed' | 'expired';
  signedBy?: string;
  executedAt?: Date;
  documentUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

class Agreement extends Model<AgreementAttributes> implements AgreementAttributes {
  public id!: number;
  public llcId?: number;
  public userId?: number;
  public dealId?: number;
  public agreementType!: 'CSA' | 'MSA' | 'ASA';
  public agreementVersion!: string;
  public status!: 'pending' | 'executed' | 'expired';
  public signedBy?: string;
  public executedAt?: Date;
  public documentUrl?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  /**
   * Check if agreement is executed
   */
  isExecuted(): boolean {
    return this.status === 'executed';
  }

  /**
   * Execute this agreement
   */
  async execute(signedBy: string, documentUrl?: string): Promise<void> {
    this.status = 'executed';
    this.signedBy = signedBy;
    this.executedAt = new Date();
    if (documentUrl) {
      this.documentUrl = documentUrl;
    }
    await this.save();
  }

  /**
   * Find or create CSA for an LLC
   */
  static async findOrCreateCSA(llcId: number, userId: number): Promise<Agreement> {
    const [csa] = await Agreement.findOrCreate({
      where: {
        llcId,
        agreementType: 'CSA',
      },
      defaults: {
        llcId,
        userId,
        agreementType: 'CSA',
        agreementVersion: 'v1.0',
        status: 'pending',
      },
    });
    return csa;
  }

  /**
   * Find or create MSA for a deal
   */
  static async findOrCreateMSA(dealId: number, userId: number): Promise<Agreement> {
    const [msa] = await Agreement.findOrCreate({
      where: {
        dealId,
        agreementType: 'MSA',
      },
      defaults: {
        dealId,
        userId,
        agreementType: 'MSA',
        agreementVersion: 'v1.0',
        status: 'pending',
      },
    });
    return msa;
  }

  /**
   * Find or create ASA (Auction Services Agreement) for a deal
   */
  static async findOrCreateASA(dealId: number, userId: number): Promise<Agreement> {
    const [asa] = await Agreement.findOrCreate({
      where: {
        dealId,
        agreementType: 'ASA',
      },
      defaults: {
        dealId,
        userId,
        agreementType: 'ASA',
        agreementVersion: 'v1.0', // Hubzu Auction Services Agreement
        status: 'pending',
      },
    });
    return asa;
  }
}

export function initAgreement(sequelize: Sequelize): typeof Agreement {
  Agreement.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      llcId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'llc_id',
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'user_id',
      },
      dealId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'deal_id',
      },
      agreementType: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'agreement_type',
        validate: {
          isIn: [['CSA', 'MSA', 'ASA']],
        },
      },
      agreementVersion: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'agreement_version',
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: [['pending', 'executed', 'expired']],
        },
      },
      signedBy: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'signed_by',
      },
      executedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'executed_at',
      },
      documentUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'document_url',
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
      tableName: 'agreements',
      timestamps: true,
      underscored: true,
    }
  );

  return Agreement;
}

export default Agreement;
