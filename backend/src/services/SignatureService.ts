import sharp from 'sharp';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { Contact, SignatureRequest, Organization } from '../models';
import { twilioSmsService } from './TwilioSmsService';

/**
 * Signature Service
 *
 * Handles signature request creation, image processing, storage, and retrieval.
 * Signatures are stored in Supabase Storage with signed URL access.
 */

// =============================================================================
// TYPES
// =============================================================================

interface SignatureProcessingOptions {
  cleanupStrength?: number; // 0-100, default 50 - controls background removal aggressiveness
  preserveColor?: boolean; // Keep original ink color (blue/black) instead of converting to pure black
  smoothEdges?: boolean; // Apply anti-aliasing for smooth edges (default: true)
  removeNoise?: boolean; // Remove small specks/noise (default: true)
  autoThreshold?: boolean; // Use automatic threshold detection (default: true)
  strokeWidth?: 'thin' | 'normal' | 'bold'; // Adjust stroke thickness
}

interface CreateSignatureRequestResult {
  success: boolean;
  request?: SignatureRequest;
  signatureUrl?: string;
  error?: string;
}

interface ProcessSignatureResult {
  success: boolean;
  storageKey?: string;
  signedUrl?: string;
  error?: string;
}

interface ContactSignatureResult {
  success: boolean;
  hasSignature: boolean;
  signatureUrl?: string;
  signatureUpdatedAt?: Date;
  error?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const BUCKET_NAME = 'photos';
const SIGNATURES_FOLDER = 'signatures';
const DEFAULT_EXPIRY_HOURS = parseInt(process.env.SIGNATURE_REQUEST_EXPIRY_HOURS || '48', 10);
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

// =============================================================================
// SIGNATURE SERVICE
// =============================================================================

class SignatureService {
  /**
   * Create a signature request and optionally send SMS to contact
   */
  async createSignatureRequest(
    contactId: string,
    userId: string,
    organizationId: string,
    options: { sendSms?: boolean } = { sendSms: true }
  ): Promise<CreateSignatureRequestResult> {
    try {
      const { sendSms = true } = options;

      // Get contact
      const contact = await Contact.findByPk(contactId);
      if (!contact) {
        return { success: false, error: 'Contact not found' };
      }

      // Only require phone if sending SMS
      if (sendSms && !contact.phone) {
        return { success: false, error: 'Contact does not have a phone number' };
      }

      // Check if there's already a pending request for this contact
      const existingRequest = await SignatureRequest.findPendingForContact(contactId);
      if (existingRequest) {
        // If not sending SMS, return the existing request URL instead of error
        if (!sendSms) {
          const baseUrl = process.env.SIGNATURE_LINK_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
          const signatureUrl = `${baseUrl}/signature/${existingRequest.token}`;
          return {
            success: true,
            request: existingRequest,
            signatureUrl,
          };
        }
        return { success: false, error: 'A signature request is already pending for this contact' };
      }

      // Generate expiration date
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRY_HOURS);

      // Create the signature request
      const request = await SignatureRequest.create({
        contactId,
        organizationId,
        requestedById: userId,
        expiresAt,
      });

      // Build the signature URL
      const baseUrl = process.env.SIGNATURE_LINK_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
      const signatureUrl = `${baseUrl}/signature/${request.token}`;

      // Send SMS if requested
      if (sendSms && contact.phone) {
        const smsResult = await twilioSmsService.sendSignatureRequestSms(
          contact.phone,
          signatureUrl,
          contact.name
        );

        if (!smsResult.success) {
          // Delete the request if SMS failed
          await request.destroy();
          return { success: false, error: `Failed to send SMS: ${smsResult.error}` };
        }

        // Store SMS message ID in metadata
        await request.update({
          metadata: {
            ...(request.metadata || {}),
            smsMessageId: smsResult.messageId,
            smsSentAt: new Date().toISOString(),
          },
        });
      } else {
        // Mark as link-only request
        await request.update({
          metadata: {
            ...(request.metadata || {}),
            linkOnly: true,
            createdAt: new Date().toISOString(),
          },
        });
      }

      return {
        success: true,
        request,
        signatureUrl,
      };
    } catch (error: any) {
      console.error('[SignatureService] createSignatureRequest error:', error);
      return { success: false, error: error.message || 'Failed to create signature request' };
    }
  }

