import React from 'react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  title = 'Nothing here yet',
  message,
  icon = '∅',
  action,
}: EmptyStateProps) {
  return (
    <div className="glass rounded-lg p-12 text-center">
      <div className="text-3xl mb-3 text-gray-600">{icon}</div>
      <p className="text-gray-300 font-medium">{title}</p>
      {message && <p className="text-sm text-gray-500 mt-2">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
