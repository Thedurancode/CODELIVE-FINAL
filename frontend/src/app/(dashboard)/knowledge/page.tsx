'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Upload,
  Search,
  FileText,
  File,
  Trash2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useDocuments, useUploadDocument, useDeleteDocument, useSearchKnowledge } from '@/hooks/use-knowledge';
import { toast } from 'sonner';

interface Document {
  id: string;
  name: string;
  type: string;
  chunks: number;
  createdAt: string;
}

interface SearchResult {
  id: string;
  documentName: string;
  snippet: string;
  score: number;
}

const fileIcons: Record<string, typeof FileText> = {
  pdf: FileText,
  txt: File,
  doc: FileText,
};

export default function KnowledgePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documents, isLoading, error, refetch } = useDocuments();
  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();
  const searchKnowledge = useSearchKnowledge();

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const searchResults = await searchKnowledge.mutateAsync(searchQuery);
      setResults(searchResults);
    } catch {
      toast.error('Search failed');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument.mutateAsync(file);
      toast.success('Document uploaded successfully');
    } catch {
      toast.error('Failed to upload document');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument.mutateAsync(id);
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">Search and manage your indexed documents</p>
        </div>
        <Card className="bg-card border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load documents</p>
            <p className="text-muted-foreground mb-4">{(error as Error).message}</p>
            <Button onClick={() => refetch()} variant="outline" className="border">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Knowledge Base</h1>
        <p className="text-muted-foreground mt-1">Search and manage your indexed documents</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Documents */}
        <Card className="bg-card border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground">Documents</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border text-foreground"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                accept=".pdf,.txt,.doc,.docx"
                className="hidden"
              />
              <Button
                size="sm"
                className="bg-accent-600 hover:bg-accent-700 text-white"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadDocument.isPending}
              >
                {uploadDocument.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (documents || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No documents uploaded yet</p>
                  <Button
                    variant="link"
                    className="text-accent-400 mt-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload your first document
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(documents || []).map((doc: Document) => {
                    const Icon = fileIcons[doc.type] || File;
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded bg-zinc-700">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.chunks} chunks | {doc.createdAt}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                          onClick={() => handleDelete(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Search */}
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground">Search</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search knowledge base..."
                className="bg-secondary border text-foreground"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button
                onClick={handleSearch}
                disabled={searchKnowledge.isPending}
                className="bg-accent-600 hover:bg-accent-700 text-white"
              >
                {searchKnowledge.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            <ScrollArea className="h-[450px]">
              {searchKnowledge.isPending ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-3">
                  {results.map((result) => (
                    <div
                      key={result.id}
                      className="p-4 rounded-lg bg-secondary/50 border border"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">
                            {result.documentName}
                          </span>
                        </div>
                        <Badge variant="outline" className="border-accent-500/50 text-accent-400">
                          {(result.score * 100).toFixed(0)}% match
                        </Badge>
                      </div>
                      <p
                        className="text-sm text-muted-foreground"
                        dangerouslySetInnerHTML={{
                          __html: result.snippet.replace(
                            /\*\*(.*?)\*\*/g,
                            '<span class="text-foreground font-medium">$1</span>'
                          ),
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-accent-400 hover:text-accent-300"
                      >
                        <ExternalLink className="mr-2 h-3 w-3" />
                        View Full Document
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Search className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Enter a search query to find relevant documents
                  </p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
