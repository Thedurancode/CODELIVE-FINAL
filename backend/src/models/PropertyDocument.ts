/**
 * Property Document Model
 *
 * Stores metadata for documents attached to properties.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

export type DocumentType = 'contract' | 'photo' | 'inspection' | 'appraisal' | 'disclosure' | 'title' | 'other';
export type DocumentStatus = 'uploading' | 'ready' | 'processing' | 'classifying' | 'failed';

interface DocumentMetadata {
  width?: number;
  height?: number;
  pages?: number;
  extractedText?: string;
  complianceOcr?: {
    success: boolean;
    confidence: number;
    extractedFields?: Record<string, any>;
    fieldEvidence?: Record<string, any>;
    pageCount?: number;
    processedAt?: string;
    documentUpdatedAt?: string;
    source?: 'vision' | 'tesseract';
    model?: string;
    error?: string;
  };
  // Auto-classification metadata
  classification?: {
    success: boolean;
    classifiedType: DocumentType;
    confidence: number;
    allScores?: Record<string, number>;
    source: 'vision' | 'text' | 'filename' | 'mimetype' | 'manual';
    extractedFields?: Record<string, any>;
    suggestedWorkflow?: string;
    classifiedAt: string;
    classificationModel?: string;
    processingTimeMs?: number;
    wasAutoApplied: boolean;
    userOverride?: {
      previousType: DocumentType;
      overriddenAt: string;
      overriddenBy?: string;
    };
  };
  docuSealSubmissionId?: number;
  docuSealTemplateId?: number;
  docuSealTemplateName?: string;
  docuSealCategory?: string;
  docuSealDocumentUrl?: string;
  docuSealAuditLogUrl?: string;
  docuSealCompletedAt?: string;
}

interface PropertyDocumentAttributes {
  id: number;
  propertyId: number;
  documentType: DocumentType;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  uploadedBy?: string;
  metadata?: DocumentMetadata;
  status: DocumentStatus;
  complianceCategory?: string; // Links to state_document_template category
  createdAt?: Date;
  updatedAt?: Date;
}

interface PropertyDocumentCreationAttributes
  extends Optional<PropertyDocumentAttributes, 'id' | 'uploadedBy' | 'metadata' | 'status' | 'complianceCategory' | 'createdAt' | 'updatedAt'> {}

class PropertyDocument
  extends Model<PropertyDocumentAttributes, PropertyDocumentCreationAttributes>
  implements PropertyDocumentAttributes
{
  declare id: number;
  declare propertyId: number;
  declare documentType: DocumentType;
  declare fileName: string;
  declare originalName: string;
  declare mimeType: string;
  declare fileSize: number;
  declare storageKey: string;
  declare uploadedBy: string | undefined;
  declare metadata: DocumentMetadata | undefined;
  declare status: DocumentStatus;
  declare complianceCategory: string | undefined;
  declare createdAt: Date;
  declare updatedAt: Date;
}

PropertyDocument.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    propertyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'properties',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    documentType: {
      type: DataTypes.ENUM('contract', 'photo', 'inspection', 'appraisal', 'disclosure', 'title', 'other'),
      allowNull: false,
      defaultValue: 'other',
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    originalName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    storageKey: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    uploadedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    status: {
      type: DataTypes.ENUM('uploading', 'ready', 'processing', 'classifying', 'failed'),
      allowNull: false,
      defaultValue: 'ready',
    },
    complianceCategory: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'property_documents',
    timestamps: true,
    indexes: [
      { fields: ['propertyId'] },
      { fields: ['documentType'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
    ],
  }
);

export default PropertyDocument;
export { PropertyDocumentAttributes, PropertyDocumentCreationAttributes, DocumentMetadata };
