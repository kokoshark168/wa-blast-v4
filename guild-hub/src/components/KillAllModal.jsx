import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Modal } from './ui.jsx'

function PickList({ items, selected, onToggle, renderLabel, searchPlaceholder }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? items.filter((it) => it._search.includes(s)) : items
  }, [items, q])
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="input mb-2" />
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[#1c2740]">
        {filtered.map((it) => (
          <button
            key={it.id}
            onClick={() => onToggle(it.id)}
            className={`flex w-full items-center gap-2 border-b border-[#141d33] px-3 py-2 text-left text-sm ${
              selected.has(it.id) ? 'bg-sky-500/15 text-sky-200' : 'text-slate-300 hover:bg-[#101b30]'
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                selected.has(it.id) ? 'border-sky-400 bg-sky-500 text-white' : 'border-[#2a3a5e]'
              }`}
            >
              {selected.has(it.id) ? '✓' : ''}
            </span>
            {renderLabel(it)}
          </button>
        ))}
        {!filtered.length && <div className="px-3 py-6 text-center text-sm text-slate-500">No match</div>}
      </div>
    </div>
  )
}

export default function KillAllModal({ date, onClose }) {
  const { state, setKills } = useStore()
  const [killDate, setKillDate] = useState(date)
  const groupById = useMemo(() => Object.fromEntries(state.groups.map((g) => [g.id, g])), [state.groups])

  const bosses = useMemo(
    () => state.bosses.map((b) => ({
      ...b,
      _search: `${b.name} ${groupById[b.groupId]?.name || ''}`.toLowerCase(),
    })),
    [state.bosses, groupById],
  )
  const members = useMemo(
    () => state.members.map((m) => ({ ...m, _search: m.name.toLowerCase() })),
    [state.members],
  )

  const [selBosses, setSelBosses] = useState(() => new Set())
  const [selMembers, setSelMembers] = useState(() => new Set(state.members.map((m) => m.id)))

  const toggle = (set, setter) => (id) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  const save = () => {
    if (!selBosses.size || !selMembers.size) return
    setKills(killDate, [...selMembers], [...selBosses], true)
    onClose()
  }

  return (
    <Modal
      title="Kill All — record multiple bosses"
      subtitle="Pick the bosses killed and who was there. One click saves the whole matrix."
      onClose={onClose}
      wide
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-slate-400">Kill date</span>
        <input type="date" value={killDate} onChange={(e) => e.target.value && setKillDate(e.target.value)} className="input" />
      </div>
      <div className="grid gap-4 md:grid-cols-2" style={{ height: '50vh' }}>
        <div className="flex min-h-0 flex-col">
          <div className="mb-1 flex items-center justify-between text-sm font-semibold text-slate-300">
            Bosses <span className="text-xs font-normal text-slate-500">{selBosses.size} selected</span>
          </div>
          <div className="mb-2 flex gap-2 text-xs">
            <button onClick={() => setSelBosses(new Set(state.bosses.map((b) => b.id)))} className="text-sky-400 hover:underline">Select all</button>
            <button onClick={() => setSelBosses(new Set())} className="text-slate-500 hover:underline">Clear</button>
          </div>
          <PickList
            items={bosses}
            selected={selBosses}
            onToggle={toggle(selBosses, setSelBosses)}
            searchPlaceholder="Search bosses..."
            renderLabel={(b) => (
              <span>
                <b>{b.name}</b> <span className="text-xs text-slate-500">Lv.{b.level}</span>{' '}
                <span className="text-xs" style={{ color: groupById[b.groupId]?.color }}>
                  {groupById[b.groupId]?.name}
                </span>
              </span>
            )}
          />
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="mb-1 flex items-center justify-between text-sm font-semibold text-slate-300">
            Members <span className="text-xs font-normal text-slate-500">{selMembers.size} selected</span>
          </div>
          <div className="mb-2 flex gap-2 text-xs">
            <button onClick={() => setSelMembers(new Set(state.members.map((m) => m.id)))} className="text-sky-400 hover:underline">Select all</button>
            <button onClick={() => setSelMembers(new Set())} className="text-slate-500 hover:underline">Clear</button>
          </div>
          <PickList
            items={members}
            selected={selMembers}
            onToggle={toggle(selMembers, setSelMembers)}
            searchPlaceholder="Search members..."
            renderLabel={(m) => <span>{m.name}</span>}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <button onClick={onClose} className="btn text-slate-300">Cancel</button>
        <button
          onClick={save}
          disabled={!selBosses.size || !selMembers.size}
          className="btn bg-sky-600 !border-sky-500 text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save size={15} /> Save ({selMembers.size} × {selBosses.size} bosses)
        </button>
      </div>
    </Modal>
  )
}
