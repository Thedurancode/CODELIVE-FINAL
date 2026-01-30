/**
 * ActivityCard Component
 *
 * Renders a single activity item with animations.
 * Used in the ActivityTimeline composition.
 */

import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Activity, THEME, EVENT_COLORS, EVENT_ICONS } from '../types';

interface ActivityCardProps {
  activity: Activity;
  index: number;
  startFrame: number;
  theme?: 'dark' | 'light';
  showTimestamp?: boolean;
}

export function ActivityCard({
  activity,
  index,
  startFrame,
  theme = 'dark',
  showTimestamp = true,
}: ActivityCardProps) {
  const frame = useCurrentFrame();
  const colors = THEME[theme];

  // Calculate animation progress relative to this card's start
  const localFrame = frame - startFrame;

  // Fade in over 15 frames
  const opacity = interpolate(localFrame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Slide up from 30px below
  const translateY = interpolate(localFrame, [0, 15], [30, 0], {
    extrapolateRight: 'clamp',
  });

  // Scale in slightly
  const scale = interpolate(localFrame, [0, 10], [0.95, 1], {
    extrapolateRight: 'clamp',
  });

  // Get event color and icon
  const eventColor = EVENT_COLORS[activity.eventType] || colors.accent;
  const eventIcon = EVENT_ICONS[activity.eventType] || '📌';

  // Format timestamp
  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  // Get importance badge style
  const getImportanceBadge = () => {
    switch (activity.importance) {
      case 'critical':
        return { background: colors.critical, text: 'CRITICAL' };
      case 'high':
        return { background: colors.warning, text: 'HIGH' };
      default:
        return null;
    }
  };

  const importanceBadge = getImportanceBadge();

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        padding: 20,
        background: colors.cardBackground,
        borderRadius: 16,
        border: `1px solid ${colors.cardBorder}`,
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Colored accent line on left */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: eventColor,
          borderRadius: '4px 0 0 4px',
        }}
      />

      {/* Avatar / Icon */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: `${eventColor}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0,
          border: `2px solid ${eventColor}40`,
        }}
      >
        {activity.actor.avatar ? (
          <img
            src={activity.actor.avatar}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          eventIcon
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 18,
              color: colors.textPrimary,
            }}
          >
            {activity.actor.name}
          </span>

          {importanceBadge && (
            <span
              style={{
                background: importanceBadge.background,
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {importanceBadge.text}
            </span>
          )}

          {showTimestamp && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 14,
                color: colors.textMuted,
              }}
            >
              {formatTime(activity.timestamp)}
            </span>
          )}
        </div>

        {/* Summary */}
        <div
          style={{
            fontSize: 16,
            color: colors.textSecondary,
            lineHeight: 1.5,
          }}
        >
          {activity.summary}
        </div>

        {/* Resource tag */}
        {activity.resource.name && (
          <div
            style={{
              marginTop: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              background: `${eventColor}15`,
              borderRadius: 20,
              fontSize: 13,
              color: eventColor,
              fontWeight: 500,
            }}
          >
            <span style={{ opacity: 0.7 }}>
              {activity.resource.type === 'deal' && '🏠'}
              {activity.resource.type === 'task' && '📋'}
              {activity.resource.type === 'document' && '📄'}
              {activity.resource.type === 'offer' && '💰'}
              {activity.resource.type === 'buyer' && '👤'}
            </span>
            {activity.resource.name}
          </div>
        )}
      </div>
    </div>
  );
}