  /**
   * Get a signature request by token and validate it
   */
  async getRequestByToken(token: string): Promise<{
    success: boolean;
    request?: SignatureRequest;
    contact?: Contact;
    organization?: Organization;
    error?: string;
  }> {
    try {
      const request = await SignatureRequest.findValidByToken(token);
      if (!request) {
        return { success: false, error: 'Invalid or expired signature request' };
      }

      const contact = await Contact.findByPk(request.contactId);
      const organization = await Organization.findByPk(request.organizationId);

      return {
        success: true,
        request,
        contact: contact || undefined,
        organization: organization || undefined,
      };
    } catch (error: any) {
      console.error('[SignatureService] getRequestByToken error:', error);
      return { success: false, error: error.message || 'Failed to get signature request' };
    }
  }

  /**
   * Process and save a signature image
   *
   * Steps:
   * 1. Normalize the image
   * 2. Remove background (make transparent)
   * 3. Upload to Supabase Storage
   * 4. Update the contact record
   * 5. Mark the request as completed
   */
  async processSignature(
    token: string,
    imageBuffer: Buffer,
    options: SignatureProcessingOptions = {}
  ): Promise<ProcessSignatureResult> {
    try {
      // Validate the request
      const requestResult = await this.getRequestByToken(token);
      if (!requestResult.success || !requestResult.request) {
        return { success: false, error: requestResult.error || 'Invalid request' };
      }

      const { request, contact } = requestResult;
      if (!contact) {
        return { success: false, error: 'Contact not found' };
      }

      // Process the image
      const processedBuffer = await this.processSignatureImage(imageBuffer, options);

      // Generate storage key
      const hash = crypto.createHash('md5').update(processedBuffer).digest('hex').substring(0, 8);
      const storageKey = `${SIGNATURES_FOLDER}/${contact.organizationId}/${contact.id}-${hash}.png`;

      // Delete old signature if exists
      if (contact.signatureStorageKey) {
        await this.deleteSignature(contact.signatureStorageKey);
      }

      // Upload to Supabase
      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(storageKey, processedBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('[SignatureService] Upload error:', uploadError);
        return { success: false, error: `Failed to upload signature: ${uploadError.message}` };
      }

      // Update contact with signature info
      await contact.update({
        signatureStorageKey: storageKey,
        signatureUpdatedAt: new Date(),
      });

      // Mark request as completed
      await request.markCompleted();

      // Get signed URL for response
      const signedUrlResult = await this.getSignedUrl(storageKey);

      return {
        success: true,
        storageKey,
        signedUrl: signedUrlResult.signedUrl,
      };
    } catch (error: any) {
      console.error('[SignatureService] processSignature error:', error);
      return { success: false, error: error.message || 'Failed to process signature' };
    }
  }

