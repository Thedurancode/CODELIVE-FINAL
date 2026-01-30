/**
 * ActivityTimeline Composition
 *
 * Displays a scrolling timeline of activity events.
 * Each activity card animates in with a staggered delay.
 */

import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { ActivityCard } from '../components/ActivityCard';
import { Activity, ActivityTimelineProps, THEME } from '../types';

// Default/mock activities for preview
const MOCK_ACTIVITIES: Activity[] = [
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
];

export function ActivityTimeline({
  activities = MOCK_ACTIVITIES,
  title = 'Activity Feed',
  showTimestamps = true,
  theme = 'dark',
}: ActivityTimelineProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const colors = THEME[theme];

  // Frames per activity card
  const framesPerCard = 45; // 1.5 seconds per card at 30fps

  // Title animation
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const titleY = interpolate(frame, [0, 20], [-20, 0], {
    extrapolateRight: 'clamp',
  });

  // Scrolling effect for long lists
  const totalCardsHeight = activities.length * 150; // Approximate height per card
  const containerHeight = 900; // Visible area height
  const maxScroll = Math.max(0, totalCardsHeight - containerHeight);

  // Calculate scroll position based on frame
  const scrollProgress = interpolate(
    frame,
    [60, durationInFrames - 60],
    [0, maxScroll],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Live indicator pulse
  const pulseScale = interpolate(
    frame % 30,
    [0, 15, 30],
    [1, 1.2, 1],
    { extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: 60,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: colors.textPrimary,
              margin: 0,
            }}
          >
            {title}
          </h1>

          {/* Live indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(239, 68, 68, 0.15)',
              padding: '8px 16px',
              borderRadius: 20,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#ef4444',
                transform: `scale(${pulseScale})`,
              }}
            />
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#ef4444',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Live
            </span>
          </div>
        </div>

        {/* Activity count */}
        <div
          style={{
            fontSize: 18,
            color: colors.textMuted,
          }}
        >
          {activities.length} events
        </div>
      </div>

      {/* Activity list container */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 24,
        }}
      >
        {/* Gradient overlay at top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 60,
            background: `linear-gradient(to bottom, ${colors.background}, transparent)`,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        />

        {/* Scrolling content */}
        <div
          style={{
            transform: `translateY(-${scrollProgress}px)`,
            paddingTop: 20,
            paddingBottom: 100,
          }}
        >
          {activities.map((activity, index) => (
            <Sequence
              key={activity.id}
              from={30 + index * framesPerCard}
              layout="none"
            >
              <ActivityCard
                activity={activity}
                index={index}
                startFrame={0}
                theme={theme}
                showTimestamp={showTimestamps}
              />
            </Sequence>
          ))}
        </div>

        {/* Gradient overlay at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
            background: `linear-gradient(to top, ${colors.background}, transparent)`,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Footer timestamp */}
      <div
        style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'flex-end',
          color: colors.textMuted,
          fontSize: 14,
        }}
      >
        {new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </div>
    </AbsoluteFill>
  );
}
