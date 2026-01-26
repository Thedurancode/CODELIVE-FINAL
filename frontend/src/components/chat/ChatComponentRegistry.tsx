'use client';

import { lazy, Suspense, type ComponentType } from 'react';
import type {
  UIComponentType,
  UIComponentData,
  ConfirmationData,
  ChartData,
  ActionButtonsData,
} from '@/lib/chat-parser';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy load components for better performance
const ChatConfirmation = lazy(() => import('./ChatConfirmation'));
const ChatChart = lazy(() => import('./ChatChart'));
const ChatActionButtons = lazy(() => import('./ChatActionButtons'));

// Component props mapping
interface ComponentPropsMap {
  confirmation: { data: ConfirmationData; onAction?: (action: string, data?: Record<string, unknown>) => void };
  chart: { data: ChartData };
  action_buttons: { data: ActionButtonsData; onAction?: (action: string, data?: Record<string, unknown>) => void };
}

// Loading fallback for lazy components
function ComponentSkeleton() {
  return (
    <div className="w-full max-w-sm p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg my-2">
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2 mb-3" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

// Registry of component types to their React components
const componentRegistry: Record<
  UIComponentType,
  ComponentType<{ data: UIComponentData; onAction?: (action: string, data?: Record<string, unknown>) => void }>
> = {
  confirmation: ({ data, onAction }) => <ChatConfirmation data={data as ConfirmationData} onAction={onAction} />,
  chart: ({ data }) => <ChatChart data={data as ChartData} />,
  action_buttons: ({ data, onAction }) => <ChatActionButtons data={data as ActionButtonsData} onAction={onAction} />,
};

interface ChatUIComponentProps {
  type: UIComponentType;
  data: UIComponentData;
  onAction?: (action: string, data?: Record<string, unknown>) => void;
}

/**
 * Renders a UI component based on its type
 */
export function ChatUIComponent({ type, data, onAction }: ChatUIComponentProps) {
  const Component = componentRegistry[type];

  if (!Component) {
    console.warn(`Unknown UI component type: ${type}`);
    return null;
  }

  return (
    <Suspense fallback={<ComponentSkeleton />}>
      <Component data={data} onAction={onAction} />
    </Suspense>
  );
}

/**
 * Check if a component type is registered
 */
export function isRegisteredComponent(type: string): type is UIComponentType {
  return type in componentRegistry;
}

/**
 * Get all registered component types
 */
export function getRegisteredComponentTypes(): UIComponentType[] {
  return Object.keys(componentRegistry) as UIComponentType[];
}

export default ChatUIComponent;
