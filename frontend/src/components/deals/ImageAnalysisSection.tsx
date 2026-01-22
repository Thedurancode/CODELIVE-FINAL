'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Star,
} from 'lucide-react';
import { Property } from '@/types';
import { format } from 'date-fns';

interface ImageAnalysisSectionProps {
  property: Property;
}

const conditionColors: Record<string, { bg: string; text: string; border: string }> = {
  excellent: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  good: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  fair: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  poor: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  unknown: { bg: 'bg-zinc-500/20', text: 'text-muted-foreground', border: 'border-zinc-500/30' },
};

export function ImageAnalysisSection({ property }: ImageAnalysisSectionProps) {
  const analysis = property.imageAnalysis;

  if (!analysis) {
    return null;
  }

  const conditionStyle = conditionColors[analysis.overallCondition] || conditionColors.unknown;

  return (
    <Card className="bg-card border">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI Property Analysis
          </span>
          {property.imageAnalyzedAt && (
            <span className="text-xs text-muted-foreground font-normal">
              Analyzed {format(new Date(property.imageAnalyzedAt), 'MMM d, yyyy')}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Condition & Score */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge className={`${conditionStyle.bg} ${conditionStyle.text} ${conditionStyle.border} capitalize text-sm px-3 py-1`}>
              {analysis.overallCondition} Condition
            </Badge>
          </div>
          {analysis.qualityScore > 0 && (
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
              <span className="text-foreground font-medium">{analysis.qualityScore}/100</span>
            </div>
          )}
        </div>

        {/* Description */}
        {analysis.description && (
          <p className="text-foreground text-sm leading-relaxed">
            {analysis.description}
          </p>
        )}

        {/* Features */}
        {analysis.features && analysis.features.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <CheckCircle className="h-3 w-3 text-green-500" />
              Detected Features
            </div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.features.map((feature, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-green-400 border-green-500/30 bg-green-500/10 text-xs"
                >
                  {feature}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Concerns */}
        {analysis.concerns && analysis.concerns.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              Potential Concerns
            </div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.concerns.map((concern, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-amber-400 border-amber-500/30 bg-amber-500/10 text-xs"
                >
                  {concern}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
