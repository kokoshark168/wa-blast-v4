import { useMemo, useState } from 'react'
import { AlertCircle, CalendarCheck, Gift, Skull, Trophy } from 'lucide-react'
import { useStore, memberStats, todayISO } from '../store.jsx'
import { Modal, StatCard } from './ui.jsx'

export default function MemberModal({ member, onClose }) {
  const { state, toggleCheckin } = useStore()
  const [tab, setTab] = useState('boss')

  const stats = useMemo(() => memberStats(state, member.id), [state, member.id])
  const bossById = useMemo(() => Object.fromEntries(state.bosses.map((b) => [b.id, b])), [state.bosses])
  const groupById = useMemo(() => Object.fromEntries(state.groups.map((g) => [g.id, g])), [state.groups])

  const today = todayISO()
  const checkedToday = state.checkins.some((c) => c.date === today && c.memberId === member.id)

  const bossRows = useMemo(
    () => [...stats.kills].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [stats.kills],
  )
  const dailyRows = useMemo(
    () => [...stats.checkins].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [stats.checkins],
  )
  const eventRows = useMemo(
    () => [...stats.events].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [stats.events],
  )

  const tabs = [
    { id: 'boss', label: `Boss (${stats.kills.length})`, icon: Skull },
    { id: 'missed', label: `Missed (${stats.missed.length})`, icon: AlertCircle },
    { id: 'daily', label: `Daily (${stats.checkins.length})`, icon: CalendarCheck },
    { id: 'event', label: `Event (${stats.events.length})`, icon: Gift },
  ]

  const groupType = (bossId) => {
    const b = bossById[bossId]
    if (!b) return '—'
    const g = groupById[b.groupId]
    return `${g ? g.name : '?'} · ${b.type}`
  }

  return (
    <Modal title={member.name} subtitle={member.note || 'Guild member'} onClose={onClose} wide>
      <div className="flex flex-wrap gap-3">
        <StatCard icon={Trophy} label="Total points" value={`${stats.total} pts`} />
        <StatCard icon={Skull} label="Boss kills" value={`${stats.kills.length} · ${stats.killPoints}pts`} accent="text-white" />
        <StatCard icon={AlertCircle} label="Missed bosses" value={stats.missed.length} accent={stats.missed.length ? 'text-rose-400' : 'text-white'} />
        <StatCard icon={CalendarCheck} label="Daily check-ins" value={`${stats.checkins.length} · ${stats.checkinPoints}pts`} accent="text-white" />
        <StatCard icon={Gift} label="Guild activities" value={`${stats.events.length} · ${stats.eventPoints}pts`} accent="text-white" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-1 rounded-xl border border-[#1c2740] bg-[#0e1626] p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm ${
                tab === id ? 'bg-[#070b14] font-semibold text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => toggleCheckin(today, member.id)}
          className={`btn ${checkedToday ? 'bg-emerald-600/20 !border-emerald-600 text-emerald-300' : 'bg-[#0e1626] hover:border-sky-500'}`}
        >
          <CalendarCheck size={14} />
          {checkedToday ? 'Checked in today ✓' : 'Check-in today'}
        </button>
      </div>

      <div className="mt-3 max-h-[45vh] overflow-y-auto rounded-xl border border-[#1c2740]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0e1626] text-left text-xs text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">{tab === 'daily' ? 'Check-in' : tab === 'event' ? 'Event' : 'Boss'}</th>
              {(tab === 'boss' || tab === 'missed') && <th className="px-4 py-2.5">Group / Type</th>}
              <th className="px-4 py-2.5 text-right">+Points</th>
            </tr>
          </thead>
          <tbody>
            {tab === 'boss' && bossRows.map((k, i) => (
              <tr key={i} className="border-t border-[#141d33]">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{k.date}</td>
                <td className="px-4 py-2.5 text-slate-200">{bossById[k.bossId]?.name || 'Deleted boss'}</td>
                <td className="px-4 py-2.5 text-slate-400">{groupType(k.bossId)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-sky-400">+{state.settings.killPts}</td>
              </tr>
            ))}
            {tab === 'missed' && stats.missed.map((k, i) => (
              <tr key={i} className="border-t border-[#141d33]">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{k.date}</td>
                <td className="px-4 py-2.5 text-rose-300">{bossById[k.bossId]?.name || 'Deleted boss'}</td>
                <td className="px-4 py-2.5 text-slate-400">{groupType(k.bossId)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">—</td>
              </tr>
            ))}
            {tab === 'daily' && dailyRows.map((c, i) => (
              <tr key={i} className="border-t border-[#141d33]">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{c.date}</td>
                <td className="px-4 py-2.5 text-slate-200">Daily check-in</td>
                <td className="px-4 py-2.5 text-right font-semibold text-sky-400">+{state.settings.checkinPts}</td>
              </tr>
            ))}
            {tab === 'event' && eventRows.map((e) => (
              <tr key={e.id} className="border-t border-[#141d33]">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{e.date}</td>
                <td className="px-4 py-2.5 text-slate-200">{e.name}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-sky-400">+{e.points}</td>
              </tr>
            ))}
            {((tab === 'boss' && !bossRows.length) ||
              (tab === 'missed' && !stats.missed.length) ||
              (tab === 'daily' && !dailyRows.length) ||
              (tab === 'event' && !eventRows.length)) && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No records yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
