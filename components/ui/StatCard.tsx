import React from 'react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  delta?: number | string;
  deltaPositive?: boolean;
  hint?: string;
}

export function StatCard({ label, value, delta, deltaPositive, hint }: StatCardProps) {
  const positive =
    deltaPositive ??
    (typeof delta === 'number' ? delta >= 0 : typeof delta === 'string' ? !delta.startsWith('-') : true);

  return (
    <div className="glass rounded-lg p-4">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-2xl font-bold mt-2 break-words">{value}</p>
      {delta !== undefined && delta !== null && (
        <p className={`text-xs mt-1 ${positive ? 'text-green-400' : 'text-red-400'}`}>
          {typeof delta === 'number' ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%` : delta}
        </p>
      )}
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
