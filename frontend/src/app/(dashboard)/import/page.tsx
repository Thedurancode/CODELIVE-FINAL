'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileSpreadsheet,
  Link,
  Mail,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useImportCSV, useImportURL, useTestEmailConnection, useSaveEmailConfig } from '@/hooks/use-import';
import { toast } from 'sonner';

export default function ImportPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: boolean; imported: number } | null>(null);
  const [url, setUrl] = useState('');
  const [emailConfig, setEmailConfig] = useState({
    server: '',
    port: '',
    email: '',
    password: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const importCSV = useImportCSV();

  // Cleanup interval on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);
  const importURL = useImportURL();
  const testEmail = useTestEmailConnection();
  const saveEmail = useSaveEmailConfig();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await handleFileUpload(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadProgress(0);
    setImportResult(null);

    // Clear any existing interval to prevent leaks
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    // Simulate progress
    progressIntervalRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      const result = await importCSV.mutateAsync(file);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUploadProgress(100);
      setImportResult({ success: true, imported: result.imported });
      toast.success(`Successfully imported ${result.imported} deals`);
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUploadProgress(0);
      setImportResult(null);
      toast.error('Failed to import CSV');
    }
  };

  const handleURLImport = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      const result = await importURL.mutateAsync(url);
      toast.success(`Imported ${result.imported} deals from URL`);
      setUrl('');
    } catch {
      toast.error('Failed to import from URL');
    }
  };

  const handleTestConnection = async () => {
    try {
      await testEmail.mutateAsync({
        server: emailConfig.server,
        port: parseInt(emailConfig.port) || 993,
        email: emailConfig.email,
        password: emailConfig.password,
      });
      toast.success('Connection successful!');
    } catch {
      toast.error('Connection failed');
    }
  };

  const handleSaveConfig = async () => {
    try {
      await saveEmail.mutateAsync({
        server: emailConfig.server,
        port: parseInt(emailConfig.port) || 993,
        email: emailConfig.email,
        password: emailConfig.password,
      });
      toast.success('Configuration saved');
    } catch {
      toast.error('Failed to save configuration');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Import</h1>
        <p className="text-muted-foreground mt-1">Import deals from various sources</p>
      </div>

      <Tabs defaultValue="csv" className="space-y-6">
        <TabsList className="bg-secondary border">
          <TabsTrigger value="csv" className="data-[state=active]:bg-secondary">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            CSV Upload
          </TabsTrigger>
          <TabsTrigger value="url" className="data-[state=active]:bg-secondary">
            <Link className="mr-2 h-4 w-4" />
            URL Import
          </TabsTrigger>
          <TabsTrigger value="email" className="data-[state=active]:bg-secondary">
            <Mail className="mr-2 h-4 w-4" />
            Email Setup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="csv">
          <Card className="bg-card border">
            <CardHeader>
              <CardTitle className="text-foreground">Upload CSV File</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv"
                className="hidden"
              />
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-accent-500 bg-accent-500/10'
                    : 'border hover:border'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {importCSV.isPending ? (
                  <Loader2 className="h-12 w-12 text-accent-500 mx-auto mb-4 animate-spin" />
                ) : (
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                )}
                <p className="text-lg font-medium text-foreground mb-2">
                  Drop your CSV file here
                </p>
                <p className="text-muted-foreground mb-4">or click to browse</p>
                <Button
                  variant="outline"
                  className="border text-foreground"
                  disabled={importCSV.isPending}
                >
                  Browse Files
                </Button>
              </div>

              {importCSV.isPending && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Uploading...</span>
                    <span className="text-foreground">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {importResult?.success && (
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-green-400">Upload Complete</p>
                    <p className="text-sm text-green-300">
                      {importResult.imported} deals imported successfully
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="url">
          <Card className="bg-card border">
            <CardHeader>
              <CardTitle className="text-foreground">Import from URL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Source URL</Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/deals.csv"
                  className="bg-secondary border text-foreground"
                />
              </div>
              <Button
                onClick={handleURLImport}
                disabled={importURL.isPending}
                className="bg-accent-600 hover:bg-accent-700 text-white"
              >
                {importURL.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze URL'
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card className="bg-card border">
            <CardHeader>
              <CardTitle className="text-foreground">Email Ingestion Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <p className="text-sm text-amber-300">
                  Email ingestion requires IMAP or Gmail API configuration
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">IMAP Server</Label>
                  <Input
                    value={emailConfig.server}
                    onChange={(e) => setEmailConfig({ ...emailConfig, server: e.target.value })}
                    placeholder="imap.gmail.com"
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Port</Label>
                  <Input
                    value={emailConfig.port}
                    onChange={(e) => setEmailConfig({ ...emailConfig, port: e.target.value })}
                    placeholder="993"
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email Address</Label>
                  <Input
                    value={emailConfig.email}
                    onChange={(e) => setEmailConfig({ ...emailConfig, email: e.target.value })}
                    placeholder="deals@company.com"
                    className="bg-secondary border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Password</Label>
                  <Input
                    type="password"
                    value={emailConfig.password}
                    onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })}
                    placeholder="App password"
                    className="bg-secondary border text-foreground"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border text-foreground"
                  onClick={handleTestConnection}
                  disabled={testEmail.isPending}
                >
                  {testEmail.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  disabled={saveEmail.isPending}
                  className="bg-accent-600 hover:bg-accent-700 text-white"
                >
                  {saveEmail.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Configuration'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
