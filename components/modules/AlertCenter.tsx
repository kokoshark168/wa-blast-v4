'use client';

import React, { useState, useEffect } from 'react';

interface Alert {
  id: string;
  title: string;
  type: string;
  isActive: boolean;
}

export function AlertCenter() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/alerts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-gray-400">Loading alerts...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Alert Center</h1>
        <button className="bg-cyan-500 hover:bg-cyan-600 text-black font-semibold px-4 py-2 rounded transition">
          Create Alert
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center">
          <p className="text-gray-400">No alerts configured</p>
          <p className="text-sm text-gray-500 mt-2">Create your first alert to get notified on market events</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="glass rounded-lg p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold">{alert.title}</h3>
                <p className="text-xs text-gray-400">{alert.type}</p>
              </div>
              <div className={`w-3 h-3 rounded-full ${alert.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
