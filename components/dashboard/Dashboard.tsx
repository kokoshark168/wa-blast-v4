'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SmartMoneyTracker } from '../modules/SmartMoneyTracker';
import { WhaleIntelligence } from '../modules/WhaleIntelligence';
import { HyperliquidMonitor } from '../modules/HyperliquidMonitor';
import { OpenInterest } from '../modules/OpenInterest';
import { LiquidationHeatmap } from '../modules/LiquidationHeatmap';
import { TokenDiscovery } from '../modules/TokenDiscovery';
import { SocialSentiment } from '../modules/SocialSentiment';
import { OnChainIntelligence } from '../modules/OnChainIntelligence';
import { AIResearch } from '../modules/AIResearch';
import { AlphaScore } from '../modules/AlphaScore';
import { Backtesting } from '../modules/Backtesting';
import { PortfolioTracker } from '../modules/PortfolioTracker';
import { Screener } from '../modules/Screener';
import { AlertCenter } from '../modules/AlertCenter';
import { AdminDashboard } from '../admin/AdminDashboard';

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
  const isAdmin = user?.role === 'ADMIN';

  const renderModule = () => {
    switch (activeModule) {
      case 'smart-money':
        return <SmartMoneyTracker />;
      case 'whale':
        return <WhaleIntelligence />;
      case 'hyperliquid':
        return <HyperliquidMonitor />;
      case 'open-interest':
        return <OpenInterest />;
      case 'liquidations':
        return <LiquidationHeatmap />;
      case 'tokens':
        return <TokenDiscovery />;
      case 'sentiment':
        return <SocialSentiment />;
      case 'onchain':
        return <OnChainIntelligence />;
      case 'research':
        return <AIResearch />;
      case 'alpha':
        return <AlphaScore />;
      case 'backtest':
        return <Backtesting />;
      case 'portfolio':
        return <PortfolioTracker />;
      case 'screener':
        return <Screener />;
      case 'alerts':
        return <AlertCenter />;
      case 'admin':
        return <AdminDashboard role={user?.role} />;
      default:
        return <OverviewModule />;
    }
  };

  return (
    <div className="flex h-screen bg-black text-white">
      <Sidebar activeModule={activeModule} onModuleChange={setActiveModule} isAdmin={isAdmin} />
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
