/**
 * LLC Document Model
 *
 * Stores LLC formation documents (Articles, Operating Agreement)
 */

import { Model, DataTypes, Sequelize } from 'sequelize';

export interface LLCDocumentAttributes {
  id?: number;
  llcId: number;
  documentType: 'articles_of_organization' | 'operating_agreement';
  fileUrl: string;
  uploadedAt?: Date;
  verified: boolean;
}

class LLCDocument extends Model<LLCDocumentAttributes> implements LLCDocumentAttributes {
  public id!: number;
  public llcId!: number;
  public documentType!: 'articles_of_organization' | 'operating_agreement';
  public fileUrl!: string;
  public readonly uploadedAt!: Date;
  public verified!: boolean;
}

export function initLLCDocument(sequelize: Sequelize): typeof LLCDocument {
  LLCDocument.init(
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
      documentType: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'document_type',
        validate: {
          isIn: [['articles_of_organization', 'operating_agreement']],
        },
      },
      fileUrl: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'file_url',
      },
      uploadedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'uploaded_at',
      },
      verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      tableName: 'llc_documents',
      timestamps: false,
      underscored: true,
    }
  );

  return LLCDocument;
}

export default LLCDocument;
