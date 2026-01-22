'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Github,
  FileCode,
  Folder,
  FolderOpen,
  File,
  GitCommit,
  GitBranch,
  GitPullRequest,
  ChevronRight,
  ExternalLink,
  Loader2,
  FileText,
  ArrowLeft,
  Copy,
  Check,
  Clock,
  User,
  GitMerge,
  CircleDot,
  MessageSquare,
} from 'lucide-react';
import {
  useGitHubContents,
  useGitHubCommits,
  useGitHubBranches,
  useGitHubReadme,
  useGitHubFileContent,
  useGitHubPullRequests,
  parseGitHubUrl,
  type GitHubContentItem,
  type GitHubCommit,
  type GitHubPullRequest,
} from '@/hooks/use-github-repo';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface GitHubRepoPanelProps {
  githubUrl: string;
}

// File icon based on extension
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  const codeExts = ['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs'];
  const docExts = ['md', 'txt', 'rst', 'doc', 'docx'];

  if (codeExts.includes(ext || '')) {
    return <FileCode className="h-4 w-4 text-blue-400" />;
  }
  if (docExts.includes(ext || '')) {
    return <FileText className="h-4 w-4 text-green-400" />;
  }
  return <File className="h-4 w-4 text-muted-foreground" />;
}

// Get language from file extension for syntax highlighting
function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    dockerfile: 'dockerfile',
  };
  return langMap[ext || ''] || 'text';
}

// Format date relative
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

