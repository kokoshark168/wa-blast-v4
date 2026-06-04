'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SmartMoneyTracker } from '../modules/SmartMoneyTracker';
import { WhaleIntelligence } from '../modules/WhaleIntelligence';
import { AlertCenter } from '../modules/AlertCenter';

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  subscriptionTier: string;
}

interface DashboardProps {
  user: User | null;
}

export function Dashboard({ user }: DashboardProps) {
  const [activeModule, setActiveModule] = useState('overview');

  const renderModule = () => {
    switch (activeModule) {
      case 'smart-money':
        return <SmartMoneyTracker />;
      case 'whale':
        return <WhaleIntelligence />;
      case 'alerts':
        return <AlertCenter />;
      default:
        return <OverviewModule />;
    }
  };

  return (
    <div className="flex h-screen bg-black text-white">
      <Sidebar activeModule={activeModule} onModuleChange={setActiveModule} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-auto">
          <div className="p-6">{renderModule()}</div>
        </main>
      </div>
    </div>
  );
}

function OverviewModule() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Wallets', value: '0', change: '+0%' },
          { label: 'Total PnL', value: '$0', change: '+0%' },
          { label: 'Active Alerts', value: '0', change: '+0%' },
          { label: 'Win Rate', value: '0%', change: '+0%' },
        ].map((card) => (
          <div key={card.label} className="glass rounded-lg p-4">
            <p className="text-gray-400 text-sm">{card.label}</p>
            <p className="text-2xl font-bold mt-2">{card.value}</p>
            <p className="text-green-400 text-xs mt-1">{card.change}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Getting Started</h2>
        <div className="space-y-3 text-gray-300">
          <p>1. Add your first wallet to start tracking smart money</p>
          <p>2. Create alerts for whale transactions</p>
          <p>3. Monitor real-time market intelligence</p>
          <p>4. Use AlphaFlow for institutional-grade insights</p>
        </div>
      </div>
    </div>
  );
}
