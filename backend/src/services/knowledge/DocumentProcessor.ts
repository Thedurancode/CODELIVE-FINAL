/**
 * Document Processor
 *
 * Handles extraction of text from various file types:
 * - PDF (digital and scanned with OCR)
 * - Images (JPG, PNG, TIFF, BMP, GIF, WebP)
 * - Word documents (DOCX, DOC)
 * - Excel spreadsheets (XLSX, XLS, CSV)
 * - Text files (TXT, MD, JSON, XML, HTML)
 */

import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';

// Note: pdf-parse is imported dynamically to prevent it from polluting global JSON.parse
// See processPDF() method for dynamic import

export interface ProcessedDocument {
  filename: string;
  filepath: string;
  fileType: string;
  content: string;
  metadata: {
    pages?: number;
    words: number;
    characters: number;
    processedAt: Date;
    ocrUsed?: boolean;
    sheets?: string[];
  };
}

export interface ChunkedDocument extends ProcessedDocument {
  chunks: DocumentChunk[];
}

export interface DocumentChunk {
  id: string;
  text: string;
  chunkIndex: number;
  totalChunks: number;
  metadata: {
    filename: string;
    fileType: string;
    page?: number;
    sheet?: string;
  };
}

// Supported file extensions
const SUPPORTED_EXTENSIONS = {
  pdf: ['.pdf'],
  image: ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif', '.webp'],
  word: ['.docx', '.doc'],
  excel: ['.xlsx', '.xls', '.csv'],
  text: ['.txt', '.md', '.json', '.xml', '.html', '.htm', '.log', '.yaml', '.yml'],
};

export class DocumentProcessor {
  private tesseractWorker: Tesseract.Worker | null = null;
  private chunkSize: number;
  private chunkOverlap: number;
  private allowedBasePaths: string[];

  constructor(options?: { chunkSize?: number; chunkOverlap?: number; allowedBasePaths?: string[] }) {
    this.chunkSize = options?.chunkSize || 1000; // characters per chunk
    this.chunkOverlap = options?.chunkOverlap || 200; // overlap between chunks
    // Default allowed paths - knowledge directory and uploads
    this.allowedBasePaths = options?.allowedBasePaths || [
      path.resolve(__dirname, '../../../knowledge'),
      path.resolve(__dirname, '../../../uploads'),
      '/tmp',
    ];
  }

  /**
   * Validate file path to prevent path traversal attacks
   */
  private validateFilePath(filepath: string): void {
    const resolvedPath = path.resolve(filepath);

    // Check if the resolved path is within allowed directories
    const isAllowed = this.allowedBasePaths.some(basePath => {
      const resolvedBase = path.resolve(basePath);
      return resolvedPath.startsWith(resolvedBase + path.sep) || resolvedPath === resolvedBase;
    });

    if (!isAllowed) {
      throw new Error(`Access denied: File path outside allowed directories`);
    }

    // Additional check for path traversal attempts
    if (filepath.includes('..') || filepath.includes('\0')) {
      throw new Error('Invalid file path: Path traversal not allowed');
    }
  }

  /**
   * Check if a file type is supported
   */
  isSupported(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    return Object.values(SUPPORTED_EXTENSIONS).flat().includes(ext);
  }

  /**
   * Get the file type category
   */
  getFileType(filepath: string): string {
    const ext = path.extname(filepath).toLowerCase();
    for (const [type, extensions] of Object.entries(SUPPORTED_EXTENSIONS)) {
      if (extensions.includes(ext)) return type;
    }
    return 'unknown';
  }