// File Browser Component
function FileBrowser({
  owner,
  repo,
  branch,
  onFileSelect,
}: {
  owner: string;
  repo: string;
  branch: string;
  onFileSelect: (path: string) => void;
}) {
  const [currentPath, setCurrentPath] = useState('');
  const { data: contents, isLoading } = useGitHubContents(owner, repo, currentPath, branch);

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    return [{ name: repo, path: '' }, ...parts.map((part, i) => ({
      name: part,
      path: parts.slice(0, i + 1).join('/'),
    }))];
  }, [currentPath, repo]);

  const handleItemClick = (item: GitHubContentItem) => {
    if (item.type === 'dir') {
      setCurrentPath(item.path);
    } else {
      onFileSelect(item.path);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground px-2 py-1 bg-secondary/50 rounded">
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb.path} className="flex items-center">
            {i > 0 && <ChevronRight className="h-3 w-3 mx-1" />}
            <button
              onClick={() => setCurrentPath(crumb.path)}
              className={`hover:text-foreground transition-colors ${
                i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''
              }`}
            >
              {i === 0 ? <Folder className="h-4 w-4 inline mr-1" /> : null}
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* File List */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-0.5">
          {currentPath && (
            <button
              onClick={() => {
                const parts = currentPath.split('/');
                parts.pop();
                setCurrentPath(parts.join('/'));
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/80 rounded text-sm text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              ..
            </button>
          )}
          {contents?.map((item) => (
            <button
              key={item.sha}
              onClick={() => handleItemClick(item)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/80 rounded text-sm group"
            >
              {item.type === 'dir' ? (
                <FolderOpen className="h-4 w-4 text-amber-400" />
              ) : (
                getFileIcon(item.name)
              )}
              <span className="flex-1 text-left truncate">{item.name}</span>
              {item.type === 'file' && item.size && (
                <span className="text-xs text-muted-foreground">
                  {item.size < 1024
                    ? `${item.size} B`
                    : item.size < 1024 * 1024
                    ? `${(item.size / 1024).toFixed(1)} KB`
                    : `${(item.size / 1024 / 1024).toFixed(1)} MB`}
                </span>
              )}
              {item.type === 'dir' && (
                <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// File Viewer Component
function FileViewer({
  owner,
  repo,
  path,
  branch,
  onBack,
}: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { data: file, isLoading, error } = useGitHubFileContent(owner, repo, path, branch);
  const filename = path.split('/').pop() || path;
  const language = getLanguage(filename);
  const isMarkdown = filename.toLowerCase().endsWith('.md');

  const handleCopy = async () => {
    if (file?.content) {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400">Failed to load file</p>
        <Button variant="outline" size="sm" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to files
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-secondary/50 rounded">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {getFileIcon(filename)}
          <span className="text-sm font-medium">{filename}</span>
          <Badge variant="outline" className="text-xs">
            {language}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-7 px-2"
          >
            <a
              href={`https://github.com/${owner}/${repo}/blob/${branch}/${path}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="h-[400px] border rounded">
        {isMarkdown ? (
          <div className="p-4 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{file?.content || ''}</ReactMarkdown>
          </div>
        ) : (
          <pre className="p-4 text-sm font-mono overflow-x-auto">
            <code>{file?.content}</code>
          </pre>
        )}
      </ScrollArea>
    </div>
  );
}

// Commits List Component
function CommitsList({ owner, repo, branch }: { owner: string; repo: string; branch: string }) {
  const { data: commits, isLoading } = useGitHubCommits(owner, repo, {
    sha: branch,
    perPage: 20,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-[450px]">
      <div className="space-y-1">
        {commits?.map((commit) => (
          <a
            key={commit.sha}
            href={commit.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 hover:bg-secondary/80 rounded border border-transparent hover:border-border transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="shrink-0">
                {commit.author.avatarUrl ? (
                  <img
                    src={commit.author.avatarUrl}
                    alt={commit.author.name}
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {commit.message.split('\n')[0]}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">
                    {commit.author.login || commit.author.name}
                  </span>
                  <span>committed</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeDate(commit.author.date)}
                  </span>
                </div>
              </div>

              {/* SHA */}
              <div className="shrink-0">
                <Badge variant="outline" className="font-mono text-xs">
                  {commit.shortSha}
                </Badge>
              </div>
            </div>
          </a>
        ))}
      </div>
    </ScrollArea>
  );
}

// README Component
function ReadmeViewer({ owner, repo, branch }: { owner: string; repo: string; branch: string }) {
  const { data: readme, isLoading } = useGitHubReadme(owner, repo, branch);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!readme) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No README found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[450px]">
      <div className="p-4 prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme.content}</ReactMarkdown>
      </div>
    </ScrollArea>
  );
}

// Pull Requests List Component
function PullRequestsList({ owner, repo }: { owner: string; repo: string }) {
  const [prState, setPrState] = useState<'open' | 'closed' | 'all'>('open');
  const { data: pullRequests, isLoading } = useGitHubPullRequests(owner, repo, {
    state: prState,
    perPage: 20,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 px-1">
        <Button
          variant={prState === 'open' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setPrState('open')}
          className="h-7"
        >
          <CircleDot className="h-3.5 w-3.5 mr-1.5 text-green-400" />
          Open
        </Button>
        <Button
          variant={prState === 'closed' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setPrState('closed')}
          className="h-7"
        >
          <GitMerge className="h-3.5 w-3.5 mr-1.5 text-purple-400" />
          Closed
        </Button>
        <Button
          variant={prState === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setPrState('all')}
          className="h-7"
        >
          All
        </Button>
      </div>

      <ScrollArea className="h-[420px]">
        {pullRequests?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitPullRequest className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No {prState === 'all' ? '' : prState} pull requests</p>
          </div>
        ) : (
          <div className="space-y-1">
            {pullRequests?.map((pr) => (
              <a
                key={pr.id}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 hover:bg-secondary/80 rounded border border-transparent hover:border-border transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* PR Icon */}
                  <div className="shrink-0 mt-0.5">
                    {pr.mergedAt ? (
                      <GitMerge className="h-5 w-5 text-purple-400" />
                    ) : pr.state === 'closed' ? (
                      <GitPullRequest className="h-5 w-5 text-red-400" />
                    ) : pr.draft ? (
                      <GitPullRequest className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <GitPullRequest className="h-5 w-5 text-green-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {pr.title}
                      </p>
                      {pr.draft && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          Draft
                        </Badge>
                      )}
                    </div>

                    {/* Labels */}
                    {pr.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {pr.labels.map((label) => (
                          <Badge
                            key={label.name}
                            variant="outline"
                            className="text-xs px-1.5 py-0"
                            style={{
                              borderColor: `#${label.color}`,
                              color: `#${label.color}`,
                            }}
                          >
                            {label.name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-foreground/80">#{pr.number}</span>
                        <span>opened</span>
                        <Clock className="h-3 w-3" />
                        <span>{formatRelativeDate(pr.createdAt)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        by
                        {pr.user.avatar_url && (
                          <img
                            src={pr.user.avatar_url}
                            alt={pr.user.login}
                            className="h-4 w-4 rounded-full"
                          />
                        )}
                        <span className="font-medium">{pr.user.login}</span>
                      </span>
                    </div>

                    {/* Branch info */}
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <GitBranch className="h-3 w-3" />
                      <code className="px-1 py-0.5 bg-secondary rounded text-xs">
                        {pr.head.ref}
                      </code>
                      <ChevronRight className="h-3 w-3" />
                      <code className="px-1 py-0.5 bg-secondary rounded text-xs">
                        {pr.base.ref}
                      </code>
                    </div>
                  </div>

                  {/* Reviewers */}
                  {pr.requestedReviewers && pr.requestedReviewers.length > 0 && (
                    <div className="shrink-0 flex -space-x-2">
                      {pr.requestedReviewers.slice(0, 3).map((reviewer) => (
                        <img
                          key={reviewer.login}
                          src={reviewer.avatar_url}
                          alt={reviewer.login}
                          title={reviewer.login}
                          className="h-6 w-6 rounded-full border-2 border-background"
                        />
                      ))}
                      {pr.requestedReviewers.length > 3 && (
                        <div className="h-6 w-6 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-xs">
                          +{pr.requestedReviewers.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// Main Component
export function GitHubRepoPanel({ githubUrl }: GitHubRepoPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('main');

  const repoInfo = parseGitHubUrl(githubUrl);
  const { data: branches } = useGitHubBranches(repoInfo?.owner, repoInfo?.repo);

  // Set default branch when branches load
  useMemo(() => {
    if (branches && branches.length > 0) {
      const main = branches.find((b) => b.name === 'main' || b.name === 'master');
      if (main) {
        setSelectedBranch(main.name);
      }
    }
  }, [branches]);

  if (!repoInfo) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Github className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Invalid GitHub URL</p>
        </CardContent>
      </Card>
    );
  }

  const { owner, repo } = repoInfo;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Github className="h-5 w-5" />
            {owner}/{repo}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Branch Selector */}
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[140px] h-8">
                <GitBranch className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches?.map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    {branch.name}
                    {branch.protected && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        protected
                      </Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* External Link */}
            <Button variant="outline" size="sm" asChild>
              <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="commits" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="commits" className="flex items-center gap-2">
              <GitCommit className="h-4 w-4" />
              Commits
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Files
            </TabsTrigger>
            <TabsTrigger value="pulls" className="flex items-center gap-2">
              <GitPullRequest className="h-4 w-4" />
              Pull Requests
            </TabsTrigger>
            <TabsTrigger value="readme" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              README
            </TabsTrigger>
          </TabsList>

          <TabsContent value="commits">
            <CommitsList owner={owner} repo={repo} branch={selectedBranch} />
          </TabsContent>

          <TabsContent value="files">
            {selectedFile ? (
              <FileViewer
                owner={owner}
                repo={repo}
                path={selectedFile}
                branch={selectedBranch}
                onBack={() => setSelectedFile(null)}
              />
            ) : (
              <FileBrowser
                owner={owner}
                repo={repo}
                branch={selectedBranch}
                onFileSelect={setSelectedFile}
              />
            )}
          </TabsContent>

          <TabsContent value="pulls">
            <PullRequestsList owner={owner} repo={repo} />
          </TabsContent>

          <TabsContent value="readme">
            <ReadmeViewer owner={owner} repo={repo} branch={selectedBranch} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
