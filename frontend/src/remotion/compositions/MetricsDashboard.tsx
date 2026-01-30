/**
 * MetricsDashboard Composition
 *
 * Displays animated KPI metrics with counters, gauges, and trend indicators.
 */

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { THEME } from '../types';

export interface Metric {
  id: string;
  label: string;
  value: number;
  previousValue?: number;
  format?: 'number' | 'currency' | 'percent';
  prefix?: string;
  suffix?: string;
  color?: string;
  icon?: string;
}

export interface MetricsDashboardProps {
  metrics: Metric[];
  title?: string;
  subtitle?: string;
  theme?: 'dark' | 'light';
  columns?: 2 | 3 | 4;
}

// Default metrics for preview
const DEFAULT_METRICS: Metric[] = [
  { id: '1', label: 'Active Deals', value: 127, previousValue: 98, icon: '🏠', color: '#3b82f6' },
  { id: '2', label: 'Total Revenue', value: 2450000, previousValue: 2100000, format: 'currency', icon: '💰', color: '#22c55e' },
  { id: '3', label: 'Conversion Rate', value: 68, previousValue: 62, format: 'percent', icon: '📈', color: '#8b5cf6' },
  { id: '4', label: 'Offers Made', value: 89, previousValue: 75, icon: '📝', color: '#f59e0b' },
  { id: '5', label: 'Compliance Score', value: 94, previousValue: 91, format: 'percent', icon: '🛡️', color: '#06b6d4' },
  { id: '6', label: 'Team Members', value: 24, previousValue: 22, icon: '👥', color: '#ec4899' },
];

function formatValue(value: number, format?: string, prefix?: string, suffix?: string): string {
  let formatted: string;

  switch (format) {
    case 'currency':
      if (value >= 1000000) {
        formatted = `$${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        formatted = `$${(value / 1000).toFixed(0)}K`;
      } else {
        formatted = `$${value.toFixed(0)}`;
      }
      break;
    case 'percent':
      formatted = `${value}%`;
      break;
    default:
      formatted = value.toLocaleString();
  }

  return `${prefix || ''}${formatted}${suffix || ''}`;
}

function MetricCard({
  metric,
  index,
  theme,
}: {
  metric: Metric;
  index: number;
  theme: 'dark' | 'light';
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = THEME[theme];

  // Staggered entrance animation
  const delay = index * 8;
  const entryProgress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  // Scale and fade in
  const scale = interpolate(entryProgress, [0, 1], [0.8, 1]);
  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);

  // Animated counter
  const counterProgress = interpolate(
    frame - delay - 10,
    [0, 45],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const displayValue = Math.round(metric.value * counterProgress);

  // Calculate change
  const change = metric.previousValue
    ? ((metric.value - metric.previousValue) / metric.previousValue) * 100
    : 0;
  const isPositive = change >= 0;

  // Change indicator animation
  const changeOpacity = interpolate(
    frame - delay - 30,
    [0, 15],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const cardColor = metric.color || colors.accent;

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        background: colors.cardBackground,
        borderRadius: 24,
        padding: 32,
        border: `1px solid ${colors.cardBorder}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Accent gradient */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${cardColor}, ${cardColor}80)`,
        }}
      />

      {/* Icon and label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: `${cardColor}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
          }}
        >
          {metric.icon || '📊'}
        </div>
        <span
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {metric.label}
        </span>
      </div>

      {/* Value */}
      <div
        style={{
          fontSize: 56,
          fontWeight: 700,
          color: colors.textPrimary,
          lineHeight: 1,
          marginBottom: 16,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatValue(displayValue, metric.format, metric.prefix, metric.suffix)}
      </div>

      {/* Change indicator */}
      {metric.previousValue && (
        <div
          style={{
            opacity: changeOpacity,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 12px',
              borderRadius: 20,
              background: isPositive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isPositive ? '#22c55e' : '#ef4444',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 16 }}>{isPositive ? '↑' : '↓'}</span>
            {Math.abs(change).toFixed(1)}%
          </div>
          <span style={{ fontSize: 13, color: colors.textMuted }}>vs last period</span>
        </div>
      )}

      {/* Progress bar for percent metrics */}
      {metric.format === 'percent' && (
        <div
          style={{
            marginTop: 16,
            height: 8,
            background: colors.cardBorder,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${displayValue}%`,
              background: `linear-gradient(90deg, ${cardColor}, ${cardColor}cc)`,
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
    </div>
  );
}

export function MetricsDashboard({
  metrics = DEFAULT_METRICS,
  title = 'Performance Dashboard',
  subtitle = 'Real-time metrics overview',
  theme = 'dark',
  columns = 3,
}: MetricsDashboardProps) {
  const frame = useCurrentFrame();
  const colors = THEME[theme];

  // Title animation
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [-30, 0], { extrapolateRight: 'clamp' });

  // Grid columns
  const gridTemplateColumns = `repeat(${columns}, 1fr)`;

  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: 60,
      }}
    >
      {/* Header */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          marginBottom: 48,
        }}
      >
        <h1
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
            marginBottom: 8,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: 20,
            color: colors.textMuted,
            margin: 0,
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns,
          gap: 24,
        }}
      >
        {metrics.map((metric, index) => (
          <MetricCard key={metric.id} metric={metric} index={index} theme={theme} />
        ))}
      </div>

      {/* Timestamp */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: colors.textMuted,
          fontSize: 14,
        }}
      >
        <span>Last updated:</span>
        <span style={{ fontWeight: 500 }}>
          {new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>
    </AbsoluteFill>
  );
}
