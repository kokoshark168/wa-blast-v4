import React from 'react';

interface ScoreGaugeProps {
  /** 0..100 */
  value: number;
  label?: string;
  /** Override the auto color band. */
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Rating text shown beneath the value. */
  rating?: string;
  /** invert color band (higher = worse, e.g. risk score) */
  invert?: boolean;
}

function bandColor(v: number, invert?: boolean): string {
  const score = invert ? 100 - v : v;
  if (score >= 75) return '#34d399'; // green-400
  if (score >= 50) return '#22d3ee'; // cyan-400
  if (score >= 25) return '#facc15'; // yellow-400
  return '#f87171'; // red-400
}

const SIZES = {
  sm: { d: 72, sw: 6, font: 'text-sm' },
  md: { d: 120, sw: 9, font: 'text-2xl' },
  lg: { d: 168, sw: 12, font: 'text-4xl' },
};

export function ScoreGauge({ value, label, color, size = 'md', rating, invert }: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const { d, sw, font } = SIZES[size];
  const r = (d - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const stroke = color ?? bandColor(clamped, invert);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: d, height: d }}>
        <svg width={d} height={d} className="-rotate-90">
          <circle cx={d / 2} cy={d / 2} r={r} stroke="#1f2937" strokeWidth={sw} fill="none" />
          <circle
            cx={d / 2}
            cy={d / 2}
            r={r}
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold ${font}`} style={{ color: stroke }}>
            {Math.round(clamped)}
          </span>
          {rating && <span className="text-[10px] text-gray-400 mt-0.5 px-1 text-center">{rating}</span>}
        </div>
      </div>
      {label && <span className="text-xs text-gray-400 mt-2">{label}</span>}
    </div>
  );
}

/** Horizontal bar variant for compact breakdowns. */
export function ScoreBar({
  value,
  label,
  invert,
}: {
  value: number;
  label: string;
  invert?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const color = bandColor(clamped, invert);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono" style={{ color }}>
          {Math.round(clamped)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${clamped}%`, backgroundColor: color, transition: 'width 0.5s ease' }}
        />
      </div>
    </div>
  );
}