  /**
   * Process signature image: Professional-grade transparent signature extraction
   *
   * This implementation uses techniques from document image processing research:
   * - Sauvola adaptive local thresholding (handles uneven lighting/shadows)
   * - Contrast-limited adaptive histogram equalization (CLAHE)
   * - Morphological operations for noise removal
   * - Gaussian edge refinement for anti-aliasing
   * - Auto-crop and centering
   * - Shadow/lighting normalization
   */
  private async processSignatureImage(
    buffer: Buffer,
    options: SignatureProcessingOptions = {}
  ): Promise<Buffer> {
    const {
      cleanupStrength = 50,
      preserveColor = false,
      smoothEdges = true,
      removeNoise = true,
      strokeWidth = 'normal',
    } = options;

    try {
      // Step 1: Load image and apply initial preprocessing
      const image = sharp(buffer);
      const metadata = await image.metadata();
      const maxDimension = 1500;

      let processedImage = image;
      if ((metadata.width && metadata.width > maxDimension) || (metadata.height && metadata.height > maxDimension)) {
        processedImage = processedImage.resize(maxDimension, maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Step 2: Shadow removal and lighting normalization
      // Use a large blur to estimate background, then subtract
      const { data: originalData, info } = await processedImage
        .clone()
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const width = info.width;
      const height = info.height;
      const channels = info.channels;
      const pixelCount = width * height;

      // Create grayscale version
      const grayData = new Float32Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        if (channels >= 3) {
          const r = originalData[i * channels];
          const g = originalData[i * channels + 1];
          const b = originalData[i * channels + 2];
          grayData[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        } else {
          grayData[i] = originalData[i];
        }
      }

      // Step 3: Estimate and remove background illumination (shadow removal)
      const backgroundEstimate = this.estimateBackground(grayData, width, height);
      const normalizedGray = new Float32Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        // Normalize by background - this removes shadows and uneven lighting
        const normalized = (grayData[i] / (backgroundEstimate[i] + 1)) * 255;
        normalizedGray[i] = Math.min(255, Math.max(0, normalized));
      }

      // Step 4: Apply contrast enhancement (CLAHE-inspired)
      this.enhanceContrast(normalizedGray, width, height);

      // Step 5: Sauvola adaptive local thresholding
      // This is much better than global Otsu for documents with uneven lighting
      const windowSize = Math.max(15, Math.floor(Math.min(width, height) / 20) | 1);
      const k = 0.2 + (cleanupStrength / 100) * 0.3; // 0.2 to 0.5 based on cleanup strength
      const alphaValues = this.sauvolaThreshold(normalizedGray, width, height, windowSize, k);

      // Step 6: Apply median filter for noise reduction (removes paper texture)
      if (removeNoise) {
        this.medianFilter(alphaValues, width, height, 3);
      }

      // Step 7: Connected component analysis - remove small noise
      if (removeNoise) {
        this.removeSmallComponents(alphaValues, width, height, 12);
      }

      // Step 8: Apply stroke width adjustment
      if (strokeWidth !== 'normal') {
        this.adjustStrokeWidth(alphaValues, width, height, strokeWidth);
      }

      // Step 9: Gaussian blur on alpha for smooth anti-aliased edges
      if (smoothEdges) {
        this.gaussianBlurAlpha(alphaValues, width, height, 1.2);
      }

      // Step 10: Find bounding box and auto-crop
      const bounds = this.findBoundingBox(alphaValues, width, height);
      const padding = 20;
      const cropX = Math.max(0, bounds.minX - padding);
      const cropY = Math.max(0, bounds.minY - padding);
      const cropWidth = Math.min(width - cropX, bounds.maxX - bounds.minX + padding * 2);
      const cropHeight = Math.min(height - cropY, bounds.maxY - bounds.minY + padding * 2);

      // Step 11: Build final RGBA pixels (cropped)
      const croppedRgba = Buffer.alloc(cropWidth * cropHeight * 4);

      for (let y = 0; y < cropHeight; y++) {
        for (let x = 0; x < cropWidth; x++) {
          const srcX = cropX + x;
          const srcY = cropY + y;
          const srcIdx = srcY * width + srcX;
          const dstIdx = y * cropWidth + x;

          const alpha = Math.round(alphaValues[srcIdx] * 255);

          if (alpha > 2) { // Small threshold to avoid near-invisible pixels
            if (preserveColor && channels >= 3) {
              const r = originalData[srcIdx * channels];
              const g = originalData[srcIdx * channels + 1];
              const b = originalData[srcIdx * channels + 2];

              // Detect blue ink
              const isBlue = b > r + 15 && b > g + 15 && b > 80;

              if (isBlue) {
                // Preserve and enhance blue
                croppedRgba[dstIdx * 4] = Math.round(Math.min(255, r * 0.4));
                croppedRgba[dstIdx * 4 + 1] = Math.round(Math.min(255, g * 0.4));
                croppedRgba[dstIdx * 4 + 2] = Math.round(Math.min(255, b * 1.3));
              } else {
                // Black ink
                croppedRgba[dstIdx * 4] = 0;
                croppedRgba[dstIdx * 4 + 1] = 0;
                croppedRgba[dstIdx * 4 + 2] = 0;
              }
            } else {
              // Pure black
              croppedRgba[dstIdx * 4] = 0;
              croppedRgba[dstIdx * 4 + 1] = 0;
              croppedRgba[dstIdx * 4 + 2] = 0;
            }
            croppedRgba[dstIdx * 4 + 3] = alpha;
          } else {
            // Transparent
            croppedRgba[dstIdx * 4] = 0;
            croppedRgba[dstIdx * 4 + 1] = 0;
            croppedRgba[dstIdx * 4 + 2] = 0;
            croppedRgba[dstIdx * 4 + 3] = 0;
          }
        }
      }

      // Step 12: Create final PNG
      const outputBuffer = await sharp(croppedRgba, {
        raw: { width: cropWidth, height: cropHeight, channels: 4 },
      })
        .png({ compressionLevel: 9 })
        .toBuffer();

      return outputBuffer;
    } catch (error) {
      console.error('[SignatureService] Image processing error:', error);
      throw error;
    }
  }

  /**
   * Estimate background illumination using morphological opening (large blur)
   * This helps remove shadows and uneven lighting
   */
  private estimateBackground(gray: Float32Array, width: number, height: number): Float32Array {
    const result = new Float32Array(gray.length);
    const windowSize = Math.max(31, Math.floor(Math.min(width, height) / 8) | 1);
    const halfWindow = Math.floor(windowSize / 2);

    // Use a box blur approximation for speed (3 passes = good Gaussian approximation)
    const temp = new Float32Array(gray);

    for (let pass = 0; pass < 3; pass++) {
      // Horizontal pass
      for (let y = 0; y < height; y++) {
        let sum = 0;
        let count = 0;

        // Initialize window
        for (let x = 0; x < Math.min(halfWindow + 1, width); x++) {
          sum += temp[y * width + x];
          count++;
        }

        for (let x = 0; x < width; x++) {
          result[y * width + x] = sum / count;

          // Slide window
          const addX = x + halfWindow + 1;
          const removeX = x - halfWindow;

          if (addX < width) {
            sum += temp[y * width + addX];
            count++;
          }
          if (removeX >= 0) {
            sum -= temp[y * width + removeX];
            count--;
          }
        }
      }

      // Vertical pass
      temp.set(result);
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;

        for (let y = 0; y < Math.min(halfWindow + 1, height); y++) {
          sum += temp[y * width + x];
          count++;
        }

        for (let y = 0; y < height; y++) {
          result[y * width + x] = sum / count;

          const addY = y + halfWindow + 1;
          const removeY = y - halfWindow;

          if (addY < height) {
            sum += temp[addY * width + x];
            count++;
          }
          if (removeY >= 0) {
            sum -= temp[removeY * width + x];
            count--;
          }
        }
      }

      temp.set(result);
    }

    // Take max with original to simulate morphological opening
    for (let i = 0; i < gray.length; i++) {
      result[i] = Math.max(result[i], gray[i] * 0.8);
    }

    return result;
  }

