/**
 * LLC Authorized Signer Model
 *
 * Represents authorized signers for an LLC.
 * Required for Phase 0 compliance.
 */

import { Model, DataTypes, Sequelize } from 'sequelize';

export interface LLCAuthorizedSignerAttributes {
  id?: number;
  llcId: number;
  name: string;
  title: string;
  taxIdEncrypted: string;
  authorityDocumentUrl?: string;
  verified: boolean;
  createdAt?: Date;
}

class LLCAuthorizedSigner extends Model<LLCAuthorizedSignerAttributes> implements LLCAuthorizedSignerAttributes {
  public id!: number;
  public llcId!: number;
  public name!: string;
  public title!: string;
  public taxIdEncrypted!: string;
  public authorityDocumentUrl?: string;
  public verified!: boolean;
  public readonly createdAt!: Date;
}

export function initLLCAuthorizedSigner(sequelize: Sequelize): typeof LLCAuthorizedSigner {
  LLCAuthorizedSigner.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      llcId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'llc_id',
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      taxIdEncrypted: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'tax_id_encrypted',
      },
      authorityDocumentUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'authority_document_url',
      },
      verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
      },
    },
    {
      sequelize,
      tableName: 'llc_authorized_signers',
      timestamps: false,
      underscored: true,
    }
  );

  return LLCAuthorizedSigner;
}

export default LLCAuthorizedSigner;
