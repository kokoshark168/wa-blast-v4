import { useState } from 'react'
import { Swords, Activity, Users, BarChart3, Settings as SettingsIcon } from 'lucide-react'
import { useStore } from './store.jsx'
import BossTracker from './pages/BossTracker.jsx'
import Members from './pages/Members.jsx'
import Insights from './pages/Insights.jsx'
import Settings from './pages/Settings.jsx'

const TABS = [
  { id: 'tracker', label: 'Boss Tracker', icon: Activity },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function App() {
  const { state } = useStore()
  const [tab, setTab] = useState('tracker')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[#1c2740] bg-[#070b14]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] items-center gap-6 px-4 py-3">
          <div className="flex items-center gap-2 font-extrabold tracking-wide text-white">
            <Swords size={20} className="text-sky-400" />
            <span className="uppercase">{state.guildName}</span>
            <span className="ml-1 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
              Super Admin
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`btn border-transparent ${
                  tab === id
                    ? 'bg-sky-500/15 text-sky-300 !border-sky-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1700px] px-4 py-6">
        {tab === 'tracker' && <BossTracker />}
        {tab === 'members' && <Members />}
        {tab === 'insights' && <Insights />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  )
}