  /**
   * Enhance contrast using local histogram equalization
   */
  private enhanceContrast(gray: Float32Array, width: number, height: number): void {
    // Find min/max excluding outliers
    const sorted = Array.from(gray).sort((a, b) => a - b);
    const lowPercentile = sorted[Math.floor(sorted.length * 0.02)];
    const highPercentile = sorted[Math.floor(sorted.length * 0.98)];
    const range = highPercentile - lowPercentile || 1;

    for (let i = 0; i < gray.length; i++) {
      gray[i] = Math.min(255, Math.max(0, ((gray[i] - lowPercentile) / range) * 255));
    }
  }

  /**
   * Sauvola adaptive local thresholding
   * Better than Otsu for documents with uneven lighting
   * Returns alpha values (0-1)
   */
  private sauvolaThreshold(
    gray: Float32Array,
    width: number,
    height: number,
    windowSize: number,
    k: number
  ): Float32Array {
    const halfWindow = Math.floor(windowSize / 2);
    const result = new Float32Array(gray.length);
    const R = 128; // Dynamic range constant

    // Compute integral image and integral squared image for fast mean/std calculation
    const integral = new Float64Array((width + 1) * (height + 1));
    const integralSq = new Float64Array((width + 1) * (height + 1));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const intIdx = (y + 1) * (width + 1) + (x + 1);
        const val = gray[idx];

        integral[intIdx] = val + integral[intIdx - 1] + integral[intIdx - width - 1] - integral[intIdx - width - 2];
        integralSq[intIdx] = val * val + integralSq[intIdx - 1] + integralSq[intIdx - width - 1] - integralSq[intIdx - width - 2];
      }
    }

    // Calculate local threshold for each pixel
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - halfWindow);
        const y1 = Math.max(0, y - halfWindow);
        const x2 = Math.min(width - 1, x + halfWindow);
        const y2 = Math.min(height - 1, y + halfWindow);

        const count = (x2 - x1 + 1) * (y2 - y1 + 1);

        // Get sum and sumSq from integral images
        const i1 = y1 * (width + 1) + x1;
        const i2 = y1 * (width + 1) + (x2 + 1);
        const i3 = (y2 + 1) * (width + 1) + x1;
        const i4 = (y2 + 1) * (width + 1) + (x2 + 1);

        const sum = integral[i4] - integral[i3] - integral[i2] + integral[i1];
        const sumSq = integralSq[i4] - integralSq[i3] - integralSq[i2] + integralSq[i1];

        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);
        const std = Math.sqrt(Math.max(0, variance));

        // Sauvola formula: T = mean * (1 + k * ((std / R) - 1))
        const threshold = mean * (1 + k * ((std / R) - 1));

        const idx = y * width + x;
        const pixelValue = gray[idx];

        // Calculate alpha with smooth transition
        const distance = threshold - pixelValue;
        const smoothness = 12;
        result[idx] = 1 / (1 + Math.exp(-distance / smoothness));
      }
    }

    return result;
  }

  /**
   * Apply median filter for noise reduction
   */
  private medianFilter(alpha: Float32Array, width: number, height: number, radius: number): void {
    const result = new Float32Array(alpha.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const values: number[] = [];

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              values.push(alpha[ny * width + nx]);
            }
          }
        }

        values.sort((a, b) => a - b);
        result[y * width + x] = values[Math.floor(values.length / 2)];
      }
    }

    alpha.set(result);
  }

  /**
   * Remove small connected components (noise)
   */
  private removeSmallComponents(alpha: Float32Array, width: number, height: number, minSize: number): void {
    const visited = new Uint8Array(alpha.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (alpha[idx] > 0.5 && !visited[idx]) {
          const component: number[] = [];
          const stack = [idx];

          while (stack.length > 0) {
            const current = stack.pop()!;
            if (visited[current]) continue;
            visited[current] = 1;

            if (alpha[current] > 0.5) {
              component.push(current);

              const cx = current % width;
              const cy = Math.floor(current / width);

              // 8-connected neighbors
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const ny = cy + dy;
                  const nx = cx + dx;
                  if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                    stack.push(ny * width + nx);
                  }
                }
              }
            }
          }

          if (component.length < minSize) {
            for (const pixelIdx of component) {
              alpha[pixelIdx] = 0;
            }
          }
        }
      }
    }
  }

  /**
   * Gaussian blur on alpha channel for smooth edges
   */
  private gaussianBlurAlpha(alpha: Float32Array, width: number, height: number, sigma: number): void {
    const kernelSize = Math.ceil(sigma * 3) * 2 + 1;
    const kernel = this.createGaussianKernel(kernelSize, sigma);
    const halfKernel = Math.floor(kernelSize / 2);

    // Separable blur - horizontal then vertical
    const temp = new Float32Array(alpha.length);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;

        for (let k = -halfKernel; k <= halfKernel; k++) {
          const nx = x + k;
          if (nx >= 0 && nx < width) {
            const weight = kernel[k + halfKernel];
            sum += alpha[y * width + nx] * weight;
            weightSum += weight;
          }
        }

        temp[y * width + x] = sum / weightSum;
      }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;

        for (let k = -halfKernel; k <= halfKernel; k++) {
          const ny = y + k;
          if (ny >= 0 && ny < height) {
            const weight = kernel[k + halfKernel];
            sum += temp[ny * width + x] * weight;
            weightSum += weight;
          }
        }

        alpha[y * width + x] = sum / weightSum;
      }
    }
  }

  /**
   * Create 1D Gaussian kernel
   */
  private createGaussianKernel(size: number, sigma: number): Float32Array {
    const kernel = new Float32Array(size);
    const half = Math.floor(size / 2);
    let sum = 0;

    for (let i = 0; i < size; i++) {
      const x = i - half;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      sum += kernel[i];
    }

    // Normalize
    for (let i = 0; i < size; i++) {
      kernel[i] /= sum;
    }

    return kernel;
  }

  /**
   * Find bounding box of signature
   */
  private findBoundingBox(
    alpha: Float32Array,
    width: number,
    height: number
  ): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = width, minY = height, maxX = 0, maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (alpha[y * width + x] > 0.1) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // Handle empty image
    if (minX > maxX || minY > maxY) {
      return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Adjust stroke width using morphological dilation/erosion
   */
  private adjustStrokeWidth(
    alpha: Float32Array,
    width: number,
    height: number,
    mode: 'thin' | 'bold'
  ): void {
    const result = new Float32Array(alpha.length);
    const radius = mode === 'bold' ? 2 : 1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        if (mode === 'bold') {
          // Dilation with circular kernel
          let maxVal = alpha[idx];
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (dx * dx + dy * dy <= radius * radius) {
                const ny = y + dy;
                const nx = x + dx;
                if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                  maxVal = Math.max(maxVal, alpha[ny * width + nx]);
                }
              }
            }
          }
          result[idx] = maxVal;
        } else {
          // Erosion
          let minVal = alpha[idx];
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (dx * dx + dy * dy <= radius * radius) {
                const ny = y + dy;
                const nx = x + dx;
                if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                  minVal = Math.min(minVal, alpha[ny * width + nx]);
                }
              }
            }
          }
          result[idx] = minVal;
        }
      }
    }

    alpha.set(result);
  }

  /**
   * Get signature URL for a contact
   */
  async getContactSignature(contactId: string): Promise<ContactSignatureResult> {
    try {
      const contact = await Contact.findByPk(contactId);
      if (!contact) {
        return { success: false, hasSignature: false, error: 'Contact not found' };
      }

      if (!contact.signatureStorageKey) {
        return { success: true, hasSignature: false };
      }

      const signedUrlResult = await this.getSignedUrl(contact.signatureStorageKey);
      if (!signedUrlResult.signedUrl) {
        return { success: false, hasSignature: true, error: 'Failed to get signature URL' };
      }

      return {
        success: true,
        hasSignature: true,
        signatureUrl: signedUrlResult.signedUrl,
        signatureUpdatedAt: contact.signatureUpdatedAt || undefined,
      };
    } catch (error: any) {
      console.error('[SignatureService] getContactSignature error:', error);
      return { success: false, hasSignature: false, error: error.message || 'Failed to get signature' };
    }
  }

  /**
   * Delete a contact's signature
   */
  async deleteContactSignature(contactId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const contact = await Contact.findByPk(contactId);
      if (!contact) {
        return { success: false, error: 'Contact not found' };
      }

      if (contact.signatureStorageKey) {
        await this.deleteSignature(contact.signatureStorageKey);
      }

      await contact.update({
        signatureStorageKey: null,
        signatureUpdatedAt: null,
      });

      return { success: true };
    } catch (error: any) {
      console.error('[SignatureService] deleteContactSignature error:', error);
      return { success: false, error: error.message || 'Failed to delete signature' };
    }
  }

  /**
   * Delete a signature from storage
   */
  private async deleteSignature(storageKey: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([storageKey]);

      if (error) {
        console.error('[SignatureService] Delete error:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[SignatureService] Delete exception:', error);
      return false;
    }
  }

  /**
   * Get a signed URL for a signature
   */
  private async getSignedUrl(storageKey: string): Promise<{ signedUrl?: string; error?: string }> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS);

      if (error) {
        return { error: error.message };
      }

      return { signedUrl: data.signedUrl };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /**
   * Get signature as base64 for DocuSeal prefill
   */
  async getSignatureBase64(contactId: string): Promise<{ base64?: string; error?: string }> {
    try {
      const contact = await Contact.findByPk(contactId);
      if (!contact || !contact.signatureStorageKey) {
        return { error: 'No signature on file' };
      }

      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .download(contact.signatureStorageKey);

      if (error) {
        return { error: error.message };
      }

      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = `data:image/png;base64,${buffer.toString('base64')}`;

      return { base64 };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /**
   * Get pending signature request for a contact
   */
  async getPendingRequest(contactId: string): Promise<SignatureRequest | null> {
    return SignatureRequest.findPendingForContact(contactId);
  }
}

// Export singleton instance
export const signatureService = new SignatureService();
export default signatureService;
