import { useMemo } from 'react'
import { BarChart3, CalendarCheck, Gift, Skull, Trophy } from 'lucide-react'
import { useStore, memberStats } from '../store.jsx'
import { StatCard } from '../components/ui.jsx'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Insights() {
  const { state } = useStore()

  const rows = useMemo(
    () =>
      state.members
        .map((m) => ({ member: m, stats: memberStats(state, m.id) }))
        .sort((a, b) => b.stats.total - a.stats.total),
    [state],
  )

  const totalKills = state.kills.length
  const totalCheckins = state.checkins.length
  const totalEvents = state.events.length
  const maxPts = Math.max(1, ...rows.map((r) => r.stats.total))

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
        <BarChart3 size={22} className="text-sky-400" /> Insights
      </h1>

      <div className="flex flex-wrap gap-3">
        <StatCard icon={Skull} label="Total boss kills recorded" value={totalKills} accent="text-white" />
        <StatCard icon={CalendarCheck} label="Daily check-ins" value={totalCheckins} accent="text-white" />
        <StatCard icon={Gift} label="Guild activities" value={totalEvents} accent="text-white" />
        <StatCard icon={Trophy} label="Members" value={state.members.length} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr className="border-b border-[#1c2740]">
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Contribution</th>
              <th className="px-4 py-3 text-center">Kills</th>
              <th className="px-4 py-3 text-center">Check-ins</th>
              <th className="px-4 py-3 text-center">Events</th>
              <th className="px-4 py-3 text-center">Missed</th>
              <th className="px-4 py-3 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member: m, stats }, i) => (
              <tr key={m.id} className="border-b border-[#141d33] hover:bg-[#0e1626]">
                <td className="px-4 py-2 text-slate-400">{MEDALS[i] || i + 1}</td>
                <td className="px-4 py-2 font-medium text-slate-100">{m.name}</td>
                <td className="px-4 py-2">
                  <div className="h-2 w-full max-w-64 overflow-hidden rounded-full bg-[#101b30]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
                      style={{ width: `${(stats.total / maxPts) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-2 text-center">{stats.kills.length}</td>
                <td className="px-4 py-2 text-center">{stats.checkins.length}</td>
                <td className="px-4 py-2 text-center">{stats.events.length}</td>
                <td className={`px-4 py-2 text-center ${stats.missed.length ? 'text-rose-400' : 'text-slate-500'}`}>
                  {stats.missed.length}
                </td>
                <td className="px-4 py-2 text-right font-bold text-sky-400">{stats.total} pts</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No members yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
