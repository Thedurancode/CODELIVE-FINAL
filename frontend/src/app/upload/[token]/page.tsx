'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Upload, CheckCircle, AlertCircle, Home, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import Image from 'next/image';

interface PropertyInfo {
  propertyId: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  photoCount: number;
}

export default function PublicUploadPage() {
  const params = useParams();
  const token = params.token as string;

  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    async function fetchPropertyInfo() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/public/photos/${token}`
        );
        const data = await response.json();

        if (data.success) {
          setPropertyInfo(data.data);
        } else {
          setError(data.error || 'Invalid or expired link');
        }
      } catch {
        setError('Failed to load property information');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchPropertyInfo();
    }
  }, [token]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadSuccess(false);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('photos', file);
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/public/photos/${token}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (data.success) {
        setUploadSuccess(true);
        setPropertyInfo((prev) =>
          prev ? { ...prev, photoCount: data.data.totalPhotos } : null
        );
        toast.success(`${data.data.uploadedCount} photo(s) uploaded successfully!`);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }, [token]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
        style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
      >
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
        <div className="relative z-10 animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
        style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
      >
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
        <Card className="relative z-10 w-full max-w-md bg-card/80 border backdrop-blur">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Image
                src="/dispotree-long-inverted.png"
                alt="CodeLive"
                width={200}
                height={48}
                className="h-12 w-auto"
              />
            </div>
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-400">Link Invalid</CardTitle>
            <CardDescription className="text-muted-foreground">{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            This upload link may have expired or is invalid. Please request a new link from the
            property owner.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center p-4"
      style={{ backgroundImage: 'url(/wallpaper.jpg)' }}
    >
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

      <Card className="relative z-10 w-full max-w-lg bg-card/80 border backdrop-blur">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src="/dispotree-long-inverted.png"
              alt="CodeLive"
              width={200}
              height={48}
              className="h-12 w-auto"
            />
          </div>
          <CardTitle className="text-xl text-foreground">Upload Photos</CardTitle>
          <CardDescription className="text-foreground">
            <span className="text-xl font-semibold text-foreground block mb-1">
              {typeof propertyInfo?.address === 'object'
                ? `${(propertyInfo.address as any)?.houseNumber || ''} ${(propertyInfo.address as any)?.street || ''}`.trim()
                : propertyInfo?.address}
            </span>
            <span className="text-base text-muted-foreground">
              {propertyInfo?.city}, {propertyInfo?.state} {propertyInfo?.zip}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {uploadSuccess && (
            <div className="flex items-center gap-3 p-4 bg-green-900/30 border border-green-700 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-400">Photos uploaded successfully!</p>
                <p className="text-sm text-green-500">
                  Total photos for this property: {propertyInfo?.photoCount}
                </p>
              </div>
            </div>
          )}

          <div
            className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
              dragActive
                ? 'border-green-500 bg-green-900/20'
                : 'border hover:border-green-500 hover:bg-secondary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />

            <div className="text-center">
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
                  <p className="text-green-400 font-medium">Uploading photos...</p>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-green-500" />
                  </div>
                  <p className="text-foreground font-medium mb-1">
                    Drag & drop photos here
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                  <Button variant="outline" className="pointer-events-none border bg-secondary/50 text-foreground">
                    <Upload className="h-4 w-4 mr-2" />
                    Select Photos
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>Supported formats: JPG, PNG, HEIC, WebP</p>
            <p>Maximum 20 photos per upload</p>
          </div>

          {propertyInfo && propertyInfo.photoCount > 0 && (
            <div className="text-center text-sm text-muted-foreground border-t border pt-4">
              <p>This property currently has {propertyInfo.photoCount} photo(s)</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
