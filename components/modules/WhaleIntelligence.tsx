'use client';

export function WhaleIntelligence() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Whale Intelligence</h1>
      <div className="glass rounded-lg p-6">
        <p className="text-gray-400">Tracking large transactions and whale movements...</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['$100k+', '$1M+', '$10M+'].map((tier) => (
          <div key={tier} className="glass rounded-lg p-4">
            <p className="text-gray-400 text-sm">{tier} Transactions</p>
            <p className="text-2xl font-bold mt-2">0</p>
          </div>
        ))}
      </div>
    </div>
  );
}
