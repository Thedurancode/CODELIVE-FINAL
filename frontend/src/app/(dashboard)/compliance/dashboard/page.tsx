'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useComplianceDashboard,
  useBulkComplianceCheck,
  useConfiguredStates,
  BulkCheckResult,
} from '@/hooks/use-compliance-rules';
import { toast } from 'sonner';
import {
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  FileText,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

export default function ComplianceDashboardPage() {
  const { data: stats, isLoading, refetch } = useComplianceDashboard();
  const { data: states } = useConfiguredStates();
  const bulkCheck = useBulkComplianceCheck();

  const [selectedState, setSelectedState] = useState<string>('all');
  const [uncheckedOnly, setUncheckedOnly] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkCheckResult | null>(null);
  const [showResultsDialog, setShowResultsDialog] = useState(false);

  const handleBulkCheck = async () => {
    try {
      const params: { state?: string; uncheckedOnly?: boolean } = {};
      if (selectedState !== 'all') params.state = selectedState;
      if (uncheckedOnly) params.uncheckedOnly = true;

      const result = await bulkCheck.mutateAsync(params);
      setBulkResults(result);
      setShowResultsDialog(true);
      toast.success(`Checked ${result.checked} properties`);
      refetch();
    } catch {
      toast.error('Bulk check failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = stats?.summary || {
    total: 0,
    passed: 0,
    failed: 0,
    unchecked: 0,
    passRate: 0,
    criticalIssues: 0,
    warningIssues: 0,
    infoIssues: 0,
    totalRules: 0,
  };

  const issuesByState = stats?.issuesByState || {};
  const issuesByCategory = stats?.issuesByCategory || {};
  const recentChecks = stats?.recentChecks || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/compliance">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Rules
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6 text-accent-500" />
              Compliance Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor compliance status across all properties
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="border text-foreground"
          onClick={() => refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Properties</p>
                <p className="text-3xl font-bold text-foreground mt-1">{summary.total}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-accent-500/20 flex items-center justify-center">
                <FileText className="h-6 w-6 text-accent-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pass Rate</p>
                <p className="text-3xl font-bold text-foreground mt-1">{summary.passRate}%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
            <Progress value={summary.passRate} className="mt-3 h-2" />
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical Issues</p>
                <p className="text-3xl font-bold text-red-500 mt-1">{summary.criticalIssues}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unchecked</p>
                <p className="text-3xl font-bold text-muted-foreground mt-1">{summary.unchecked}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-zinc-700/50 flex items-center justify-center">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <span className="text-foreground font-medium">Passed</span>
            </div>
            <p className="text-4xl font-bold text-emerald-500">{summary.passed}</p>
            <p className="text-sm text-muted-foreground mt-1">properties compliant</p>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldX className="h-5 w-5 text-red-500" />
              <span className="text-foreground font-medium">Failed</span>
            </div>
            <p className="text-4xl font-bold text-red-500">{summary.failed}</p>
            <p className="text-sm text-muted-foreground mt-1">properties with issues</p>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <span className="text-foreground font-medium">Warnings</span>
            </div>
            <p className="text-4xl font-bold text-amber-500">{summary.warningIssues}</p>
            <p className="text-sm text-muted-foreground mt-1">warning-level issues</p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Check Section */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Play className="h-5 w-5 text-accent-500" />
            Bulk Compliance Check
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm text-muted-foreground mb-2 block">Filter by State</label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger className="bg-secondary border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-secondary border">
                  <SelectItem value="all">All States</SelectItem>
                  {states?.filter((state): state is string => !!state).filter((state, index, arr) => arr.indexOf(state) === index).map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="uncheckedOnly"
                checked={uncheckedOnly}
                onChange={(e) => setUncheckedOnly(e.target.checked)}
                className="rounded border bg-secondary"
              />
              <label htmlFor="uncheckedOnly" className="text-sm text-foreground">
                Unchecked properties only
              </label>
            </div>

            <Button
              className="bg-accent-600 hover:bg-accent-700 text-white"
              onClick={handleBulkCheck}
              disabled={bulkCheck.isPending}
            >
              {bulkCheck.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Bulk Check
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Issues by State */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground">Issues by State</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(issuesByState).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No compliance data yet</p>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {Object.entries(issuesByState)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([state, issues]) => (
                    <div
                      key={state}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="border text-foreground">
                          {state}
                        </Badge>
                        <span className="text-muted-foreground text-sm">{issues.total} issues</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {issues.critical > 0 && (
                          <Badge variant="outline" className="border-red-500 text-red-500">
                            {issues.critical} critical
                          </Badge>
                        )}
                        {issues.warning > 0 && (
                          <Badge variant="outline" className="border-amber-500 text-amber-500">
                            {issues.warning} warning
                          </Badge>
                        )}
                        {issues.info > 0 && (
                          <Badge variant="outline" className="border-accent-500 text-accent-500">
                            {issues.info} info
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardHeader>
            <CardTitle className="text-foreground">Issues by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(issuesByCategory).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No compliance data yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(issuesByCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, count]) => (
                    <div
                      key={category}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <span className="text-foreground capitalize">{category}</span>
                      <Badge variant="outline" className="border text-foreground">
                        {count}
                      </Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Checks */}
      <Card className="bg-card border">
        <CardHeader>
          <CardTitle className="text-foreground">Recent Compliance Checks</CardTitle>
        </CardHeader>
        <CardContent>
          {recentChecks.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No recent checks</p>
          ) : (
            <div className="space-y-2">
              {recentChecks.map((check, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                >
                  <div className="flex items-center gap-3">
                    {check.status === 'passed' && (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    )}
                    {check.status === 'warning' && (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    )}
                    {check.status === 'critical' && (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <Link
                        href={`/deals/${check.propertyId}`}
                        className="text-foreground hover:text-accent-400"
                      >
                        Property #{check.propertyId}
                      </Link>
                      <span className="text-muted-foreground ml-2">({check.state})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {check.issues} issue{check.issues !== 1 ? 's' : ''}
                    </span>
                    {check.ocr && (
                      <Badge
                        variant="outline"
                        className={
                          check.ocr.success
                            ? 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10'
                            : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                        }
                      >
                        {check.ocr.success
                          ? `OCR ${Math.round((check.ocr.confidence || 0) * 100)}%`
                          : 'OCR failed'}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(check.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Check Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="bg-card border max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Bulk Check Results</DialogTitle>
          </DialogHeader>

          {bulkResults && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-secondary">
                  <p className="text-2xl font-bold text-foreground">{bulkResults.checked}</p>
                  <p className="text-sm text-muted-foreground">Checked</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-emerald-500/20">
                  <p className="text-2xl font-bold text-emerald-500">{bulkResults.passed}</p>
                  <p className="text-sm text-muted-foreground">Passed</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-red-500/20">
                  <p className="text-2xl font-bold text-red-500">{bulkResults.failed}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>

              {bulkResults.limited && (
                <div className="p-3 rounded-lg bg-amber-500/20 border border-amber-500/50">
                  <p className="text-amber-500 text-sm flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Limited to 100 properties. {bulkResults.total - bulkResults.checked} remaining.
                  </p>
                </div>
              )}

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {bulkResults.results.map((result) => (
                  <div
                    key={result.propertyId}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary"
                  >
                    <div className="flex items-center gap-3">
                      {result.status === 'passed' && (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      )}
                      {result.status === 'warning' && (
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                      )}
                      {result.status === 'critical' && (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className="text-foreground text-sm">{result.address}</p>
                        <p className="text-xs text-muted-foreground">{result.state}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.criticalCount > 0 && (
                        <Badge variant="outline" className="border-red-500 text-red-500">
                          {result.criticalCount} critical
                        </Badge>
                      )}
                      {result.warningCount > 0 && (
                        <Badge variant="outline" className="border-amber-500 text-amber-500">
                          {result.warningCount} warning
                        </Badge>
                      )}
                      {result.status === 'passed' && (
                        <Badge variant="outline" className="border-emerald-500 text-emerald-500">
                          Passed
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
