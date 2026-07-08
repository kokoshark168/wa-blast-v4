import { useRef, useState } from 'react'
import { Download, Plus, Settings as SettingsIcon, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store.jsx'
import { download } from '../components/ui.jsx'

export default function Settings() {
  const {
    state, setGuildName, updateSettings, addGroup, updateGroup, deleteGroup,
    addBoss, updateBoss, deleteBoss, importBackup, resetAll,
  } = useStore()
  const importRef = useRef(null)
  const [newBoss, setNewBoss] = useState({ name: '', level: 50, groupId: state.groups[0]?.id || '' })

  const exportBackup = () => {
    download(
      `guildhub-backup-${new Date().toISOString().slice(0, 10)}.json`,
      new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
    )
  }

  const doImport = async (file) => {
    try {
      const data = JSON.parse(await file.text())
      if (!Array.isArray(data.members) || !Array.isArray(data.bosses)) throw new Error('bad shape')
      importBackup(data)
      alert('Backup imported ✓')
    } catch {
      alert('Invalid backup file')
    }
  }

  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
        <SettingsIcon size={22} className="text-sky-400" /> Settings
      </h1>

      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-300">Guild name</div>
        <input value={state.guildName} onChange={(e) => setGuildName(e.target.value)} className="input mt-2 w-full max-w-md" />
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-300">Points</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            ['killPts', 'Per boss kill'],
            ['checkinPts', 'Per daily check-in'],
            ['eventPts', 'Default per event'],
            ['missedMin', '"Missed" min killers'],
          ].map(([key, label]) => (
            <label key={key} className="text-xs text-slate-400">
              {label}
              <input
                type="number"
                value={state.settings[key]}
                onChange={(e) => updateSettings({ [key]: num(e.target.value, state.settings[key]) })}
                className="input mt-1 w-full"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          A boss counts as “missed” for a member when at least that many other members killed it on a day the member didn’t.
        </p>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-300">Boss groups</div>
          <button onClick={() => addGroup({ name: 'New Group' })} className="btn py-1 text-xs"><Plus size={13} /> Add group</button>
        </div>
        <div className="mt-3 space-y-2">
          {state.groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <input type="color" value={g.color} onChange={(e) => updateGroup(g.id, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-[#22304e] bg-transparent" />
              <input value={g.name} onChange={(e) => updateGroup(g.id, { name: e.target.value })} className="input flex-1" />
              <span className="w-16 text-right text-xs text-slate-500">
                {state.bosses.filter((b) => b.groupId === g.id).length} bosses
              </span>
              <button
                onClick={() => confirm(`Delete group "${g.name}" and all its bosses + kill records?`) && deleteGroup(g.id)}
                className="rounded border border-[#243150] p-2 text-slate-500 hover:border-rose-600 hover:text-rose-400"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-300">Bosses ({state.bosses.length})</div>
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[#2a3a5e] p-3">
          <label className="text-xs text-slate-400">Name
            <input value={newBoss.name} onChange={(e) => setNewBoss({ ...newBoss, name: e.target.value })} className="input mt-1 w-44" />
          </label>
          <label className="text-xs text-slate-400">Level
            <input type="number" value={newBoss.level} onChange={(e) => setNewBoss({ ...newBoss, level: num(e.target.value, 1) })} className="input mt-1 w-20" />
          </label>
          <label className="text-xs text-slate-400">Group
            <select value={newBoss.groupId} onChange={(e) => setNewBoss({ ...newBoss, groupId: e.target.value })} className="input mt-1">
              {state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button
            onClick={() => { addBoss(newBoss); setNewBoss({ ...newBoss, name: '' }) }}
            disabled={!newBoss.name.trim() || !newBoss.groupId}
            className="btn bg-sky-600 !border-sky-500 text-white hover:bg-sky-500 disabled:opacity-40"
          >
            <Plus size={14} /> Add boss
          </button>
        </div>
        <div className="mt-3 max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0b1220] text-left text-xs text-slate-400">
              <tr className="border-b border-[#1c2740]">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2 w-20">Level</th>
                <th className="px-2 py-2">Group</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2 w-12" />
              </tr>
            </thead>
            <tbody>
              {state.bosses.map((b) => (
                <tr key={b.id} className="border-b border-[#141d33]">
                  <td className="px-2 py-1"><input value={b.name} onChange={(e) => updateBoss(b.id, { name: e.target.value })} className="input w-full py-1" /></td>
                  <td className="px-2 py-1"><input type="number" value={b.level} onChange={(e) => updateBoss(b.id, { level: num(e.target.value, b.level) })} className="input w-full py-1" /></td>
                  <td className="px-2 py-1">
                    <select value={b.groupId} onChange={(e) => updateBoss(b.id, { groupId: e.target.value })} className="input w-full py-1">
                      {state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select value={b.type} onChange={(e) => updateBoss(b.id, { type: e.target.value })} className="input w-full py-1">
                      <option>Field Boss</option>
                      <option>Battleground Boss</option>
                      <option>Pit Boss</option>
                      <option>Raid Boss</option>
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => confirm(`Delete boss "${b.name}" and its kill records?`) && deleteBoss(b.id)}
                      className="rounded border border-[#243150] p-1.5 text-slate-500 hover:border-rose-600 hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-300">Data</div>
        <p className="mt-1 text-xs text-slate-500">
          Everything is stored in this browser (localStorage). Export a backup regularly, or move data between devices with it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={exportBackup} className="btn bg-[#0e1626] hover:border-sky-500"><Download size={14} /> Export backup (JSON)</button>
          <button onClick={() => importRef.current?.click()} className="btn bg-[#0e1626] hover:border-sky-500"><Upload size={14} /> Import backup</button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
          <button
            onClick={() => confirm('Reset ALL data back to the demo seed? This cannot be undone.') && resetAll()}
            className="btn !border-rose-800 bg-rose-950/40 text-rose-300 hover:bg-rose-900/40"
          >
            <Trash2 size={14} /> Reset all data
          </button>
        </div>
      </div>
    </div>
  )
}
