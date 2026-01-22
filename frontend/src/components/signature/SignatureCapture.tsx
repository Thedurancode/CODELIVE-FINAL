'use client';

import { useState, useRef, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Upload, RotateCcw, Check, Loader2, X } from 'lucide-react';

interface SignatureCaptureProps {
  onCapture: (file: File, cleanupStrength: number) => void;
  onCancel?: () => void;
  isUploading?: boolean;
}

/**
 * Signature Capture Component
 *
 * Allows users to capture or upload a photo of their handwritten signature,
 * crop it to the signature region, and submit for processing.
 */
export function SignatureCapture({ onCapture, onCancel, isUploading }: SignatureCaptureProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cleanupStrength, setCleanupStrength] = useState(50);
  const [step, setStep] = useState<'capture' | 'crop' | 'preview'>('capture');
  const [croppedImage, setCroppedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setStep('crop');
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = '';
  }, []);

  // Handle crop complete
  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Create cropped image
  const createCroppedImage = useCallback(async (): Promise<File | null> => {
    if (!imageSrc || !croppedAreaPixels) return null;

    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = croppedAreaPixels.width;
    canvas.height = croppedAreaPixels.height;

    ctx.drawImage(
      image,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    );

    // Get preview URL
    const previewUrl = canvas.toDataURL('image/png');
    setCroppedImage(previewUrl);

    // Convert to file
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const file = new File([blob], 'signature.png', { type: 'image/png' });
        resolve(file);
      }, 'image/png');
    });
  }, [imageSrc, croppedAreaPixels]);

  // Handle crop confirmation
  const handleCropConfirm = useCallback(async () => {
    const file = await createCroppedImage();
    if (file) {
      setStep('preview');
    }
  }, [createCroppedImage]);

  // Handle final submit
  const handleSubmit = useCallback(async () => {
    const file = await createCroppedImage();
    if (file) {
      onCapture(file, cleanupStrength);
    }
  }, [createCroppedImage, cleanupStrength, onCapture]);

  // Reset to capture step
  const handleReset = useCallback(() => {
    setImageSrc(null);
    setCroppedImage(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setStep('capture');
  }, []);

  // Capture step - show camera/upload buttons
  if (step === 'capture') {
    return (
      <Card className="bg-card border">
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-medium text-foreground">Upload Your Signature</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Take a photo or upload an image of your handwritten signature on white paper
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              {/* Camera capture - mobile friendly */}
              <Button
                variant="outline"
                size="lg"
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 sm:flex-none"
              >
                <Camera className="mr-2 h-5 w-5" />
                Take Photo
              </Button>

              {/* File upload */}
              <Button
                variant="outline"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 sm:flex-none"
              >
                <Upload className="mr-2 h-5 w-5" />
                Upload Image
              </Button>
            </div>

            {/* Hidden inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="text-xs text-muted-foreground text-center">
              <p>Tips for best results:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Use a dark pen on white paper</li>
                <li>Good lighting, avoid shadows</li>
                <li>Sign clearly within the frame</li>
              </ul>
            </div>

            {onCancel && (
              <div className="pt-4 border-t">
                <Button variant="ghost" onClick={onCancel} className="w-full">
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Crop step - show cropper
  if (step === 'crop' && imageSrc) {
    return (
      <Card className="bg-card border">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-medium text-foreground">Crop to Signature</h3>
              <p className="text-sm text-muted-foreground">
                Drag and zoom to select just your signature
              </p>
            </div>

            {/* Cropper container */}
            <div className="relative w-full h-64 sm:h-80 bg-secondary rounded-lg overflow-hidden">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={3 / 1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            {/* Zoom control */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground w-12">Zoom</span>
              <Slider
                value={[zoom]}
                onValueChange={([value]) => setZoom(value)}
                min={1}
                max={3}
                step={0.1}
                className="flex-1"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" />
                Start Over
              </Button>
              <Button onClick={handleCropConfirm} className="flex-1">
                <Check className="mr-2 h-4 w-4" />
                Confirm Crop
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Preview step - show cropped image and cleanup slider
  if (step === 'preview' && croppedImage) {
    return (
      <Card className="bg-card border">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-medium text-foreground">Preview & Adjust</h3>
              <p className="text-sm text-muted-foreground">
                Review your signature and adjust cleanup if needed
              </p>
            </div>

            {/* Preview */}
            <div className="p-4 bg-white rounded-lg border">
              <img
                src={croppedImage}
                alt="Signature preview"
                className="w-full h-auto max-h-32 object-contain"
              />
            </div>

            {/* Cleanup strength slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Cleanup Strength</span>
                <span className="text-sm text-muted-foreground">{cleanupStrength}%</span>
              </div>
              <Slider
                value={[cleanupStrength]}
                onValueChange={([value]) => setCleanupStrength(value)}
                min={0}
                max={100}
                step={10}
              />
              <p className="text-xs text-muted-foreground">
                Higher values remove more background but may thin the signature
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} disabled={isUploading} className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" />
                Start Over
              </Button>
              <Button onClick={handleSubmit} disabled={isUploading} className="flex-1">
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Save Signature
                  </>
                )}
              </Button>
            </div>

            {onCancel && !isUploading && (
              <Button variant="ghost" onClick={onCancel} className="w-full">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

export default SignatureCapture;
