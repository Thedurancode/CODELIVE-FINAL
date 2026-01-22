/**
 * Knowledge Service
 *
 * Manages the knowledge base with Pinecone vector storage and OpenAI embeddings.
 * Provides semantic search capabilities for the AI agent.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { DocumentProcessor, ChunkedDocument, DocumentChunk } from './DocumentProcessor';

export interface KnowledgeDocument {
  id: string;
  filename: string;
  filepath: string;
  fileType: string;
  chunksCount: number;
  status: 'processing' | 'indexed' | 'failed';
  error?: string;
  indexedAt?: Date;
  metadata?: Record<string, any>;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: {
    filename: string;
    fileType: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

export interface KnowledgeStats {
  totalDocuments: number;
  totalChunks: number;
  indexName: string;
  status: 'ready' | 'initializing' | 'error';
  lastUpdated?: Date;
}

class KnowledgeService {
  private pinecone: Pinecone | null = null;
  private openai: OpenAI | null = null;
  private indexName: string = 'dispotree-knowledge';
  private processor: DocumentProcessor;
  private documents: Map<string, KnowledgeDocument> = new Map();
  private initialized: boolean = false;
  private embeddingModel: string = 'text-embedding-3-small';
  private embeddingDimensions: number = 1536;

  constructor() {
    this.processor = new DocumentProcessor({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
  }

  /**
   * Initialize the knowledge service
   */
  async initialize(): Promise<void> {
    const pineconeKey = process.env.PINECONE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!pineconeKey) {
      console.warn('  PINECONE_API_KEY not set - Knowledge service disabled');
      return;
    }

    if (!openaiKey) {
      console.warn('  OPENAI_API_KEY not set - Knowledge service disabled');
      return;
    }

    try {
      // Initialize Pinecone
      this.pinecone = new Pinecone({
        apiKey: pineconeKey,
      });

      // Initialize OpenAI for embeddings
      this.openai = new OpenAI({
        apiKey: openaiKey,
      });

      // Check if index exists, create if not
      await this.ensureIndex();

      this.initialized = true;
      console.log(`  Knowledge Service initialized with Pinecone index: ${this.indexName}`);
    } catch (error) {
      console.error('  Failed to initialize Knowledge Service:', error);
    }
  }

  /**
   * Ensure the Pinecone index exists
   */
  private async ensureIndex(): Promise<void> {
    if (!this.pinecone) return;

    try {
      const indexes = await this.pinecone.listIndexes();
      const indexExists = indexes.indexes?.some((idx) => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}...`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: this.embeddingDimensions,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1',
            },
          },
        });

        // Wait for index to be ready
        console.log('Waiting for index to be ready...');
        await this.waitForIndex();
      }
    } catch (error: any) {
      // Index might already exist
      if (!error.message?.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Wait for index to be ready
   */
  private async waitForIndex(): Promise<void> {
    if (!this.pinecone) return;

    let ready = false;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (!ready && attempts < maxAttempts) {
      const description = await this.pinecone.describeIndex(this.indexName);
      ready = description.status?.ready === true;

      if (!ready) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      }
    }

    if (!ready) {
      throw new Error('Index failed to become ready in time');
    }
  }

  /**
   * Generate embeddings for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }

    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Index a document
   */
  async indexDocument(filepath: string, metadata?: Record<string, any>): Promise<KnowledgeDocument> {
    if (!this.initialized) {
      throw new Error('Knowledge service not initialized');
    }

    const filename = path.basename(filepath);
    const docId = this.generateDocId(filepath);

    // Create document record
    const doc: KnowledgeDocument = {
      id: docId,
      filename,
      filepath,
      fileType: this.processor.getFileType(filepath),
      chunksCount: 0,
      status: 'processing',
      metadata,
    };

    this.documents.set(docId, doc);

    try {
      // Check if file is supported
      if (!this.processor.isSupported(filepath)) {
        throw new Error(`Unsupported file type: ${path.extname(filepath)}`);
      }

      // Process the document
      console.log(`Processing document: ${filename}`);
      const processed = await this.processor.processFile(filepath);

      // Chunk the document
      const chunked = this.processor.chunkDocument(processed);
      doc.chunksCount = chunked.chunks.length;

      // Generate embeddings and upsert to Pinecone
      await this.upsertChunks(docId, chunked.chunks, metadata);

      doc.status = 'indexed';
      doc.indexedAt = new Date();
      this.documents.set(docId, doc);

      console.log(`  Indexed ${filename}: ${chunked.chunks.length} chunks`);
      return doc;
    } catch (error: any) {
      doc.status = 'failed';
      doc.error = error.message;
      this.documents.set(docId, doc);
      console.error(`  Failed to index ${filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Upsert chunks to Pinecone
   */
  private async upsertChunks(
    docId: string,
    chunks: DocumentChunk[],
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.pinecone) {
      throw new Error('Pinecone not initialized');
    }

    const index = this.pinecone.index(this.indexName);
    const batchSize = 100;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const vectors = await Promise.all(
        batch.map(async (chunk) => {
          const embedding = await this.generateEmbedding(chunk.text);
          return {
            id: `${docId}-${chunk.chunkIndex}`,
            values: embedding,
            metadata: {
              text: chunk.text.substring(0, 1000), // Store truncated text in metadata
              filename: chunk.metadata.filename,
              fileType: chunk.metadata.fileType,
              chunkIndex: chunk.chunkIndex,
              totalChunks: chunk.totalChunks,
              docId,
              ...metadata,
            },
          };
        })
      );

      await index.upsert(vectors);
    }
  }

  /**
   * Search the knowledge base
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    if (!this.initialized || !this.pinecone) {
      throw new Error('Knowledge service not initialized');
    }

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Search Pinecone
    const index = this.pinecone.index(this.indexName);
    const results = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });

    return (results.matches || []).map((match) => ({
      id: match.id,
      text: (match.metadata?.text as string) || '',
      score: match.score || 0,
      metadata: {
        filename: (match.metadata?.filename as string) || 'unknown',
        fileType: (match.metadata?.fileType as string) || 'unknown',
        chunkIndex: (match.metadata?.chunkIndex as number) || 0,
        totalChunks: (match.metadata?.totalChunks as number) || 1,
      },
    }));
  }

  /**
   * Delete a document from the knowledge base
   */
  async deleteDocument(docId: string): Promise<void> {
    if (!this.initialized || !this.pinecone) {
      throw new Error('Knowledge service not initialized');
    }

    const doc = this.documents.get(docId);
    if (!doc) {
      throw new Error(`Document not found: ${docId}`);
    }

    // Delete all chunks from Pinecone
    const index = this.pinecone.index(this.indexName);
    const chunkIds = Array.from({ length: doc.chunksCount }, (_, i) => `${docId}-${i}`);

    if (chunkIds.length > 0) {
      await index.deleteMany(chunkIds);
    }

    // Remove from local tracking
    this.documents.delete(docId);
    console.log(`  Deleted document: ${doc.filename}`);
  }

  /**
   * Index all files in a directory
   */
  async indexDirectory(dirPath: string, recursive: boolean = true): Promise<KnowledgeDocument[]> {
    const results: KnowledgeDocument[] = [];

    const processDir = async (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          await processDir(fullPath);
        } else if (entry.isFile() && this.processor.isSupported(fullPath)) {
          try {
            const doc = await this.indexDocument(fullPath);
            results.push(doc);
          } catch (error) {
            console.error(`Failed to index ${fullPath}:`, error);
          }
        }
      }
    };

    await processDir(dirPath);
    return results;
  }

  /**
   * Get all indexed documents
   */
  getDocuments(): KnowledgeDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Get document by ID
   */
  getDocument(docId: string): KnowledgeDocument | undefined {
    return this.documents.get(docId);
  }

  /**
   * Get knowledge base statistics - queries Pinecone for accurate counts
   */
  async getStats(): Promise<KnowledgeStats> {
    // Get in-memory docs first
    const docs = this.getDocuments();
    let totalChunks = docs.reduce((sum, doc) => sum + doc.chunksCount, 0);
    let totalDocuments = docs.length;

    // Query Pinecone for actual vector count if available
    if (this.initialized && this.pinecone) {
      try {
        const index = this.pinecone.index(this.indexName);
        const stats = await index.describeIndexStats();

        // Use Pinecone's actual vector count
        const pineconeVectors = stats.totalRecordCount || 0;
        if (pineconeVectors > totalChunks) {
          totalChunks = pineconeVectors;
          // Estimate documents (avg ~3 chunks per doc)
          if (totalDocuments === 0 && pineconeVectors > 0) {
            totalDocuments = Math.ceil(pineconeVectors / 3);
          }
        }
      } catch (error) {
        // Fall back to in-memory counts
        console.warn('Could not query Pinecone stats:', error);
      }
    }

    // Get documents with valid indexedAt dates
    const indexedDocs = docs.filter(d => d.indexedAt);
    let lastUpdated: Date | undefined;

    if (indexedDocs.length > 0) {
      const timestamps = indexedDocs.map(d => d.indexedAt!.getTime());
      lastUpdated = new Date(Math.max(...timestamps));
    }

    return {
      totalDocuments,
      totalChunks,
      indexName: this.indexName,
      status: this.initialized ? 'ready' : 'error',
      lastUpdated,
    };
  }

  /**
   * List all indexed documents (alias for getDocuments)
   */
  listDocuments(): KnowledgeDocument[] {
    return this.getDocuments();
  }

  /**
   * Generate a document ID from filepath
   */
  private generateDocId(filepath: string): string {
    const filename = path.basename(filepath);
    const hash = require('crypto').createHash('md5').update(filepath).digest('hex').substring(0, 8);
    return `${filename.replace(/[^a-zA-Z0-9]/g, '_')}-${hash}`;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return DocumentProcessor.getSupportedExtensions();
  }

  /**
   * Load default knowledge base documents
   * These are pre-packaged real estate guides, checklists, and references
   */
  async loadDefaultDocuments(): Promise<{ loaded: number; skipped: number; errors: string[] }> {
    const defaultsPath = path.join(__dirname, '../../../knowledge/defaults');
    const result = { loaded: 0, skipped: 0, errors: [] as string[] };

    if (!this.initialized) {
      console.warn('  Knowledge service not initialized, skipping default document loading');
      return result;
    }

    if (!fs.existsSync(defaultsPath)) {
      console.log('  No default documents folder found at:', defaultsPath);
      return result;
    }

    console.log('  Loading default knowledge base documents...');

    try {
      const files = fs.readdirSync(defaultsPath);

      for (const file of files) {
        const filePath = path.join(defaultsPath, file);
        const stat = fs.statSync(filePath);

        if (!stat.isFile() || !this.processor.isSupported(filePath)) {
          continue;
        }

        // Check if already indexed (by filename)
        const existingDocs = this.getDocuments();
        const alreadyIndexed = existingDocs.some(
          (doc) => doc.filename === file && doc.status === 'indexed'
        );

        if (alreadyIndexed) {
          result.skipped++;
          continue;
        }

        try {
          await this.indexDocument(filePath, { source: 'default', category: 'real-estate-guide' });
          result.loaded++;
          console.log(`    ✓ Loaded: ${file}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`${file}: ${errorMessage}`);
          console.error(`    ✗ Failed: ${file}`, error);
        }
      }

      console.log(`  Default documents: ${result.loaded} loaded, ${result.skipped} skipped`);
    } catch (error) {
      console.error('  Error loading default documents:', error);
      result.errors.push(String(error));
    }

    return result;
  }

  /**
   * Index a buy box document for semantic search
   * Creates a structured text representation of the buy box criteria
   * that can be searched semantically by the AI agent
   */
  // State abbreviation to full name mapping for better semantic search
  private stateNames: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  };

  async indexBuyBox(buyBox: {
    id: string;
    name: string;
    fundName: string;
    fundType?: string;
    description?: string;
    contactEmail?: string;
    criteria: Record<string, any>;
    marketContacts?: Array<{ name: string; email: string; markets: string[] }>;
  }): Promise<KnowledgeDocument | null> {
    if (!this.initialized) {
      console.warn('Knowledge service not initialized, skipping buy box indexing');
      return null;
    }

    const docId = `buybox-${buyBox.id}`;
    const c = buyBox.criteria;

    // Build rich, semantically meaningful text for better embedding matching
    const textParts: string[] = [];

    // Header with synonyms
    textParts.push(`# ${buyBox.fundName} Investment Buy Box Criteria`);
    textParts.push(`This buy box defines the investment criteria and property requirements for ${buyBox.fundName}.`);

    if (buyBox.fundType) {
      textParts.push(`${buyBox.fundName} is an ${buyBox.fundType} investor and fund.`);
    }
    if (buyBox.description) {
      textParts.push(buyBox.description);
    }

    // Geographic with full state names for semantic matching
    if (c.states?.length) {
      const statesFull = c.states.map((s: string) => `${this.stateNames[s] || s} (${s})`);
      textParts.push(`\n## Geographic Markets and Target States`);
      textParts.push(`${buyBox.fundName} buys properties in the following states: ${statesFull.join(', ')}.`);
      textParts.push(`Target markets include: ${c.states.join(', ')}.`);

      // Add regional descriptions
      const southeast = ['FL', 'GA', 'NC', 'SC', 'AL', 'TN', 'LA', 'MS'];
      const southwest = ['TX', 'AZ', 'NM', 'NV', 'OK'];
      const midwest = ['OH', 'IN', 'IL', 'MI', 'MO', 'KS', 'WI', 'MN', 'IA'];
      const northeast = ['NY', 'NJ', 'PA', 'MA', 'CT', 'NH', 'ME', 'RI', 'VT'];
      const west = ['CA', 'WA', 'OR', 'CO', 'UT', 'ID', 'MT', 'WY'];

      const regions: string[] = [];
      if (c.states.some((s: string) => southeast.includes(s))) regions.push('Southeast');
      if (c.states.some((s: string) => southwest.includes(s))) regions.push('Southwest');
      if (c.states.some((s: string) => midwest.includes(s))) regions.push('Midwest');
      if (c.states.some((s: string) => northeast.includes(s))) regions.push('Northeast');
      if (c.states.some((s: string) => west.includes(s))) regions.push('West Coast');

      if (regions.length) {
        textParts.push(`This fund focuses on ${regions.join(', ')} markets.`);
      }
    }

    if (c.counties?.length) {
      textParts.push(`Preferred counties: ${c.counties.join(', ')}.`);
    }
    if (c.cities?.length) {
      textParts.push(`Target cities and metros: ${c.cities.join(', ')}.`);
    }
    if (c.zipCodes?.length) {
      textParts.push(`Specific zip codes: ${c.zipCodes.slice(0, 20).join(', ')}${c.zipCodes.length > 20 ? '...' : ''}.`);
    }

    // Pricing with semantic descriptions
    textParts.push(`\n## Pricing and Financial Requirements`);
    if (c.minPrice || c.maxPrice) {
      const min = c.minPrice || 0;
      const max = c.maxPrice || 999999999;
      textParts.push(`Purchase price range: $${min.toLocaleString()} to $${max.toLocaleString()}.`);

      // Add price tier descriptions
      if (max <= 200000) {
        textParts.push(`This fund targets affordable, entry-level, and budget-friendly properties.`);
      } else if (max <= 400000) {
        textParts.push(`This fund targets mid-range, median-priced properties in the moderate price tier.`);
      } else if (max <= 600000) {
        textParts.push(`This fund accepts higher-value properties in the upper-mid price range.`);
      } else {
        textParts.push(`This fund considers premium, high-value, and luxury properties.`);
      }
    }

    if (c.minARV || c.maxARV) {
      textParts.push(`After Repair Value (ARV) range: $${(c.minARV || 0).toLocaleString()} to $${(c.maxARV || 0).toLocaleString()}.`);
    }
    if (c.minGrossYield) {
      textParts.push(`Minimum gross yield requirement: ${(c.minGrossYield * 100).toFixed(1)}% return.`);
      textParts.push(`This fund requires at least ${(c.minGrossYield * 100).toFixed(1)}% cap rate or gross rental yield.`);
    }

    // Property specifications with synonyms
    textParts.push(`\n## Property Type and Specifications`);
    if (c.propertyTypes?.length) {
      const typeMap: Record<string, string> = {
        'single_family': 'Single Family Home (SFR, single-family residential, detached house)',
        'Single Family': 'Single Family Home (SFR, single-family residential, detached house)',
        'townhouse': 'Townhouse (townhome, row house, attached dwelling)',
        'Townhouse': 'Townhouse (townhome, row house, attached dwelling)',
        'condo': 'Condominium (condo, apartment, unit)',
        'duplex': 'Duplex (two-family, 2-unit)',
        'triplex': 'Triplex (three-family, 3-unit)',
        'fourplex': 'Fourplex (four-family, 4-unit, quadplex)',
        'multi_family': 'Multi-family (apartment building, rental property)',
      };
      const types = c.propertyTypes.map((t: string) => typeMap[t] || t);
      textParts.push(`Accepted property types: ${types.join('; ')}.`);
    }

    if (c.minBedrooms || c.maxBedrooms) {
      const minBed = c.minBedrooms || 0;
      const maxBed = c.maxBedrooms || 99;
      textParts.push(`Bedroom requirements: ${minBed} to ${maxBed} bedrooms.`);

      if (minBed >= 3) {
        textParts.push(`This fund prefers family-sized homes with 3+ bedrooms.`);
      } else if (maxBed <= 2) {
        textParts.push(`This fund accepts starter homes and smaller properties.`);
      }
    }

    if (c.minBathrooms) {
      textParts.push(`Minimum ${c.minBathrooms} bathrooms required.`);
    }
    if (c.minSqft || c.maxSqft) {
      textParts.push(`Square footage: ${c.minSqft || 0} to ${c.maxSqft || 'unlimited'} sqft living space.`);
    }
    if (c.minYearBuilt) {
      textParts.push(`Year built: ${c.minYearBuilt} or newer construction.`);
      if (c.minYearBuilt >= 2000) {
        textParts.push(`This fund prefers newer, modern construction built after 2000.`);
      } else if (c.minYearBuilt >= 1980) {
        textParts.push(`This fund accepts properties from the 1980s and newer.`);
      }
    }
    if (c.minGarages) {
      textParts.push(`Garage requirement: minimum ${c.minGarages}-car garage.`);
    }
    if (c.minLotSize || c.maxLotSize) {
      textParts.push(`Lot size: ${c.minLotSize || 0} to ${c.maxLotSize || 'unlimited'} sqft.`);
    }

    // Investment strategy
    if (c.investmentStrategies?.length) {
      textParts.push(`\n## Investment Strategy`);
      const strategyMap: Record<string, string> = {
        'buy_and_hold': 'Buy and Hold (long-term rental, landlord, passive income)',
        'long_term_rental': 'Long Term Rental (LTR, lease, tenant, landlord)',
        'fix_and_flip': 'Fix and Flip (rehab, renovation, resale)',
        'wholesale': 'Wholesale (assignment, quick sale)',
        'BRRRR': 'BRRRR (Buy, Rehab, Rent, Refinance, Repeat)',
      };
      const strategies = c.investmentStrategies.map((s: string) => strategyMap[s] || s);
      textParts.push(`Investment strategies: ${strategies.join('; ')}.`);
    }

    if (c.conditionLevels?.length || c.conditions?.length) {
      const conditions = c.conditionLevels || c.conditions;
      textParts.push(`Acceptable property conditions: ${conditions.join(', ')}.`);
    }

    // Restrictions - what they DON'T want
    const restrictions: string[] = [];
    if (c.allowPool === false) restrictions.push('No swimming pools');
    if (c.allowSeptic === false) restrictions.push('No septic systems (city sewer required)');
    if (c.allowWell === false) restrictions.push('No well water (city water required)');
    if (c.allowFloodZone === false) restrictions.push('No flood zone properties');
    if (c.allowCarport === false) restrictions.push('No carports (attached garage required)');
    if (c.allowMainRoad === false) restrictions.push('No busy roads or highways');
    if (c.allowAgeRestrictions === false) restrictions.push('No 55+ or age-restricted communities');
    if (c.allowSolarPanels === false) restrictions.push('No solar panel leases');
    if (c.allowStructuralIssues === false) restrictions.push('No structural damage');
    if (c.allowFoundationIssues === false) restrictions.push('No foundation problems');
    if (c.allowFireDamage === false) restrictions.push('No fire damage history');
    if (c.allowOpenPermits === false) restrictions.push('No open or unpermitted work');
    if (c.allowLeasingRestrictions === false) restrictions.push('No HOA rental restrictions');
    if (c.allowMobileHome === false) restrictions.push('No mobile homes or manufactured housing');

    if (restrictions.length > 0) {
      textParts.push(`\n## Restrictions and Deal Breakers`);
      textParts.push(`Hard requirements - will NOT accept: ${restrictions.join('; ')}.`);
    }
    if (c.hardNos) {
      textParts.push(`Additional exclusions: ${c.hardNos}`);
    }

    // Market-specific pricing
    if (c.marketPrices && Object.keys(c.marketPrices).length > 0) {
      textParts.push(`\n## Market-Specific Pricing`);
      for (const [market, pricing] of Object.entries(c.marketPrices)) {
        const p = pricing as any;
        const parts = [];
        if (p.maxPrice) parts.push(`max price $${p.maxPrice.toLocaleString()}`);
        if (p.grossYield) parts.push(`minimum ${p.grossYield}% yield`);
        textParts.push(`${market}: ${parts.join(', ')}.`);
      }
    }

    // Contact info
    if (buyBox.contactEmail || buyBox.marketContacts?.length) {
      textParts.push(`\n## Contact Information`);
      if (buyBox.contactEmail) {
        textParts.push(`Primary contact: ${buyBox.contactEmail}`);
      }
      if (buyBox.marketContacts?.length) {
        for (const contact of buyBox.marketContacts) {
          textParts.push(`${contact.name} (${contact.email}): handles ${contact.markets.join(', ')}.`);
        }
      }
    }

    // Summary for better matching
    textParts.push(`\n## Summary`);
    textParts.push(`${buyBox.fundName} is looking for ${c.propertyTypes?.join('/') || 'residential'} properties`);
    if (c.states?.length) {
      textParts.push(`in ${c.states.join(', ')}`);
    }
    if (c.minPrice || c.maxPrice) {
      textParts.push(`priced between $${(c.minPrice || 0).toLocaleString()} and $${(c.maxPrice || 0).toLocaleString()}`);
    }
    textParts.push(`.`);

    const fullText = textParts.join('\n');

    // Create document record
    const doc: KnowledgeDocument = {
      id: docId,
      filename: `${buyBox.fundName.replace(/[^a-zA-Z0-9]/g, '_')}_buybox`,
      filepath: `buybox://${buyBox.id}`,
      fileType: 'buybox',
      chunksCount: 0,
      status: 'processing',
      metadata: {
        type: 'buybox',
        buyBoxId: buyBox.id,
        fundName: buyBox.fundName,
        fundType: buyBox.fundType,
        states: c.states,
      },
    };

    try {
      // Delete existing chunks if re-indexing
      try {
        const existingDoc = this.documents.get(docId);
        if (existingDoc && existingDoc.chunksCount > 0 && this.pinecone) {
          const index = this.pinecone.index(this.indexName);
          const chunkIds = Array.from({ length: existingDoc.chunksCount }, (_, i) => `${docId}-${i}`);
          await index.deleteMany(chunkIds);
        }
      } catch {
        // Ignore delete errors
      }

      // Chunk the text (buy boxes are usually small, but chunk anyway for consistency)
      const chunks = this.processor.chunkText(fullText, {
        filename: doc.filename,
        fileType: 'buybox',
      });

      doc.chunksCount = chunks.length;

      // Upsert to Pinecone
      await this.upsertChunks(docId, chunks, doc.metadata);

      doc.status = 'indexed';
      doc.indexedAt = new Date();
      this.documents.set(docId, doc);

      console.log(`  Indexed buy box: ${buyBox.fundName} (${chunks.length} chunks)`);
      return doc;
    } catch (error: any) {
      doc.status = 'failed';
      doc.error = error.message;
      this.documents.set(docId, doc);
      console.error(`  Failed to index buy box ${buyBox.fundName}:`, error.message);
      return null;
    }
  }

  /**
   * Search specifically for buy box related knowledge
   */
  async searchBuyBoxes(query: string, topK: number = 5): Promise<SearchResult[]> {
    if (!this.initialized || !this.pinecone) {
      throw new Error('Knowledge service not initialized');
    }

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Search Pinecone with filter for buy boxes
    const index = this.pinecone.index(this.indexName);
    const results = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      filter: { type: { $eq: 'buybox' } },
    });

    return (results.matches || []).map((match) => ({
      id: match.id,
      text: (match.metadata?.text as string) || '',
      score: match.score || 0,
      metadata: {
        filename: (match.metadata?.filename as string) || 'unknown',
        fileType: (match.metadata?.fileType as string) || 'buybox',
        chunkIndex: (match.metadata?.chunkIndex as number) || 0,
        totalChunks: (match.metadata?.totalChunks as number) || 1,
        fundName: match.metadata?.fundName as string,
        buyBoxId: match.metadata?.buyBoxId as string,
      },
    }));
  }
}

export const knowledgeService = new KnowledgeService();
export default knowledgeService;
