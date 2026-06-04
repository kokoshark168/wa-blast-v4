import React from 'react';

interface SpinnerProps {
  label?: string;
  className?: string;
}

/** Inline spinner for in-module loading states. */
export function Spinner({ label = 'Loading…', className = '' }: SpinnerProps) {
  return (
    <div className={`flex items-center justify-center gap-3 py-12 text-gray-400 ${className}`}>
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-500 border-t-transparent" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