  /**
   * Process a file and extract text
   */
  async processFile(filepath: string): Promise<ProcessedDocument> {
    // Validate path to prevent path traversal attacks
    this.validateFilePath(filepath);

    const fileType = this.getFileType(filepath);
    const filename = path.basename(filepath);

    let content = '';
    let metadata: ProcessedDocument['metadata'] = {
      words: 0,
      characters: 0,
      processedAt: new Date(),
    };

    switch (fileType) {
      case 'pdf':
        const pdfResult = await this.processPDF(filepath);
        content = pdfResult.content;
        metadata = { ...metadata, ...pdfResult.metadata };
        break;

      case 'image':
        const imageResult = await this.processImage(filepath);
        content = imageResult.content;
        metadata = { ...metadata, ocrUsed: true };
        break;

      case 'word':
        content = await this.processWord(filepath);
        break;

      case 'excel':
        const excelResult = await this.processExcel(filepath);
        content = excelResult.content;
        metadata = { ...metadata, sheets: excelResult.sheets };
        break;

      case 'text':
        content = await this.processText(filepath);
        break;

      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }

    // Calculate word and character counts
    metadata.words = content.split(/\s+/).filter(Boolean).length;
    metadata.characters = content.length;

    return {
      filename,
      filepath,
      fileType,
      content,
      metadata,
    };
  }

