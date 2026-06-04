'use client';

import React from 'react';

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  subscriptionTier: string;
}

interface HeaderProps {
  user: User | null;
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
      <div>
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="text-sm text-gray-400">Real-time market intelligence</p>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="text-sm font-medium">{user?.username}</p>
          <p className="text-xs text-gray-400 capitalize">{user?.subscriptionTier}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
          <span className="text-cyan-400 font-bold">{user?.username?.[0].toUpperCase()}</span>
        </div>
      </div>
    </header>
  );
}
