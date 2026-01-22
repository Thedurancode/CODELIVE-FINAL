'use client';

import { cn } from '@/lib/utils';
import type { ChartData } from '@/lib/chat-parser';

interface ChatChartProps {
  data: ChartData;
  className?: string;
}

const DEFAULT_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
];

function formatValue(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function BarChart({ data, showLegend }: { data: ChartData['data']; showLegend?: boolean }) {
  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="space-y-3">
      {data.map((item, index) => {
        const percentage = (item.value / maxValue) * 100;
        const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

        return (
          <div key={index} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 truncate max-w-[60%]">{item.label}</span>
              <span className="text-zinc-200 font-medium">{formatValue(item.value)}</span>
            </div>
            <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data, showLegend }: { data: ChartData['data']; showLegend?: boolean }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = -90; // Start from top

  return (
    <div className="flex items-center gap-6">
      {/* SVG Donut */}
      <div className="relative w-32 h-32 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {data.map((item, index) => {
            const percentage = (item.value / total) * 100;
            const angle = (percentage / 100) * 360;
            const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

            // Calculate arc path
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            currentAngle = endAngle;

            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;

            const x1 = 50 + 40 * Math.cos(startRad);
            const y1 = 50 + 40 * Math.sin(startRad);
            const x2 = 50 + 40 * Math.cos(endRad);
            const y2 = 50 + 40 * Math.sin(endRad);

            const largeArc = angle > 180 ? 1 : 0;

            // For full circle edge case
            if (percentage >= 99.9) {
              return (
                <circle
                  key={index}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={color}
                  strokeWidth="20"
                />
              );
            }

            return (
              <path
                key={index}
                d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={color}
                className="transition-all duration-500"
              />
            );
          })}
          {/* Inner circle for donut effect */}
          <circle cx="50" cy="50" r="25" fill="#18181b" />
        </svg>
        {/* Center total */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-zinc-200">{formatValue(total)}</span>
        </div>
      </div>

      {/* Legend */}
      {showLegend !== false && (
        <div className="flex-1 space-y-2">
          {data.map((item, index) => {
            const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
            const percentage = ((item.value / total) * 100).toFixed(1);

            return (
              <div key={index} className="flex items-center gap-2 text-xs">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-zinc-400 truncate flex-1">{item.label}</span>
                <span className="text-zinc-300 font-medium">{percentage}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PieChart({ data, showLegend }: { data: ChartData['data']; showLegend?: boolean }) {
  // Pie is same as donut but without center hole
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = -90;

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-32 h-32 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {data.map((item, index) => {
            const percentage = (item.value / total) * 100;
            const angle = (percentage / 100) * 360;
            const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            currentAngle = endAngle;

            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;

            const x1 = 50 + 45 * Math.cos(startRad);
            const y1 = 50 + 45 * Math.sin(startRad);
            const x2 = 50 + 45 * Math.cos(endRad);
            const y2 = 50 + 45 * Math.sin(endRad);

            const largeArc = angle > 180 ? 1 : 0;

            if (percentage >= 99.9) {
              return (
                <circle
                  key={index}
                  cx="50"
                  cy="50"
                  r="45"
                  fill={color}
                />
              );
            }

            return (
              <path
                key={index}
                d={`M 50 50 L ${x1} ${y1} A 45 45 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={color}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
      </div>

      {showLegend !== false && (
        <div className="flex-1 space-y-2">
          {data.map((item, index) => {
            const color = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
            const percentage = ((item.value / total) * 100).toFixed(1);

            return (
              <div key={index} className="flex items-center gap-2 text-xs">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-zinc-400 truncate flex-1">{item.label}</span>
                <span className="text-zinc-300 font-medium">{percentage}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LineChart({ data }: { data: ChartData['data'] }) {
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const points = data.map((item, index) => {
    const x = (index / (data.length - 1)) * 280 + 10;
    const y = 90 - ((item.value - minValue) / range) * 70;
    return { x, y, ...item };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const color = data[0]?.color || DEFAULT_COLORS[0];

  return (
    <div className="space-y-2">
      <svg viewBox="0 0 300 100" className="w-full h-24">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(y => (
          <line
            key={y}
            x1="10"
            y1={20 + (y / 100) * 70}
            x2="290"
            y2={20 + (y / 100) * 70}
            stroke="#27272a"
            strokeWidth="1"
          />
        ))}

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Area under line */}
        <path
          d={`${pathD} L ${points[points.length - 1].x} 90 L ${points[0].x} 90 Z`}
          fill={color}
          fillOpacity="0.1"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#18181b"
            stroke={color}
            strokeWidth="2"
          />
        ))}
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-zinc-500 px-2">
        {data.map((item, index) => (
          <span key={index} className="truncate max-w-[60px] text-center">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChatChart({ data, className }: ChatChartProps) {
  const { type, title, data: chartData, showLegend } = data;

  if (!chartData || chartData.length === 0) {
    return (
      <div className={cn('p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg my-2 text-center', className)}>
        <p className="text-sm text-zinc-500">No chart data available</p>
      </div>
    );
  }

  return (
    <div className={cn('w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden my-3', className)}>
      {title && (
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        </div>
      )}

      <div className="p-4">
        {type === 'bar' && <BarChart data={chartData} showLegend={showLegend} />}
        {type === 'donut' && <DonutChart data={chartData} showLegend={showLegend} />}
        {type === 'pie' && <PieChart data={chartData} showLegend={showLegend} />}
        {type === 'line' && <LineChart data={chartData} />}
      </div>
    </div>
  );
}

export default ChatChart;
