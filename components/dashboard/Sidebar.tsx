'use client';

import React from 'react';

const MODULES = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'smart-money', label: 'Smart Money Tracker', icon: '🎯' },
  { id: 'whale', label: 'Whale Intelligence', icon: '🐋' },
  { id: 'alerts', label: 'Alert Center', icon: '🔔' },
];

interface SidebarProps {
  activeModule: string;
  onModuleChange: (moduleId: string) => void;
}

export function Sidebar({ activeModule, onModuleChange }: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-950 border-r border-gray-800 p-6 overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold gradient-text">AlphaFlow</h1>
        <p className="text-xs text-gray-500 mt-1">Terminal v1.0</p>
      </div>

      <nav className="space-y-2">
        {MODULES.map((module) => (
          <button
            key={module.id}
            onClick={() => onModuleChange(module.id)}
            className={`w-full text-left px-4 py-2 rounded transition ${
              activeModule === module.id
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <span className="mr-2">{module.icon}</span>
            {module.label}
          </button>
        ))}
      </nav>

      <div className="mt-8 pt-6 border-t border-gray-800 space-y-2">
        <button className="w-full text-left px-4 py-2 text-gray-400 hover:text-white text-sm rounded transition hover:bg-gray-800/50">
          Settings
        </button>
        <button className="w-full text-left px-4 py-2 text-gray-400 hover:text-white text-sm rounded transition hover:bg-gray-800/50">
          Documentation
        </button>
        <button className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 text-sm rounded transition hover:bg-red-500/10">
          Logout
        </button>
      </div>
    </aside>
  );
}
