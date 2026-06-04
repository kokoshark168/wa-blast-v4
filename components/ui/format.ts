// Shared display formatters for AlphaFlow modules.

export function fmtUsd(n: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(n)) return '$0';
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  }
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function fmtNum(n: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(n)) return '0';
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtPct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '0%';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function fmtPct01(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0%';
  return `${(n * 100).toFixed(digits)}%`;
}

export function shortAddr(addr: string): string {
  if (!addr) return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function fmtDateTime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { hour12: false });
}

export function colorForValue(n: number): string {
  return n >= 0 ? 'text-green-400' : 'text-red-400';
}
