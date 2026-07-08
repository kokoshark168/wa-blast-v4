import { useMemo, useState } from 'react'
import { CalendarCheck, Gift, Plus, Trash2, UserRound } from 'lucide-react'
import { useStore, memberStats, todayISO } from '../store.jsx'
import MemberModal from '../components/MemberModal.jsx'
import { Modal } from '../components/ui.jsx'

export default function Members() {
  const { state, addMembers, updateMember, deleteMember, toggleCheckin, addEvent } = useStore()
  const [query, setQuery] = useState('')
  const [bulk, setBulk] = useState('')
  const [open, setOpen] = useState(null)
  const [showEvent, setShowEvent] = useState(false)

  const today = todayISO()
  const checkedToday = useMemo(
    () => new Set(state.checkins.filter((c) => c.date === today).map((c) => c.memberId)),
    [state.checkins, today],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.members
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({ member: m, stats: memberStats(state, m.id) }))
      .sort((a, b) => b.stats.total - a.stats.total)
  }, [state, query])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <UserRound size={22} className="text-sky-400" /> Members
        </h1>
        <span className="rounded-full bg-[#13203a] px-3 py-1 text-xs text-slate-300">{state.members.length} members</span>
        <div className="ml-auto flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search member" className="input w-44" />
          <button onClick={() => setShowEvent(true)} className="btn bg-[#0e1626] hover:border-sky-500">
            <Gift size={15} /> Record guild activity
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-300">Add members (comma or new line)</div>
        <div className="mt-2 flex gap-2">
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={2}
            placeholder={'PlayerOne, PlayerTwo\nPlayerThree'}
            className="input flex-1 resize-y"
          />
          <button
            onClick={() => { addMembers(bulk.split(/[\n,]/)); setBulk('') }}
            disabled={!bulk.trim()}
            className="btn self-start bg-sky-600 !border-sky-500 text-white hover:bg-sky-500 disabled:opacity-40"
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr className="border-b border-[#1c2740]">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3 text-center">Kills</th>
              <th className="px-4 py-3 text-center">Check-ins</th>
              <th className="px-4 py-3 text-center">Events</th>
              <th className="px-4 py-3 text-center">Missed</th>
              <th className="px-4 py-3 text-right">Points</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member: m, stats }) => (
              <tr key={m.id} className="border-b border-[#141d33] hover:bg-[#0e1626]">
                <td className="px-4 py-2">
                  <button onClick={() => setOpen(m)} className="font-medium text-slate-100 hover:text-sky-300">
                    {m.name}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <input
                    value={m.note}
                    onChange={(e) => updateMember(m.id, { note: e.target.value })}
                    placeholder="—"
                    className="w-full bg-transparent text-xs text-slate-400 outline-none placeholder:text-slate-600"
                  />
                </td>
                <td className="px-4 py-2 text-center">{stats.kills.length}</td>
                <td className="px-4 py-2 text-center">{stats.checkins.length}</td>
                <td className="px-4 py-2 text-center">{stats.events.length}</td>
                <td className={`px-4 py-2 text-center ${stats.missed.length ? 'text-rose-400' : ''}`}>{stats.missed.length}</td>
                <td className="px-4 py-2 text-right font-bold text-sky-400">{stats.total}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => toggleCheckin(today, m.id)}
                      title="Toggle today's check-in"
                      className={`rounded border px-2 py-1 text-xs ${
                        checkedToday.has(m.id)
                          ? 'border-emerald-600 bg-emerald-600/20 text-emerald-300'
                          : 'border-[#243150] text-slate-400 hover:text-white'
                      }`}
                    >
                      <CalendarCheck size={13} />
                    </button>
                    <button
                      onClick={() => confirm(`Delete ${m.name} and all their records?`) && deleteMember(m.id)}
                      className="rounded border border-[#243150] px-2 py-1 text-xs text-slate-500 hover:border-rose-600 hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No members</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <MemberModal member={open} onClose={() => setOpen(null)} />}
      {showEvent && <EventModal onClose={() => setShowEvent(false)} addEvent={addEvent} members={state.members} defaultPts={state.settings.eventPts} />}
    </div>
  )
}

function EventModal({ onClose, addEvent, members, defaultPts }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayISO())
  const [points, setPoints] = useState(defaultPts)
  const [sel, setSel] = useState(() => new Set())
  const [q, setQ] = useState('')

  const filtered = members.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()))
  const toggle = (id) => {
    const next = new Set(sel)
    next.has(id) ? next.delete(id) : next.add(id)
    setSel(next)
  }

  return (
    <Modal title="Record guild activity" subtitle="Give event points to everyone who joined (siege, guild war, event…)" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Activity name" className="input sm:col-span-1" />
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="input" />
        <input type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} className="input" placeholder="Points" />
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="input mt-3 w-full" />
      <div className="mt-2 flex gap-2 text-xs">
        <button onClick={() => setSel(new Set(members.map((m) => m.id)))} className="text-sky-400 hover:underline">Select all</button>
        <button onClick={() => setSel(new Set())} className="text-slate-500 hover:underline">Clear</button>
        <span className="ml-auto text-slate-500">{sel.size} selected</span>
      </div>
      <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-[#1c2740]">
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => toggle(m.id)}
            className={`flex w-full items-center gap-2 border-b border-[#141d33] px-3 py-2 text-left text-sm ${
              sel.has(m.id) ? 'bg-sky-500/15 text-sky-200' : 'text-slate-300 hover:bg-[#101b30]'
            }`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${sel.has(m.id) ? 'border-sky-400 bg-sky-500 text-white' : 'border-[#2a3a5e]'}`}>
              {sel.has(m.id) ? '✓' : ''}
            </span>
            {m.name}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <button onClick={onClose} className="btn text-slate-300">Cancel</button>
        <button
          onClick={() => { addEvent({ name: name.trim(), date, points: Number(points) || 0, memberIds: [...sel] }); onClose() }}
          disabled={!name.trim() || !sel.size}
          className="btn bg-sky-600 !border-sky-500 text-white hover:bg-sky-500 disabled:opacity-40"
        >
          Save ({sel.size} members)
        </button>
      </div>
    </Modal>
  )
}
