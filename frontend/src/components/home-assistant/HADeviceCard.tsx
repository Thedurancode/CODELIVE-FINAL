'use client';

import { useState } from 'react';
import {
  Lightbulb,
  Power,
  Thermometer,
  Speaker,
  Film,
  Fan,
  Sun,
  Moon,
  Home,
  Lock,
  Unlock,
  Play,
  Pause,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// ============================================================================
// TYPES
// ============================================================================

export interface HADeviceState {
  entity_id: string;
  state: string;
  friendly_name: string;
  domain: string;
  attributes: Record<string, any>;
  brightness?: number;
  rgb_color?: [number, number, number];
  temperature?: number;
  hvac_mode?: string;
  current_temperature?: number;
}

interface HADeviceCardProps {
  device: HADeviceState;
  onToggle?: () => void;
  onTurnOn?: () => void;
  onTurnOff?: () => void;
  onPlayPause?: () => void;
  onBrightnessChange?: (value: number) => void;
  onColorChange?: (color: { r: number; g: number; b: number }) => void;
  onTemperatureChange?: (value: number) => void;
  onVolumeChange?: (value: number) => void;
  onActivate?: () => void;
  compact?: boolean;
  className?: string;
}

// ============================================================================
// ICON HELPERS
// ============================================================================

function getDeviceIcon(domain: string, state: string) {
  const isOn = state === 'on' || state === 'playing' || state === 'unlocked';

  switch (domain) {
    case 'light':
      return <Lightbulb className={cn('h-5 w-5', isOn ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground')} />;
    case 'switch':
      return <Power className={cn('h-5 w-5', isOn ? 'text-green-500' : 'text-muted-foreground')} />;
    case 'climate':
      return <Thermometer className={cn('h-5 w-5', state === 'heat' ? 'text-orange-500' : state === 'cool' ? 'text-blue-500' : 'text-muted-foreground')} />;
    case 'media_player':
      return state === 'playing' ? (
        <Play className="h-5 w-5 text-green-500 fill-green-500" />
      ) : (
        <Speaker className="h-5 w-5 text-muted-foreground" />
      );
    case 'fan':
      return <Fan className={cn('h-5 w-5', isOn ? 'text-blue-400 animate-spin' : 'text-muted-foreground')} />;
    case 'cover':
      return <Home className="h-5 w-5 text-muted-foreground" />;
    case 'lock':
      return isOn ? (
        <Unlock className="h-5 w-5 text-green-500" />
      ) : (
        <Lock className="h-5 w-5 text-red-500" />
      );
    case 'scene':
      return <Sun className="h-5 w-5 text-amber-400" />;
    default:
      return <Power className="h-5 w-5 text-muted-foreground" />;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HADeviceCard({
  device,
  onToggle,
  onTurnOn,
  onTurnOff,
  onPlayPause,
  onBrightnessChange,
  onColorChange,
  onTemperatureChange,
  onVolumeChange,
  onActivate,
  compact = false,
  className,
}: HADeviceCardProps) {
  const [localBrightness, setLocalBrightness] = useState(device.attributes?.brightness || 0);
  const [localTemp, setLocalTemp] = useState(device.attributes?.temperature || 20);
  const [localVolume, setLocalVolume] = useState((device.attributes?.volume_level || 0) * 100);

  const isUnavailable = device.state === 'unavailable' || device.state === 'unknown';
  const isOn = !isUnavailable && (device.state === 'on' || device.state === 'playing' || device.state === 'paused' || device.state === 'idle' || device.state === 'home');
  const brightness = device.attributes?.brightness;
  const brightnessPercent = brightness ? Math.round((brightness / 255) * 100) : 0;

  // Handle brightness change with debounce
  const handleBrightnessChange = (value: number[]) => {
    setLocalBrightness(value[0]);
  };

  const handleBrightnessCommit = (value: number[]) => {
    if (onBrightnessChange) {
      // Convert percentage to 0-255
      const brightness255 = Math.round((value[0] / 100) * 255);
      onBrightnessChange(brightness255);
    }
  };

  // Handle temperature change
  const handleTempChange = (value: number[]) => {
    setLocalTemp(value[0]);
  };

  const handleTempCommit = (value: number[]) => {
    if (onTemperatureChange) {
      onTemperatureChange(value[0]);
    }
  };

  // Handle volume change
  const handleVolumeChange = (value: number[]) => {
    setLocalVolume(value[0]);
  };

  const handleVolumeCommit = (value: number[]) => {
    if (onVolumeChange) {
      // Convert percentage to 0-1
      onVolumeChange(value[0] / 100);
    }
  };

  // Handle power switch - use explicit on/off if available, fallback to toggle
  const handlePowerSwitch = (checked: boolean) => {
    if (isUnavailable) {
      // Don't try to control unavailable devices
      return;
    }
    if (checked && onTurnOn) {
      onTurnOn();
    } else if (!checked && onTurnOff) {
      onTurnOff();
    } else if (onToggle) {
      onToggle();
    }
  };

  // Render scene card
  if (device.domain === 'scene') {
    return (
      <Card
        className={cn(
          'cursor-pointer transition-all hover:shadow-md active:scale-95',
          className
        )}
        onClick={onActivate}
      >
        <CardContent className="flex items-center gap-3 p-4">
          {getDeviceIcon(device.domain, device.state)}
          <span className="font-medium truncate">{device.friendly_name}</span>
        </CardContent>
      </Card>
    );
  }

  // Compact mode
  if (compact) {
    return (
      <Card className={cn('transition-all', isOn && 'bg-primary/5', isUnavailable && 'opacity-50', className)}>
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2 min-w-0">
            {getDeviceIcon(device.domain, device.state)}
            <span className="text-sm font-medium truncate">{device.friendly_name}</span>
            {isUnavailable && <span className="text-xs text-muted-foreground">(Unavailable)</span>}
          </div>
          <Switch checked={isOn} onCheckedChange={handlePowerSwitch} disabled={isUnavailable} />
        </CardContent>
      </Card>
    );
  }

  // Full card
  return (
    <Card className={cn('transition-all', isOn && 'bg-primary/5', isUnavailable && 'opacity-50', className)}>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {getDeviceIcon(device.domain, device.state)}
            <div className="min-w-0">
              <p className="font-medium truncate">{device.friendly_name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {device.state}
                {device.domain === 'climate' && device.attributes?.current_temperature && (
                  <> - {device.attributes.current_temperature}°</>
                )}
                {device.domain === 'light' && brightness && <> - {brightnessPercent}%</>}
              </p>
            </div>
          </div>
          {(device.domain === 'light' || device.domain === 'switch' || device.domain === 'fan' || device.domain === 'media_player') && (
            <Switch checked={isOn} onCheckedChange={handlePowerSwitch} disabled={isUnavailable} />
          )}
        </div>

        {/* Light brightness control */}
        {device.domain === 'light' && isOn && onBrightnessChange && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Brightness</span>
              <span>{Math.round((localBrightness / 255) * 100)}%</span>
            </div>
            <Slider
              value={[(localBrightness / 255) * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={handleBrightnessChange}
              onValueCommit={handleBrightnessCommit}
              className="cursor-pointer"
            />
          </div>
        )}

        {/* Climate temperature control */}
        {device.domain === 'climate' && onTemperatureChange && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Target</span>
              <span>{localTemp}°</span>
            </div>
            <Slider
              value={[localTemp]}
              min={60}
              max={85}
              step={1}
              onValueChange={handleTempChange}
              onValueCommit={handleTempCommit}
              className="cursor-pointer"
            />
          </div>
        )}

        {/* Media player controls */}
        {device.domain === 'media_player' && !isUnavailable && (
          <div className="space-y-3">
            {device.attributes?.media_title && (
              <p className="text-sm truncate">
                {device.attributes.media_title}
                {device.attributes.media_artist && ` - ${device.attributes.media_artist}`}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={onPlayPause || onToggle} disabled={isUnavailable}>
                {device.state === 'playing' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              {onVolumeChange && (
                <div className="flex items-center gap-2 flex-1">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <Slider
                    value={[localVolume]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={handleVolumeChange}
                    onValueCommit={handleVolumeCommit}
                    className="cursor-pointer"
                    disabled={isUnavailable}
                  />
                  <span className="text-xs text-muted-foreground w-8">{Math.round(localVolume)}%</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// DEVICE GRID COMPONENT
// ============================================================================

interface HADeviceGridProps {
  devices: HADeviceState[];
  onToggle?: (entityId: string) => void;
  onTurnOn?: (entityId: string) => void;
  onTurnOff?: (entityId: string) => void;
  onPlayPause?: (entityId: string) => void;
  onBrightnessChange?: (entityId: string, brightness: number) => void;
  onTemperatureChange?: (entityId: string, temperature: number) => void;
  onVolumeChange?: (entityId: string, volume: number) => void;
  onActivateScene?: (sceneId: string) => void;
  compact?: boolean;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export function HADeviceGrid({
  devices,
  onToggle,
  onTurnOn,
  onTurnOff,
  onPlayPause,
  onBrightnessChange,
  onTemperatureChange,
  onVolumeChange,
  onActivateScene,
  compact = false,
  columns = 2,
  className,
}: HADeviceGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-3', gridCols[columns], className)}>
      {devices.map((device) => (
        <HADeviceCard
          key={device.entity_id}
          device={device}
          compact={compact}
          onToggle={onToggle ? () => onToggle(device.entity_id) : undefined}
          onTurnOn={onTurnOn ? () => onTurnOn(device.entity_id) : undefined}
          onTurnOff={onTurnOff ? () => onTurnOff(device.entity_id) : undefined}
          onPlayPause={onPlayPause ? () => onPlayPause(device.entity_id) : undefined}
          onBrightnessChange={
            onBrightnessChange ? (b) => onBrightnessChange(device.entity_id, b) : undefined
          }
          onTemperatureChange={
            onTemperatureChange ? (t) => onTemperatureChange(device.entity_id, t) : undefined
          }
          onVolumeChange={
            onVolumeChange ? (v) => onVolumeChange(device.entity_id, v) : undefined
          }
          onActivate={
            device.domain === 'scene' && onActivateScene
              ? () => onActivateScene(device.entity_id)
              : undefined
          }
        />
      ))}
    </div>
  );
}

// ============================================================================
// DOMAIN SECTIONS
// ============================================================================

interface HADomainSectionProps {
  title: string;
  icon: React.ReactNode;
  devices: HADeviceState[];
  onToggle?: (entityId: string) => void;
  onTurnOn?: (entityId: string) => void;
  onTurnOff?: (entityId: string) => void;
  onPlayPause?: (entityId: string) => void;
  onBrightnessChange?: (entityId: string, brightness: number) => void;
  onTemperatureChange?: (entityId: string, temperature: number) => void;
  onVolumeChange?: (entityId: string, volume: number) => void;
  onActivateScene?: (sceneId: string) => void;
  compact?: boolean;
}

export function HADomainSection({
  title,
  icon,
  devices,
  onToggle,
  onTurnOn,
  onTurnOff,
  onPlayPause,
  onBrightnessChange,
  onTemperatureChange,
  onVolumeChange,
  onActivateScene,
  compact,
}: HADomainSectionProps) {
  if (devices.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">({devices.length})</span>
      </div>
      <HADeviceGrid
        devices={devices}
        onToggle={onToggle}
        onTurnOn={onTurnOn}
        onTurnOff={onTurnOff}
        onPlayPause={onPlayPause}
        onBrightnessChange={onBrightnessChange}
        onTemperatureChange={onTemperatureChange}
        onVolumeChange={onVolumeChange}
        onActivateScene={onActivateScene}
        compact={compact}
      />
    </div>
  );
}

export default HADeviceCard;
