import React from 'react';

/** Shown when an API response is flagged `degraded: true` (stale / partial data). */
export function DegradedBanner({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300">
      ⚠ {message ?? 'Showing degraded data — some upstream sources are unavailable. Values may be stale.'}
    </div>
  );
}
