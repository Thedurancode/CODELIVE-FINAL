/**
 * File Tools
 *
 * Tools for analyzing uploaded files (PDF, CSV, images, text).
 */

import { z } from 'zod';
import { Op } from 'sequelize';
import { toolRegistry, success, failure, defineTool } from './registry';
import { fileAnalysisService } from '../FileAnalysisService';
import type { AttachedFile, ParsedFileContent } from '../types';
import PropertyDocument from '../../../models/PropertyDocument';
import { Property } from '../../../models';
import { supabaseStorageService } from '../../SupabaseStorageService';
import { propertyService } from '../../propertyService';

/**
 * Register all file tools with the registry
 */
export function registerFileTools(): void {
  toolRegistry.registerAll([
    // =========================================================================
    // ANALYZE FILE
    // =========================================================================
    defineTool({
      name: 'analyze_file',
      description:
        'Analyze an attached file and extract key information. Supports PDF, CSV, text files. Returns document type, content summary, metadata, and any extracted tables.',
      category: 'file',
      schema: z.object({
        fileId: z
          .string()
          .optional()
          .describe('Specific file ID to analyze. If not provided, analyzes all attached files.'),
        maxContentLength: z
          .number()
          .optional()
          .default(5000)
          .describe('Maximum characters of content to return'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.files || context.files.length === 0) {
            return failure('No files attached to analyze. Please upload a file first.');
          }

          const filesToAnalyze = input.fileId
            ? context.files.filter((f) => f.id === input.fileId)
            : context.files;

          if (filesToAnalyze.length === 0) {
            return failure(`File with ID ${input.fileId} not found in attachments.`);
          }

          const results: Array<{
            fileId: string;
            fileName: string;
            type: string;
            summary: string;
            metadata: Record<string, unknown>;
            tables?: number;
          }> = [];

          for (const file of filesToAnalyze) {
            try {
              // Check if already parsed
              let parsed = file.parsed;
              if (!parsed) {
                parsed = await fileAnalysisService.parseFile(file);
              }

              const summary = fileAnalysisService.summarizeContent(parsed, input.maxContentLength);

              results.push({
                fileId: file.id,
                fileName: file.originalName,
                type: parsed.type,
                summary,
                metadata: parsed.metadata || {},
                tables: parsed.tables?.length || 0,
              });
            } catch (error) {
              results.push({
                fileId: file.id,
                fileName: file.originalName,
                type: 'unknown',
                summary: `Error analyzing file: ${error}`,
                metadata: { error: String(error) },
              });
            }
          }

          return success({
            filesAnalyzed: results.length,
            results,
          });
        } catch (error) {
          return failure(`Error analyzing files: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // EXTRACT TABLE DATA
    // =========================================================================
    defineTool({
      name: 'extract_table_data',
      description:
        'Extract structured table data from an attached file (CSV or PDF). Returns headers and rows as structured data for analysis.',
      category: 'file',
      schema: z.object({
        fileId: z.string().optional().describe('Specific file ID. If not provided, extracts from first file with tables.'),
        tableIndex: z.number().optional().default(0).describe('Index of table to extract (for files with multiple tables)'),
        maxRows: z.number().optional().default(100).describe('Maximum number of rows to return'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.files || context.files.length === 0) {
            return failure('No files attached. Please upload a CSV or PDF file.');
          }

          // Find file with tables
          let targetFile: AttachedFile | undefined;
          let parsed: ParsedFileContent | undefined;

          for (const file of context.files) {
            if (input.fileId && file.id !== input.fileId) continue;

            const fileParsed = file.parsed || (await fileAnalysisService.parseFile(file));
            if (fileParsed.tables && fileParsed.tables.length > 0) {
              targetFile = file;
              parsed = fileParsed;
              break;
            }
          }

          if (!targetFile || !parsed || !parsed.tables || parsed.tables.length === 0) {
            return failure('No tables found in attached files. Try uploading a CSV or PDF with tabular data.');
          }

          const tableIndex = Math.min(input.tableIndex || 0, parsed.tables.length - 1);
          const table = parsed.tables[tableIndex];

          // Limit rows
          const rows = table.rows.slice(0, input.maxRows);

          return success({
            fileName: targetFile.originalName,
            tableIndex,
            totalTables: parsed.tables.length,
            tableName: table.name,
            headers: table.headers,
            rows,
            totalRows: table.rows.length,
            rowsReturned: rows.length,
            truncated: rows.length < table.rows.length,
          });
        } catch (error) {
          return failure(`Error extracting table data: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SUMMARIZE DOCUMENT
    // =========================================================================
    defineTool({
      name: 'summarize_document',
      description:
        'Generate a summary of an attached document. Extracts key information and provides a concise overview.',
      category: 'file',
      schema: z.object({
        fileId: z.string().optional().describe('Specific file ID to summarize'),
        style: z
          .enum(['brief', 'detailed', 'bullet_points'])
          .optional()
          .default('brief')
          .describe('Summary style'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.files || context.files.length === 0) {
            return failure('No files attached to summarize.');
          }

          const file = input.fileId
            ? context.files.find((f) => f.id === input.fileId)
            : context.files[0];

          if (!file) {
            return failure(`File ${input.fileId} not found.`);
          }

          const parsed = file.parsed || (await fileAnalysisService.parseFile(file));

          // Build summary based on style
          let summary: string;
          const maxLength = input.style === 'detailed' ? 4000 : input.style === 'brief' ? 1000 : 2000;

          if (input.style === 'bullet_points') {
            // Create bullet point summary
            const bullets: string[] = [];
            bullets.push(`Document type: ${parsed.type.toUpperCase()}`);
            if (parsed.pageCount) bullets.push(`Pages: ${parsed.pageCount}`);
            if (parsed.wordCount) bullets.push(`Words: ${parsed.wordCount}`);
            if (parsed.tables?.length) bullets.push(`Tables found: ${parsed.tables.length}`);

            // Add content preview
            if (parsed.textContent) {
              const preview = parsed.textContent.substring(0, 500);
              const keyPhrases = preview.split(/[.!?\n]/).filter((s) => s.trim().length > 20).slice(0, 5);
              keyPhrases.forEach((phrase) => bullets.push(`• ${phrase.trim()}`));
            }

            summary = bullets.join('\n');
          } else {
            summary = fileAnalysisService.summarizeContent(parsed, maxLength);
          }

          return success({
            fileName: file.originalName,
            fileType: parsed.type,
            style: input.style,
            summary,
            metadata: {
              pageCount: parsed.pageCount,
              wordCount: parsed.wordCount,
              tableCount: parsed.tables?.length || 0,
            },
          });
        } catch (error) {
          return failure(`Error summarizing document: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // COMPARE DOCUMENTS
    // =========================================================================
    defineTool({
      name: 'compare_documents',
      description:
        'Compare two or more attached documents. Identifies similarities, differences, and key metrics comparison.',
      category: 'file',
      schema: z.object({
        fileIds: z
          .array(z.string())
          .optional()
          .describe('Specific file IDs to compare. If not provided, compares all attached files.'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.files || context.files.length < 2) {
            return failure('Need at least 2 files to compare. Please upload multiple files.');
          }

          const filesToCompare = input.fileIds
            ? context.files.filter((f) => input.fileIds!.includes(f.id))
            : context.files;

          if (filesToCompare.length < 2) {
            return failure('Need at least 2 files to compare.');
          }

          // Parse all files
          const parsedFiles: Array<{ file: AttachedFile; parsed: ParsedFileContent }> = [];
          for (const file of filesToCompare) {
            const parsed = file.parsed || (await fileAnalysisService.parseFile(file));
            parsedFiles.push({ file, parsed });
          }

          // Compare metrics
          const comparison = {
            fileCount: parsedFiles.length,
            files: parsedFiles.map(({ file, parsed }) => ({
              id: file.id,
              name: file.originalName,
              type: parsed.type,
              size: file.size,
              wordCount: parsed.wordCount || 0,
              pageCount: parsed.pageCount || 0,
              tableCount: parsed.tables?.length || 0,
            })),
            metrics: {
              totalWords: parsedFiles.reduce((sum, { parsed }) => sum + (parsed.wordCount || 0), 0),
              totalPages: parsedFiles.reduce((sum, { parsed }) => sum + (parsed.pageCount || 0), 0),
              totalTables: parsedFiles.reduce((sum, { parsed }) => sum + (parsed.tables?.length || 0), 0),
              averageWords: Math.round(
                parsedFiles.reduce((sum, { parsed }) => sum + (parsed.wordCount || 0), 0) / parsedFiles.length
              ),
            },
            typeBreakdown: {} as Record<string, number>,
          };

          // Type breakdown
          for (const { parsed } of parsedFiles) {
            comparison.typeBreakdown[parsed.type] = (comparison.typeBreakdown[parsed.type] || 0) + 1;
          }

          return success(comparison);
        } catch (error) {
          return failure(`Error comparing documents: ${error}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // SEARCH DOCUMENTS
    // =========================================================================
    defineTool({
      name: 'search_documents',
      description: `Search across all property documents in the system. Use when user asks:
- "Find all contracts"
- "Search for inspection reports"
- "What documents do we have for Brooklyn properties?"
- "Find documents uploaded last week"
Returns documents matching the search criteria with property info.`,
      category: 'file',
      schema: z.object({
        query: z.string().optional().describe('Search by filename (partial match)'),
        documentType: z
          .enum(['contract', 'photo', 'inspection', 'appraisal', 'disclosure', 'title', 'other'])
          .optional()
          .describe('Filter by document type'),
        propertyId: z.number().optional().describe('Filter by specific property ID'),
        propertyAddress: z.string().optional().describe('Filter by property address (partial match)'),
        uploadedAfter: z.string().optional().describe('Filter by upload date (ISO string or natural language)'),
        uploadedBefore: z.string().optional().describe('Filter by upload date'),
        status: z
          .enum(['uploading', 'ready', 'processing', 'classifying', 'failed'])
          .optional()
          .default('ready')
          .describe('Filter by status'),
        limit: z.number().optional().default(50).describe('Maximum results'),
        includePropertyInfo: z.boolean().optional().default(true).describe('Include property details'),
      }),
      handler: async (input) => {
        try {
          const where: Record<string, unknown> = {};

          // Status filter
          if (input.status) {
            where.status = input.status;
          }

          // Document type filter
          if (input.documentType) {
            where.documentType = input.documentType;
          }

          // Property ID filter
          if (input.propertyId) {
            where.propertyId = input.propertyId;
          }

          // Filename search
          if (input.query) {
            where.originalName = { [Op.iLike]: `%${input.query}%` };
          }

          // Date filters
          if (input.uploadedAfter) {
            const afterDate = new Date(input.uploadedAfter);
            if (!isNaN(afterDate.getTime())) {
              where.createdAt = { ...(where.createdAt as any || {}), [Op.gte]: afterDate };
            }
          }
          if (input.uploadedBefore) {
            const beforeDate = new Date(input.uploadedBefore);
            if (!isNaN(beforeDate.getTime())) {
              where.createdAt = { ...(where.createdAt as any || {}), [Op.lte]: beforeDate };
            }
          }

          // If property address filter, we need to find matching properties first
          let propertyIds: number[] | null = null;
          if (input.propertyAddress) {
            const matchingProperties = await Property.findAll({
              where: {
                [Op.or]: [
                  { 'address.street': { [Op.iLike]: `%${input.propertyAddress}%` } },
                  { city: { [Op.iLike]: `%${input.propertyAddress}%` } },
                  { state: { [Op.iLike]: `%${input.propertyAddress}%` } },
                ],
              },
              attributes: ['id'],
              limit: 100,
            });
            propertyIds = matchingProperties.map((p: Property) => p.id);
            if (propertyIds.length === 0) {
              return success({
                documents: [],
                total: 0,
                message: `No properties found matching "${input.propertyAddress}"`,
              });
            }
            where.propertyId = { [Op.in]: propertyIds };
          }

          // Query documents
          const documents = await PropertyDocument.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: input.limit,
          });

          // Get property info if requested
          let propertyMap: Map<number, Property> = new Map();
          if (input.includePropertyInfo && documents.length > 0) {
            const uniquePropertyIds = [...new Set(documents.map((d: PropertyDocument) => d.propertyId))];
            const properties = await Property.findAll({
              where: { id: { [Op.in]: uniquePropertyIds } },
            });
            for (const prop of properties) {
              propertyMap.set(prop.id, prop);
            }
          }

          const results = documents.map((doc: PropertyDocument) => {
            const property = propertyMap.get(doc.propertyId);
            return {
              id: doc.id,
              fileName: doc.originalName,
              documentType: doc.documentType,
              mimeType: doc.mimeType,
              fileSize: doc.fileSize,
              status: doc.status,
              uploadedAt: doc.createdAt,
              uploadedBy: doc.uploadedBy,
              propertyId: doc.propertyId,
              property: property
                ? {
                    id: property.id,
                    address: `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim(),
                    status: property.status,
                  }
                : null,
              metadata: doc.metadata?.classification
                ? {
                    autoClassified: doc.metadata.classification.wasAutoApplied,
                    confidence: doc.metadata.classification.confidence,
                  }
                : null,
            };
          });

          // Group by type for summary
          const typeBreakdown: Record<string, number> = {};
          for (const doc of documents) {
            typeBreakdown[doc.documentType] = (typeBreakdown[doc.documentType] || 0) + 1;
          }

          return success({
            documents: results,
            total: results.length,
            typeBreakdown,
            filters: {
              query: input.query,
              documentType: input.documentType,
              propertyId: input.propertyId,
              propertyAddress: input.propertyAddress,
            },
            message: `Found ${results.length} document(s)${input.documentType ? ` of type "${input.documentType}"` : ''}`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error searching documents: ${errorMessage}`);
        }
      },
      cacheable: true,
      cacheTTL: 60,
    }),

    // =========================================================================
    // GET DOCUMENT
    // =========================================================================
    defineTool({
      name: 'get_document',
      description: `Get detailed information about a specific document, including download URL and extracted content.`,
      category: 'file',
      schema: z.object({
        documentId: z.number().describe('Document ID to retrieve'),
        includeContent: z.boolean().optional().default(false).describe('Include extracted text content if available'),
        generateDownloadUrl: z.boolean().optional().default(true).describe('Generate a temporary download URL'),
      }),
      handler: async (input) => {
        try {
          const document = await PropertyDocument.findByPk(input.documentId);
          if (!document) {
            return failure(`Document with ID ${input.documentId} not found.`);
          }

          // Get property info
          const property = await Property.findByPk(document.propertyId);

          // Generate download URL if requested
          let downloadUrl: string | null = null;
          if (input.generateDownloadUrl) {
            try {
              const urlResult = await supabaseStorageService.getSignedUrl(document.storageKey, 3600); // 1 hour
              if (urlResult.success && urlResult.url) {
                downloadUrl = urlResult.url;
              }
            } catch (e) {
              // Non-critical
            }
          }

          const result: Record<string, unknown> = {
            id: document.id,
            fileName: document.originalName,
            documentType: document.documentType,
            mimeType: document.mimeType,
            fileSize: document.fileSize,
            status: document.status,
            uploadedAt: document.createdAt,
            uploadedBy: document.uploadedBy,
            downloadUrl,
            property: property
              ? {
                  id: property.id,
                  address: `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim(),
                }
              : null,
          };

          // Include metadata
          if (document.metadata) {
            result.metadata = {
              pages: document.metadata.pages,
              classification: document.metadata.classification
                ? {
                    type: document.metadata.classification.classifiedType,
                    confidence: document.metadata.classification.confidence,
                    source: document.metadata.classification.source,
                    autoApplied: document.metadata.classification.wasAutoApplied,
                  }
                : null,
              docuSeal: document.metadata.docuSealSubmissionId
                ? {
                    submissionId: document.metadata.docuSealSubmissionId,
                    templateName: document.metadata.docuSealTemplateName,
                    completedAt: document.metadata.docuSealCompletedAt,
                  }
                : null,
            };
          }

          // Include extracted content if requested
          if (input.includeContent && document.metadata?.extractedText) {
            result.extractedText = document.metadata.extractedText.substring(0, 5000);
            result.textTruncated = document.metadata.extractedText.length > 5000;
          }

          return success(result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error getting document: ${errorMessage}`);
        }
      },
      cacheable: true,
      cacheTTL: 300,
    }),

    // =========================================================================
    // ATTACH DOCUMENT TO PROPERTY
    // =========================================================================
    defineTool({
      name: 'attach_document_to_property',
      description: `Attach an uploaded file from the current chat session to a property. Use this after user uploads a file and wants to save it to a property.
Example: User uploads a contract PDF, then says "attach this to 141 Throop Ave"`,
      category: 'file',
      schema: z.object({
        fileId: z.string().optional().describe('File ID from uploaded files. If not provided, uses the most recent upload.'),
        propertyId: z.number().optional().describe('Property ID to attach to'),
        propertyAddress: z.string().optional().describe('Property address to attach to (will find property)'),
        documentType: z
          .enum(['contract', 'photo', 'inspection', 'appraisal', 'disclosure', 'title', 'other'])
          .optional()
          .describe('Document type (auto-detected if not provided)'),
        customName: z.string().optional().describe('Custom name for the document'),
      }),
      handler: async (input, context) => {
        try {
          if (!context.files || context.files.length === 0) {
            return failure('No files uploaded in this session. Please upload a file first.');
          }

          // Find the file to attach
          const file = input.fileId
            ? context.files.find((f) => f.id === input.fileId)
            : context.files[context.files.length - 1]; // Most recent

          if (!file) {
            return failure(`File ${input.fileId} not found in uploaded files.`);
          }

          // Find the property
          let property: Property | null = null;

          if (input.propertyId) {
            property = await Property.findByPk(input.propertyId);
          } else if (input.propertyAddress) {
            // Try to parse and find property
            const searchResults = await Property.findAll({
              where: {
                [Op.or]: [
                  { 'address.street': { [Op.iLike]: `%${input.propertyAddress}%` } },
                  { city: { [Op.iLike]: `%${input.propertyAddress}%` } },
                ],
              },
              limit: 5,
            });

            if (searchResults.length === 1) {
              property = searchResults[0];
            } else if (searchResults.length > 1) {
              return success({
                needsDisambiguation: true,
                properties: searchResults.map((p: Property) => ({
                  id: p.id,
                  address: `${p.address?.houseNumber || ''} ${p.address?.street || ''}, ${p.city || ''}, ${p.state || ''} ${p.zip || ''}`.trim(),
                })),
                message: `Found ${searchResults.length} properties. Please specify which one.`,
              });
            }
          }

          if (!property) {
            return failure('Property not found. Please provide a valid property ID or address.');
          }

          // Determine document type
          let documentType = input.documentType;
          if (!documentType) {
            // Auto-detect based on filename or mime type
            const lowerName = file.originalName.toLowerCase();
            if (lowerName.includes('contract') || lowerName.includes('agreement')) {
              documentType = 'contract';
            } else if (lowerName.includes('inspection')) {
              documentType = 'inspection';
            } else if (lowerName.includes('appraisal')) {
              documentType = 'appraisal';
            } else if (lowerName.includes('disclosure')) {
              documentType = 'disclosure';
            } else if (lowerName.includes('title')) {
              documentType = 'title';
            } else if (file.mimeType.startsWith('image/')) {
              documentType = 'photo';
            } else {
              documentType = 'other';
            }
          }

          // Upload to storage
          const storageKey = `properties/${property.id}/documents/${Date.now()}-${file.originalName}`;

          const uploadResult = await supabaseStorageService.uploadDocument(
            storageKey,
            file.content,
            file.mimeType
          );

          if (!uploadResult.success) {
            return failure(`Failed to upload document: ${uploadResult.error}`);
          }

          // Create document record
          const document = await PropertyDocument.create({
            propertyId: property.id,
            documentType,
            fileName: storageKey.split('/').pop() || file.originalName,
            originalName: input.customName || file.originalName,
            mimeType: file.mimeType,
            fileSize: file.size,
            storageKey,
            uploadedBy: context.userId,
            status: 'ready',
            metadata: {
              pages: file.parsed?.pageCount,
              extractedText: file.parsed?.textContent?.substring(0, 10000),
            },
          });

          const propertyAddress = `${property.address?.houseNumber || ''} ${property.address?.street || ''}, ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim();

          return success({
            documentId: document.id,
            fileName: document.originalName,
            documentType: document.documentType,
            fileSize: document.fileSize,
            propertyId: property.id,
            propertyAddress,
            message: `Document "${document.originalName}" attached to property ${propertyAddress} as ${documentType}.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error attaching document: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),

    // =========================================================================
    // DELETE DOCUMENT
    // =========================================================================
    defineTool({
      name: 'delete_document',
      description: `Delete a document from a property. Requires confirmation.`,
      category: 'file',
      schema: z.object({
        documentId: z.number().describe('Document ID to delete'),
        confirm: z.boolean().describe('Must be true to confirm deletion'),
      }),
      handler: async (input) => {
        try {
          if (!input.confirm) {
            return failure('Deletion not confirmed. Set confirm=true to delete the document.');
          }

          const document = await PropertyDocument.findByPk(input.documentId);
          if (!document) {
            return failure(`Document with ID ${input.documentId} not found.`);
          }

          const fileName = document.originalName;
          const propertyId = document.propertyId;

          // Delete from storage
          try {
            await supabaseStorageService.deleteDocument(document.storageKey);
          } catch (e) {
            // Non-critical - continue with database deletion
            console.warn('[delete_document] Failed to delete from storage:', e);
          }

          // Delete record
          await document.destroy();

          return success({
            deleted: true,
            documentId: input.documentId,
            fileName,
            propertyId,
            message: `Document "${fileName}" has been deleted.`,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return failure(`Error deleting document: ${errorMessage}`);
        }
      },
      cacheable: false,
    }),
  ]);
}

export default registerFileTools;
