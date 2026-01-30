/**
 * Remotion Root
 *
 * Entry point for Remotion compositions.
 * Register all compositions here for the Remotion Studio.
 *
 * Run `npx remotion studio` to preview.
 */

import React from 'react';
import { Composition } from 'remotion';
import { ActivityTimeline } from './compositions/ActivityTimeline';
import { MetricsDashboard, type MetricsDashboardProps } from './compositions/MetricsDashboard';
import type { ActivityTimelineProps } from './types';

// Default props for preview
const defaultActivityTimelineProps: ActivityTimelineProps = {
  activities: [
    {
      id: '1',
      eventType: 'deal_created',
      timestamp: new Date().toISOString(),
      actor: { type: 'user', name: 'John Smith', id: '1' },
      resource: { type: 'deal', name: '123 Main St', id: 'd1' },
      action: 'created',
      summary: 'Created a new deal for 123 Main St, Phoenix AZ',
      importance: 'normal',
    },
    {
      id: '2',
      eventType: 'offer_made',
      timestamp: new Date(Date.now() - 120000).toISOString(),
      actor: { type: 'user', name: 'Sarah Johnson', id: '2' },
      resource: { type: 'offer', name: '$285,000', id: 'o1' },
      action: 'submitted',
      summary: 'Submitted an offer of $285,000 for 456 Oak Ave',
      importance: 'high',
    },
    {
      id: '3',
      eventType: 'compliance_check_passed',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      actor: { type: 'system', name: 'Compliance Engine' },
      resource: { type: 'compliance', name: 'OFAC Screening', id: 'c1' },
      action: 'passed',
      summary: 'OFAC sanctions screening passed for buyer Michael Chen',
      importance: 'normal',
    },
    {
      id: '4',
      eventType: 'document_signed',
      timestamp: new Date(Date.now() - 600000).toISOString(),
      actor: { type: 'user', name: 'Emily Davis', id: '3' },
      resource: { type: 'document', name: 'Purchase Agreement', id: 'doc1' },
      action: 'signed',
      summary: 'Signed the Purchase Agreement for 789 Pine Rd',
      importance: 'critical',
    },
    {
      id: '5',
      eventType: 'task_completed',
      timestamp: new Date(Date.now() - 900000).toISOString(),
      actor: { type: 'user', name: 'Mike Wilson', id: '4' },
      resource: { type: 'task', name: 'Property Inspection', id: 't1' },
      action: 'completed',
      summary: 'Completed property inspection for 321 Elm St',
      importance: 'normal',
    },
  ],
  title: 'Activity Feed',
  showTimestamps: true,
  theme: 'dark',
};

const defaultMetricsDashboardProps: MetricsDashboardProps = {
  metrics: [
    { id: '1', label: 'Active Deals', value: 127, previousValue: 98, icon: '🏠', color: '#3b82f6' },
    { id: '2', label: 'Total Revenue', value: 2450000, previousValue: 2100000, format: 'currency', icon: '💰', color: '#22c55e' },
    { id: '3', label: 'Conversion Rate', value: 68, previousValue: 62, format: 'percent', icon: '📈', color: '#8b5cf6' },
    { id: '4', label: 'Offers Made', value: 89, previousValue: 75, icon: '📝', color: '#f59e0b' },
    { id: '5', label: 'Compliance Score', value: 94, previousValue: 91, format: 'percent', icon: '🛡️', color: '#06b6d4' },
    { id: '6', label: 'Team Members', value: 24, previousValue: 22, icon: '👥', color: '#ec4899' },
  ],
  title: 'Performance Dashboard',
  subtitle: 'Real-time metrics overview',
  theme: 'dark',
  columns: 3,
};

export function RemotionRoot() {
  return (
    <>
      {/* Activity Timeline - 15 seconds at 30fps */}
      <Composition
        id="ActivityTimeline"
        component={ActivityTimeline}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultActivityTimelineProps}
      />

      {/* Activity Timeline - Short version (10 seconds) */}
      <Composition
        id="ActivityTimelineShort"
        component={ActivityTimeline}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultActivityTimelineProps}
      />

      {/* Activity Timeline - Portrait for mobile/vertical displays */}
      <Composition
        id="ActivityTimelinePortrait"
        component={ActivityTimeline}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultActivityTimelineProps}
      />

      {/* Activity Timeline - 4K */}
      <Composition
        id="ActivityTimeline4K"
        component={ActivityTimeline}
        durationInFrames={450}
        fps={30}
        width={3840}
        height={2160}
        defaultProps={defaultActivityTimelineProps}
      />

      {/* ============================================ */}
      {/* METRICS DASHBOARD COMPOSITIONS */}
      {/* ============================================ */}

      {/* Metrics Dashboard - Standard 1080p */}
      <Composition
        id="MetricsDashboard"
        component={MetricsDashboard}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultMetricsDashboardProps}
      />

      {/* Metrics Dashboard - 2 columns layout */}
      <Composition
        id="MetricsDashboard2Col"
        component={MetricsDashboard}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ ...defaultMetricsDashboardProps, columns: 2 }}
      />

      {/* Metrics Dashboard - 4 columns layout */}
      <Composition
        id="MetricsDashboard4Col"
        component={MetricsDashboard}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ ...defaultMetricsDashboardProps, columns: 4 }}
      />

      {/* Metrics Dashboard - Portrait */}
      <Composition
        id="MetricsDashboardPortrait"
        component={MetricsDashboard}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ ...defaultMetricsDashboardProps, columns: 2 }}
      />
    </>
  );
}
