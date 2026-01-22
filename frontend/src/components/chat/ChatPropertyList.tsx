'use client';

import { ChatPropertyCard } from './ChatPropertyCard';
import type { PropertyListData } from '@/lib/chat-parser';
import { cn } from '@/lib/utils';
import { Home } from 'lucide-react';

interface ChatPropertyListProps {
  data: PropertyListData;
  className?: string;
}

export function ChatPropertyList({ data, className }: ChatPropertyListProps) {
  const { properties, title, showCount = true } = data;

  if (!properties || properties.length === 0) {
    return (
      <div className={cn('p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg my-2 text-center', className)}>
        <Home className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
        <p className="text-sm text-zinc-500">No properties found</p>
      </div>
    );
  }

  return (
    <div className={cn('my-3', className)}>
      {/* Header */}
      {(title || showCount) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-sm font-medium text-zinc-300">{title}</h3>}
          {showCount && (
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded-full">
              {properties.length} {properties.length === 1 ? 'property' : 'properties'}
            </span>
          )}
        </div>
      )}

      {/* Property Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {properties.map((property, index) => (
          <ChatPropertyCard
            key={property.id || `property-${index}`}
            property={property}
          />
        ))}
      </div>
    </div>
  );
}

export default ChatPropertyList;