  /**
   * Process a PDF file with enhanced OCR support for scanned documents
   */
  private async processPDF(filepath: string): Promise<{ content: string; metadata: Partial<ProcessedDocument['metadata']> }> {
    const dataBuffer = fs.readFileSync(filepath);
    const filename = path.basename(filepath);

    // Save original JSON.parse before loading pdf-parse (it pollutes global namespace)
    const originalJSONParse = JSON.parse;

    try {
      // Dynamic import to prevent startup pollution
      const pdfParse = await import('pdf-parse');
      const PDFParse = pdfParse.PDFParse || pdfParse.default?.PDFParse;

      // Restore JSON.parse immediately after import
      JSON.parse = originalJSONParse;

      if (!PDFParse) {
        throw new Error('PDFParse not found in pdf-parse module');
      }

      // pdf-parse v2.x uses class-based API
      const parser = new PDFParse({ data: dataBuffer });
      const textResult = await parser.getText();

      const extractedText = textResult.text?.trim() || '';
      const pageCount = textResult.total || 1;

      // Calculate text density (chars per page) to detect scanned PDFs
      const charsPerPage = extractedText.length / pageCount;
      const isLikelyScanned = charsPerPage < 100 && pageCount > 0;

      if (isLikelyScanned) {
        console.log(`  PDF "${filename}" appears to be scanned (${charsPerPage.toFixed(0)} chars/page)`);

        // Check if there's a corresponding image file for OCR
        const pngPath = filepath.replace(/\.pdf$/i, '.png');
        const jpgPath = filepath.replace(/\.pdf$/i, '.jpg');

        let ocrText = '';
        if (fs.existsSync(pngPath)) {
          console.log(`  Found companion image for OCR: ${path.basename(pngPath)}`);
          const ocrResult = await this.processImage(pngPath);
          ocrText = ocrResult.content;
        } else if (fs.existsSync(jpgPath)) {
          console.log(`  Found companion image for OCR: ${path.basename(jpgPath)}`);
          const ocrResult = await this.processImage(jpgPath);
          ocrText = ocrResult.content;
        }

        // Use OCR text if available, otherwise use whatever was extracted
        const finalText = ocrText || extractedText;

        await parser.destroy();
        return {
          content: finalText,
          metadata: {
            pages: pageCount,
            ocrUsed: !!ocrText,
          },
        };
      }

      await parser.destroy();
      return {
        content: extractedText,
        metadata: { pages: pageCount },
      };
    } catch (error) {
      // Always restore JSON.parse even on error
      JSON.parse = originalJSONParse;

      // Fallback: try to find and use companion image
      const pngPath = filepath.replace(/\.pdf$/i, '.png');
      const jpgPath = filepath.replace(/\.pdf$/i, '.jpg');

      if (fs.existsSync(pngPath)) {
        console.log(`  PDF parse failed, using OCR on companion image: ${path.basename(pngPath)}`);
        const ocrResult = await this.processImage(pngPath);
        return {
          content: ocrResult.content,
          metadata: { ocrUsed: true },
        };
      } else if (fs.existsSync(jpgPath)) {
        console.log(`  PDF parse failed, using OCR on companion image: ${path.basename(jpgPath)}`);
        const ocrResult = await this.processImage(jpgPath);
        return {
          content: ocrResult.content,
          metadata: { ocrUsed: true },
        };
      }

      console.error(`Error processing PDF ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Process an image file with OCR
   */
  private async processImage(filepath: string): Promise<{ content: string }> {
    try {
      const result = await Tesseract.recognize(filepath, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            // Progress logging if needed
          }
        },
      });

      return { content: result.data.text };
    } catch (error) {
      console.error(`Error processing image ${filepath}:`, error);
      throw error;
    }
  }

  /**
   * Process a Word document
   */
  private async processWord(filepath: string): Promise<string> {
    const ext = path.extname(filepath).toLowerCase();

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filepath });
      return result.value;
    } else {
      // .doc files are harder to parse, try reading as binary
      // For full .doc support, would need antiword or similar
      throw new Error('.doc files require additional setup. Please convert to .docx');
    }
  }

  /**
   * Process an Excel/CSV file
   */
  private async processExcel(filepath: string): Promise<{ content: string; sheets: string[] }> {
    const workbook = XLSX.readFile(filepath);
    const sheets: string[] = [];
    const contentParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      sheets.push(sheetName);
      const worksheet = workbook.Sheets[sheetName];

      // Convert to CSV for text representation
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      contentParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    }

    return {
      content: contentParts.join('\n\n'),
      sheets,
    };
  }

  /**
   * Process a text file
   */
  private async processText(filepath: string): Promise<string> {
    return fs.readFileSync(filepath, 'utf-8');
  }

  /**
   * Chunk a document into smaller pieces for embedding
   */
  chunkDocument(doc: ProcessedDocument): ChunkedDocument {
    const chunks: DocumentChunk[] = [];
    const text = doc.content;

    // Split by paragraphs first, then by sentences if needed
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed chunk size
      if (currentChunk.length + paragraph.length > this.chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(this.createChunk(doc, currentChunk, chunkIndex));
        chunkIndex++;

        // Start new chunk with overlap from previous
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.floor(this.chunkOverlap / 5)); // ~5 chars per word avg
        currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(doc, currentChunk, chunkIndex));
    }

    // Update total chunks count
    const totalChunks = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalChunks = totalChunks;
    });

    return {
      ...doc,
      chunks,
    };
  }

  private createChunk(doc: ProcessedDocument, text: string, index: number): DocumentChunk {
    return {
      id: `${doc.filename}-chunk-${index}`,
      text: text.trim(),
      chunkIndex: index,
      totalChunks: 0, // Will be updated later
      metadata: {
        filename: doc.filename,
        fileType: doc.fileType,
      },
    };
  }

  /**
   * Get list of supported extensions (static)
   */
  static getSupportedExtensions(): string[] {
    return Object.values(SUPPORTED_EXTENSIONS).flat();
  }

  /**
   * Get list of supported extensions (instance)
   */
  getSupportedExtensions(): string[] {
    return DocumentProcessor.getSupportedExtensions();
  }

  /**
   * Chunk raw text directly (for buy boxes and other text content)
   */
  chunkText(text: string, metadata: { filename: string; fileType: string }): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > this.chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `${metadata.filename}-chunk-${chunkIndex}`,
          text: currentChunk.trim(),
          chunkIndex,
          totalChunks: 0,
          metadata,
        });
        chunkIndex++;
        // Keep overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.chunkOverlap / 5));
        currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    // Add remaining text
    if (currentChunk.trim()) {
      chunks.push({
        id: `${metadata.filename}-chunk-${chunkIndex}`,
        text: currentChunk.trim(),
        chunkIndex,
        totalChunks: 0,
        metadata,
      });
    }

    // Update total chunks count
    const totalChunks = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalChunks = totalChunks;
    });

    return chunks;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}

export default DocumentProcessor;
