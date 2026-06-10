import React from 'react';

interface TabOption<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Simple pill tab group matching the dark glass theme. */
export function Tabs<T extends string>({ options, value, onChange, className = '' }: TabsProps<T>) {
  return (
    <div className={`inline-flex rounded-lg border border-gray-800 bg-gray-950/60 p-1 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 text-sm rounded-md transition ${
            value === opt.value
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
              : 'text-gray-400 hover:text-white border border-transparent'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
