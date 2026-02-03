/**
 * AutomakerPanel
 *
 * Panel for managing Automaker AI agents within a project.
 * Allows creating tasks, viewing running agents, and controlling execution.
 * Includes real-time agent output viewing.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Play,
  Square,
  Loader2,
  ExternalLink,
  Trash2,
  RefreshCw,
  Zap,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Terminal,
  X,
  Maximize2,
  Minimize2,
  FolderOpen,
  Settings,
  Brain,
  Sparkles,
  ListTodo,
  Wand2,
  BookOpen,
  Lightbulb,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useAutomakerHealth,
  useAutomakerRunningAgents,
  useAutomakerFeatures,
  useCreateAutomakerFeature,
  useRunAutomakerFeature,
  useStopAutomakerFeature,
  useDeleteAutomakerFeature,
  useAutomakerAgentOutput,
  useAutomakerRawOutput,
  // AI Planning hooks
  useGenerateTitle,
  useAnalyzeProject,
  useProjectAnalysis,
  useGenerateBacklogPlan,
  useApplyBacklogPlan,
  useGenerateSpec,
  useGenerateSuggestions,
  useEnhancePrompt,
} from '@/hooks/use-automaker';
import { useAutomakerSuggestions } from '@/hooks/use-automaker-websocket';

interface AutomakerPanelProps {
  projectPath: string;
  projectTitle?: string;
  className?: string;
}

export function AutomakerPanel({
  projectPath: initialProjectPath,
  projectTitle,
  className,
}: AutomakerPanelProps) {
  const [projectPath, setProjectPath] = useState(initialProjectPath);
  const [showPathInput, setShowPathInput] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [outputMode, setOutputMode] = useState<'formatted' | 'raw'>('formatted');
  const outputEndRef = useRef<HTMLDivElement>(null);

  // AI Planning state
  const [showAiPlanning, setShowAiPlanning] = useState(false);
  const [aiPlanningTab, setAiPlanningTab] = useState<'analyze' | 'backlog' | 'suggestions'>('analyze');
  const [backlogPrompt, setBacklogPrompt] = useState('');
  const [generatedPlan, setGeneratedPlan] = useState<{
    features: Array<{ title: string; description: string; priority: number; category?: string }>;
    reasoning: string;
  } | null>(null);

  const { data: health, isLoading: healthLoading } = useAutomakerHealth();
  const {
    data: agentsData,
    refetch: refetchAgents,
    isLoading: agentsLoading,
  } = useAutomakerRunningAgents();
  const {
    data: featuresData,
    refetch: refetchFeatures,
    isLoading: featuresLoading,
  } = useAutomakerFeatures(projectPath);

  const createFeature = useCreateAutomakerFeature();
  const runFeature = useRunAutomakerFeature();
  const stopFeature = useStopAutomakerFeature();
  const deleteFeature = useDeleteAutomakerFeature();

  // Agent output hooks
  const { data: agentOutput } = useAutomakerAgentOutput(projectPath, selectedFeatureId);
  const { data: rawOutput } = useAutomakerRawOutput(projectPath, selectedFeatureId);

  // AI Planning hooks
  const { data: projectAnalysisData, refetch: refetchAnalysis } = useProjectAnalysis(projectPath);
  const analyzeProject = useAnalyzeProject();
  const generateBacklogPlan = useGenerateBacklogPlan();
  const applyBacklogPlan = useApplyBacklogPlan();
  const generateSuggestions = useGenerateSuggestions();
  const generateTitle = useGenerateTitle();
  const enhancePrompt = useEnhancePrompt();

  // WebSocket for real-time suggestions
  const {
    isConnected: wsConnected,
    isGenerating: wsSuggestionsGenerating,
    progress: wsSuggestionsProgress,
    suggestions: wsSuggestions,
    error: wsSuggestionsError,
    toolCalls: wsToolCalls,
    reset: resetWsSuggestions,
    startGenerating: startWsSuggestions,
  } = useAutomakerSuggestions();

  const isServerOnline = health?.status === 'ok';
  const runningAgents = agentsData?.runningAgents || [];
  const projectAgents = runningAgents.filter(
    (a) => a.projectPath === projectPath
  );
  const features = featuresData?.features || [];

  // Auto-select running agent for output viewing
  useEffect(() => {
    if (projectAgents.length > 0 && !selectedFeatureId) {
      setSelectedFeatureId(projectAgents[0].featureId);
      setShowOutput(true);
    }
  }, [projectAgents, selectedFeatureId]);

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputEndRef.current && showOutput) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentOutput, rawOutput, showOutput]);

  const handleStartTask = async () => {
    if (!taskTitle.trim()) {
      toast.error('Please enter a task title');
      return;
    }

    try {
      toast.loading('Creating task...');

      // Create feature
      const result = await createFeature.mutateAsync({
        projectPath,
        title: taskTitle.trim(),
        description: taskDescription.trim() || taskTitle.trim(),
      });

      // Run it
      await runFeature.mutateAsync({
        projectPath,
        featureId: result.feature.id,
      });

      toast.dismiss();
      toast.success('Task started!');
      setTaskTitle('');
      setTaskDescription('');
      setShowNewTask(false);
      setSelectedFeatureId(result.feature.id);
      setShowOutput(true);
      refetchAgents();
      refetchFeatures();
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to start task');
    }
  };

  const handleRunFeature = async (featureId: string) => {
    try {
      toast.loading('Starting task...');
      await runFeature.mutateAsync({ projectPath, featureId });
      toast.dismiss();
      toast.success('Task started!');
      setSelectedFeatureId(featureId);
      setShowOutput(true);
      refetchAgents();
      refetchFeatures();
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to start task');
    }
  };

  const handleStopTask = async (featureId: string) => {
    try {
      toast.loading('Stopping task...');
      await stopFeature.mutateAsync({ featureId });
      toast.dismiss();
      toast.success('Task stopped');
      refetchAgents();
      refetchFeatures();
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to stop task');
    }
  };

  const handleDeleteFeature = async (featureId: string) => {
    try {
      await deleteFeature.mutateAsync({ projectPath, featureId });
      toast.success('Task deleted');
      if (selectedFeatureId === featureId) {
        setSelectedFeatureId(null);
        setShowOutput(false);
      }
      refetchFeatures();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete task');
    }
  };

  const handleViewOutput = (featureId: string) => {
    setSelectedFeatureId(featureId);
    setShowOutput(true);
  };

  const handleRefresh = () => {
    refetchAgents();
    refetchFeatures();
    toast.success('Refreshed');
  };

  // AI Planning handlers
  const handleAnalyzeProject = async () => {
    try {
      toast.loading('Analyzing project...');
      await analyzeProject.mutateAsync({ projectPath });
      toast.dismiss();
      toast.success('Project analyzed!');
      refetchAnalysis();
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to analyze project');
    }
  };

  const handleGenerateBacklog = async () => {
    try {
      toast.loading('Generating backlog plan...');
      const result = await generateBacklogPlan.mutateAsync({
        projectPath,
        prompt: backlogPrompt || undefined,
      });
      toast.dismiss();
      toast.success('Backlog plan generated!');
      setGeneratedPlan(result.plan);
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to generate backlog');
    }
  };

  const handleApplyBacklog = async () => {
    if (!generatedPlan) return;
    try {
      toast.loading('Creating tasks from plan...');
      const result = await applyBacklogPlan.mutateAsync({
        projectPath,
        plan: generatedPlan,
      });
      toast.dismiss();
      toast.success(`Created ${result.createdCount} tasks!`);
      setGeneratedPlan(null);
      setBacklogPrompt('');
      refetchFeatures();
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to apply backlog');
    }
  };

  const handleGenerateSuggestions = async () => {
    try {
      // Reset WebSocket state and mark as generating
      resetWsSuggestions();
      startWsSuggestions();

      // Start generation via HTTP (triggers background process)
      await generateSuggestions.mutateAsync({ projectPath });

      // Toast will be shown when WebSocket receives complete event
      if (!wsConnected) {
        toast.info('Generating suggestions... (WebSocket not connected, results may be delayed)');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate suggestions');
    }
  };

  // Handle WebSocket suggestions completion - auto-add to backlog
  useEffect(() => {
    if (wsSuggestions && wsSuggestions.length > 0) {
      // Convert suggestions to features and create them directly
      const createFeatures = async () => {
        let createdCount = 0;

        for (const suggestion of wsSuggestions) {
          try {
            await createFeature.mutateAsync({
              projectPath,
              title: suggestion.description.substring(0, 60) + (suggestion.description.length > 60 ? '...' : ''),
              description: suggestion.description,
            });
            createdCount++;
          } catch (error) {
            console.error('Failed to create feature:', error);
          }
        }

        if (createdCount > 0) {
          toast.success(`Created ${createdCount} tasks in backlog!`);
          refetchFeatures();
        } else {
          toast.error('Failed to create tasks');
        }
        resetWsSuggestions();
      };

      createFeatures();
    }
  }, [wsSuggestions, projectPath, createFeature, refetchFeatures, resetWsSuggestions]);

  // Handle WebSocket suggestions error
  useEffect(() => {
    if (wsSuggestionsError) {
      toast.error(`Suggestions failed: ${wsSuggestionsError}`);
    }
  }, [wsSuggestionsError]);

  const handleEnhanceDescription = async () => {
    if (!taskDescription.trim()) return;
    try {
      toast.loading('Enhancing description...');
      const result = await enhancePrompt.mutateAsync({
        text: taskDescription,
        mode: 'improve',
      });
      toast.dismiss();
      setTaskDescription(result.enhanced);
      toast.success('Description enhanced!');
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to enhance');
    }
  };

  const handleGenerateTitle = async () => {
    if (!taskDescription.trim()) return;
    try {
      toast.loading('Generating title...');
      const result = await generateTitle.mutateAsync({
        description: taskDescription,
      });
      toast.dismiss();
      setTaskTitle(result.title);
      toast.success('Title generated!');
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to generate title');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in-progress':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'backlog':
        return <Clock className="h-4 w-4 text-zinc-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-zinc-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      completed: 'bg-green-500/10 text-green-500 border-green-500/20',
      'in-progress': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      backlog: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      failed: 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    return variants[status] || variants.backlog;
  };

  const currentOutput = outputMode === 'formatted' ? agentOutput?.output : rawOutput?.output;
  const selectedFeature = features.find((f) => f.id === selectedFeatureId);
  const isSelectedRunning = projectAgents.some((a) => a.featureId === selectedFeatureId);

  // Loading state
  if (healthLoading) {
    return (
      <div
        className={cn(
          'rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden',
          className
        )}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      </div>
    );
  }

  // Offline state
  if (!isServerOnline) {
    return (
      <div
        className={cn(
          'rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden',
          className
        )}
      >
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            Automaker Offline
          </h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-xs">
            The Automaker server is not running. Start it to enable AI-powered
            task automation.
          </p>
          <code className="text-xs bg-zinc-800 px-3 py-2 rounded-lg text-zinc-400 font-mono">
            cd automaker && npm run dev
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Main Panel */}
      <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
            <span className="font-medium text-white text-sm">Automaker</span>
            <Badge
              variant="outline"
              className="text-xs border-green-500/30 text-green-400"
            >
              Online
            </Badge>
            {/* WebSocket connection indicator */}
            <div
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
                wsConnected
                  ? 'text-cyan-400 bg-cyan-500/10'
                  : 'text-zinc-500 bg-zinc-800/50'
              )}
              title={wsConnected ? 'Real-time updates active' : 'Real-time updates disconnected'}
            >
              {wsConnected ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">{wsConnected ? 'Live' : 'Offline'}</span>
            </div>
            {projectAgents.length > 0 && (
              <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                {projectAgents.length} Running
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="h-7 px-2 text-zinc-400 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open('http://localhost:3007', '_blank')}
              className="h-7 px-2 text-zinc-400 hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 bg-zinc-800/30 border-b border-zinc-800/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNewTask(!showNewTask)}
            className={cn(
              'h-8 px-3 text-xs gap-1.5',
              showNewTask
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            New Task
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAiPlanning(!showAiPlanning)}
            className={cn(
              'h-8 px-3 text-xs gap-1.5',
              showAiPlanning
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
            )}
          >
            <Brain className="h-3.5 w-3.5" />
            AI Planning
          </Button>
          {selectedFeatureId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOutput(!showOutput)}
              className={cn(
                'h-8 px-3 text-xs gap-1.5',
                showOutput
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
              )}
            >
              <Terminal className="h-3.5 w-3.5" />
              Output
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPathInput(!showPathInput)}
            className={cn(
              'h-8 px-2 text-xs gap-1.5',
              showPathInput
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            )}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Project Path Input */}
        {showPathInput && (
          <div className="px-4 py-3 bg-zinc-800/20 border-b border-zinc-800/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 shrink-0">Path:</span>
              <Input
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/project"
                className="h-7 text-xs bg-zinc-800/50 border-zinc-700 focus:border-purple-500 font-mono"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setProjectPath('/Users/edduran/Desktop');
                  refetchFeatures();
                }}
                className="h-7 px-2 text-xs text-zinc-400 hover:text-white shrink-0"
              >
                Desktop
              </Button>
            </div>
          </div>
        )}

        {/* New Task Form */}
        {showNewTask && (
          <div className="p-4 border-b border-zinc-800/50 bg-zinc-800/20">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="What should the AI agent do?"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="bg-zinc-800/50 border-zinc-700 focus:border-purple-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleStartTask();
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateTitle}
                  disabled={!taskDescription.trim() || generateTitle.isPending}
                  className="h-9 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 shrink-0"
                  title="Generate title from description"
                >
                  {generateTitle.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  placeholder="Additional details (optional)..."
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={3}
                  className="bg-zinc-800/50 border-zinc-700 focus:border-purple-500 resize-none pr-10"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEnhanceDescription}
                  disabled={!taskDescription.trim() || enhancePrompt.isPending}
                  className="absolute right-2 top-2 h-7 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                  title="Enhance with AI"
                >
                  {enhancePrompt.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleStartTask}
                  disabled={
                    !taskTitle.trim() ||
                    createFeature.isPending ||
                    runFeature.isPending
                  }
                  className="gap-2 bg-purple-600 hover:bg-purple-500 text-white"
                >
                  {createFeature.isPending || runFeature.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Start Task
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowNewTask(false);
                    setTaskTitle('');
                    setTaskDescription('');
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* AI Planning Panel */}
        {showAiPlanning && (
          <div className="border-b border-zinc-800/50 bg-zinc-800/20">
            {/* Tab Navigation */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAiPlanningTab('analyze')}
                className={cn(
                  'h-7 px-3 text-xs',
                  aiPlanningTab === 'analyze'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                Analyze
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAiPlanningTab('backlog')}
                className={cn(
                  'h-7 px-3 text-xs',
                  aiPlanningTab === 'backlog'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                <ListTodo className="h-3.5 w-3.5 mr-1.5" />
                Backlog
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAiPlanningTab('suggestions')}
                className={cn(
                  'h-7 px-3 text-xs',
                  aiPlanningTab === 'suggestions'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
                Ideas
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAiPlanning(false)}
                className="h-7 px-2 text-zinc-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Analyze Tab */}
            {aiPlanningTab === 'analyze' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-white">Project Analysis</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAnalyzeProject}
                    disabled={analyzeProject.isPending}
                    className="h-7 text-xs gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                  >
                    {analyzeProject.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Brain className="h-3.5 w-3.5" />
                    )}
                    {projectAnalysisData?.analysis ? 'Re-analyze' : 'Analyze Project'}
                  </Button>
                </div>
                {projectAnalysisData?.analysis ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-700/50">
                      <p className="text-xs text-zinc-400 mb-1">Summary</p>
                      <p className="text-sm text-zinc-200">{projectAnalysisData.analysis.summary}</p>
                    </div>
                    {projectAnalysisData?.analysis?.technologies?.length > 0 && (
                      <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-700/50">
                        <p className="text-xs text-zinc-400 mb-2">Technologies</p>
                        <div className="flex flex-wrap gap-1.5">
                          {projectAnalysisData.analysis.technologies.map((tech, i) => (
                            <Badge key={i} variant="outline" className="text-xs border-zinc-600 text-zinc-300">
                              {tech}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-zinc-500">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No analysis yet</p>
                    <p className="text-xs mt-1">Click "Analyze Project" to understand your codebase</p>
                  </div>
                )}
              </div>
            )}

            {/* Backlog Tab */}
            {aiPlanningTab === 'backlog' && (
              <div className="p-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-400 mb-1.5 block">
                      What do you want to build? (optional)
                    </label>
                    <Textarea
                      placeholder="Describe your goals, features you want, or areas to improve..."
                      value={backlogPrompt}
                      onChange={(e) => setBacklogPrompt(e.target.value)}
                      rows={2}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-cyan-500 resize-none text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleGenerateBacklog}
                    disabled={generateBacklogPlan.isPending}
                    className="w-full gap-2 bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    {generateBacklogPlan.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ListTodo className="h-4 w-4" />
                    )}
                    Generate Backlog Plan
                  </Button>

                  {generatedPlan && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-white">Generated Plan</h4>
                        <Badge className="text-xs bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                          {generatedPlan.features?.length || 0} tasks
                        </Badge>
                      </div>
                      {generatedPlan.reasoning && (
                        <p className="text-xs text-zinc-400 italic">{generatedPlan.reasoning}</p>
                      )}
                      <ScrollArea className="h-48">
                        <div className="space-y-2">
                          {(generatedPlan.features || []).map((feature, i) => (
                            <div
                              key={i}
                              className="p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-700/50"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm text-white font-medium truncate">{feature.title}</p>
                                  <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{feature.description}</p>
                                </div>
                                <Badge variant="outline" className="text-[10px] shrink-0 border-zinc-600">
                                  P{feature.priority}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleApplyBacklog}
                          disabled={applyBacklogPlan.isPending}
                          className="flex-1 gap-2 bg-green-600 hover:bg-green-500 text-white"
                        >
                          {applyBacklogPlan.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Apply Plan
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setGeneratedPlan(null)}
                          className="text-zinc-400 hover:text-white"
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Suggestions Tab */}
            {aiPlanningTab === 'suggestions' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-white">AI Suggestions</h4>
                    {/* WebSocket status indicator */}
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        wsConnected ? 'bg-green-500' : 'bg-zinc-500'
                      )}
                      title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSuggestions}
                    disabled={generateSuggestions.isPending || wsSuggestionsGenerating}
                    className="h-7 text-xs gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                  >
                    {(generateSuggestions.isPending || wsSuggestionsGenerating) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Lightbulb className="h-3.5 w-3.5" />
                    )}
                    {wsSuggestionsGenerating ? 'Analyzing...' : 'Generate & Add to Backlog'}
                  </Button>
                </div>

                {/* Real-time progress during generation */}
                {wsSuggestionsGenerating && (
                  <div className="mb-4 space-y-2">
                    {/* Tool calls indicator */}
                    {wsToolCalls.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-cyan-400">
                        <Terminal className="h-3 w-3" />
                        <span>Reading: {wsToolCalls[wsToolCalls.length - 1]?.tool}</span>
                      </div>
                    )}
                    {/* Progress text */}
                    {wsSuggestionsProgress && (
                      <ScrollArea className="h-32 rounded-lg bg-zinc-900/50 border border-zinc-700/50 p-2">
                        <pre className="text-xs text-zinc-400 whitespace-pre-wrap">
                          {wsSuggestionsProgress}
                        </pre>
                      </ScrollArea>
                    )}
                    {!wsSuggestionsProgress && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>AI is analyzing your codebase...</span>
                      </div>
                    )}
                  </div>
                )}

                {generatedPlan && !wsSuggestionsGenerating ? (
                  <div className="space-y-3">
                    <ScrollArea className="h-48">
                      <div className="space-y-2">
                        {(generatedPlan.features || []).map((feature, i) => (
                          <div
                            key={i}
                            className="p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-700/50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm text-white font-medium truncate">{feature.title}</p>
                                <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{feature.description}</p>
                              </div>
                              {feature.category && (
                                <Badge variant="outline" className="text-[10px] shrink-0 border-zinc-600">
                                  {feature.category}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={handleApplyBacklog}
                        disabled={applyBacklogPlan.isPending}
                        className="flex-1 gap-2 bg-green-600 hover:bg-green-500 text-white"
                      >
                        {applyBacklogPlan.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        Create Tasks
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setGeneratedPlan(null);
                          resetWsSuggestions();
                        }}
                        className="text-zinc-400 hover:text-white"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                ) : !wsSuggestionsGenerating && (
                  <div className="text-center py-6 text-zinc-500">
                    <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No suggestions yet</p>
                    <p className="text-xs mt-1">Click "Generate Ideas" - AI will analyze your codebase and automatically add tasks to your backlog</p>
                    {!wsConnected && (
                      <p className="text-xs mt-2 text-amber-500">
                        WebSocket disconnected - results may be delayed
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Agent Output Viewer */}
        {showOutput && selectedFeatureId && (
          <div className={cn(
            'border-b border-zinc-800/50 bg-zinc-950/50',
            outputExpanded ? 'fixed inset-4 z-50 rounded-xl border border-zinc-700' : ''
          )}>
            {/* Output Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/30 border-b border-zinc-800/50">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-300">
                  {selectedFeature?.title || 'Agent Output'}
                </span>
                {isSelectedRunning && (
                  <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
                    Live
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOutputMode(outputMode === 'formatted' ? 'raw' : 'formatted')}
                  className="h-6 px-2 text-[10px] text-zinc-400 hover:text-white"
                >
                  {outputMode === 'formatted' ? 'Raw' : 'Formatted'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOutputExpanded(!outputExpanded)}
                  className="h-6 px-1 text-zinc-400 hover:text-white"
                >
                  {outputExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowOutput(false);
                    setOutputExpanded(false);
                  }}
                  className="h-6 px-1 text-zinc-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Output Content */}
            <ScrollArea className={cn(
              'p-4',
              outputExpanded ? 'h-[calc(100vh-10rem)]' : 'h-64'
            )}>
              {currentOutput ? (
                <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-words">
                  {currentOutput}
                  <div ref={outputEndRef} />
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FileText className="h-8 w-8 text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-500">No output yet</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {isSelectedRunning
                      ? 'Waiting for agent to produce output...'
                      : 'Run a task to see output here'}
                  </p>
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* Running Agents */}
        {projectAgents.length > 0 && (
          <div className="p-4 border-b border-zinc-800/50">
            <h4 className="text-xs font-medium text-zinc-400 uppercase mb-3">
              Running Agents
            </h4>
            <div className="space-y-2">
              {projectAgents.map((agent) => (
                <div
                  key={agent.featureId}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer',
                    selectedFeatureId === agent.featureId
                      ? 'bg-purple-500/10 border-purple-500/30'
                      : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600/50'
                  )}
                  onClick={() => handleViewOutput(agent.featureId)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{agent.title}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {agent.model} • {agent.provider}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewOutput(agent.featureId);
                      }}
                      className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                    >
                      <Terminal className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStopTask(agent.featureId);
                      }}
                      disabled={stopFeature.isPending}
                      className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      {stopFeature.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Features List */}
        <div className="p-4">
          <h4 className="text-xs font-medium text-zinc-400 uppercase mb-3">
            Tasks
          </h4>
          {featuresLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : features.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-500">No tasks yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Create a new task to get started
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {features.slice(0, 10).map((feature) => {
                const isRunning = projectAgents.some(
                  (a) => a.featureId === feature.id
                );
                const isSelected = selectedFeatureId === feature.id;
                return (
                  <div
                    key={feature.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-zinc-700/30 border-zinc-600/50'
                        : 'bg-zinc-800/30 border-zinc-800/50 hover:border-zinc-700/50'
                    )}
                    onClick={() => handleViewOutput(feature.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getStatusIcon(feature.status)}
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">
                          {feature.title}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] mt-1',
                            getStatusBadge(feature.status)
                          )}
                        >
                          {feature.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewOutput(feature.id);
                        }}
                        className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {!isRunning && feature.status !== 'completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRunFeature(feature.id);
                          }}
                          disabled={runFeature.isPending}
                          className="h-7 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isRunning && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStopTask(feature.id);
                          }}
                          disabled={stopFeature.isPending}
                          className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFeature(feature.id);
                        }}
                        disabled={deleteFeature.isPending || isRunning}
                        className="h-7 px-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
