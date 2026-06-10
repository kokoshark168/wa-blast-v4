import React from 'react';

export type BadgeColor = 'cyan' | 'green' | 'red' | 'yellow' | 'purple' | 'blue' | 'gray' | 'orange';

const COLORS: Record<BadgeColor, string> = {
  cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40',
  green: 'bg-green-500/15 text-green-400 border-green-500/40',
  red: 'bg-red-500/15 text-red-400 border-red-500/40',
  yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/40',
  orange: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  gray: 'bg-gray-500/15 text-gray-300 border-gray-500/40',
};

interface BadgeProps {
  color?: BadgeColor;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ color = 'gray', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${COLORS[color]} ${className}`}
    >
      {children}
    </span>
  );
}
