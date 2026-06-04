'use client';

import React, { useState, useEffect } from 'react';

interface Wallet {
  id: string;
  address: string;
  name: string;
  roi: number;
  winRate: number;
  profitFactor: number;
  riskScore: number;
}

export function SmartMoneyTracker() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/wallets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setWallets(data.wallets || []);
    } catch (error) {
      console.error('Failed to fetch wallets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-gray-400">Loading wallets...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Smart Money Tracker</h1>
        <button className="bg-cyan-500 hover:bg-cyan-600 text-black font-semibold px-4 py-2 rounded transition">
          Add Wallet
        </button>
      </div>

      {wallets.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center">
          <p className="text-gray-400">No wallets tracked yet</p>
          <p className="text-sm text-gray-500 mt-2">Add your first wallet to start tracking smart money</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="glass rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold">{wallet.name}</h3>
                  <p className="text-xs text-gray-400 font-mono">{wallet.address.slice(0, 10)}...</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${wallet.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {wallet.roi > 0 ? '+' : ''}{wallet.roi.toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <p className="text-gray-400">Win Rate</p>
                  <p className="font-bold">{(wallet.winRate * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-gray-400">Profit Factor</p>
                  <p className="font-bold">{wallet.profitFactor.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Risk Score</p>
                  <p className="font-bold">{wallet.riskScore.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
