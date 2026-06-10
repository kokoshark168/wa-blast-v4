'use client';

import React from 'react';

interface ModuleItem {
  id: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

interface ModuleSection {
  title: string;
  items: ModuleItem[];
}

const SECTIONS: ModuleSection[] = [
  {
    title: 'General',
    items: [{ id: 'overview', label: 'Overview', icon: '📊' }],
  },
  {
    title: 'Intelligence',
    items: [
      { id: 'smart-money', label: 'Smart Money Tracker', icon: '🎯' },
      { id: 'whale', label: 'Whale Intelligence', icon: '🐋' },
      { id: 'onchain', label: 'On-Chain Intelligence', icon: '⛓️' },
      { id: 'sentiment', label: 'Social Sentiment', icon: '💬' },
      { id: 'tokens', label: 'Token Discovery', icon: '💎' },
    ],
  },
  {
    title: 'Derivatives',
    items: [
      { id: 'hyperliquid', label: 'Hyperliquid Monitor', icon: '⚡' },
      { id: 'open-interest', label: 'Open Interest', icon: '📈' },
      { id: 'liquidations', label: 'Liquidation Heatmap', icon: '🔥' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { id: 'alpha', label: 'Alpha Score', icon: '🧠' },
      { id: 'research', label: 'AI Research', icon: '📰' },
      { id: 'screener', label: 'Screener', icon: '🔎' },
      { id: 'backtest', label: 'Backtesting', icon: '🧪' },
      { id: 'portfolio', label: 'Portfolio Tracker', icon: '💼' },
    ],
  },
  {
    title: 'Account',
    items: [
      { id: 'alerts', label: 'Alert Center', icon: '🔔' },
      { id: 'admin', label: 'Admin', icon: '🛡️', adminOnly: true },
    ],
  },
];

interface SidebarProps {
  activeModule: string;
  onModuleChange: (moduleId: string) => void;
  isAdmin?: boolean;
}

export function Sidebar({ activeModule, onModuleChange, isAdmin }: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-950 border-r border-gray-800 p-6 overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold gradient-text">AlphaFlow</h1>
        <p className="text-xs text-gray-500 mt-1">Terminal v1.0</p>
      </div>

      <nav className="space-y-6">
        {SECTIONS.map((section) => {
          const items = section.items.filter((m) => !m.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={section.title} className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold px-2">{section.title}</p>
              {items.map((module) => (
                <button
                  key={module.id}
                  onClick={() => onModuleChange(module.id)}
                  className={`w-full text-left px-4 py-2 rounded transition text-sm ${
                    activeModule === module.id
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                >
                  <span className="mr-2">{module.icon}</span>
                  {module.label}
                </button>
              ))}
            </div>
          );
        })}
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
