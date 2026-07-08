import { useMemo, useRef, useState } from 'react'
import {
  Calendar, Camera, Check, ChevronLeft, ChevronRight, Download,
  FileSpreadsheet, Skull, Sparkles, Star, Upload,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useStore, todayISO, addDays, weekLabel, normName } from '../store.jsx'
import { download } from '../components/ui.jsx'
import MemberModal from '../components/MemberModal.jsx'
import KillAllModal from '../components/KillAllModal.jsx'
import ScreenshotModal from '../components/ScreenshotModal.jsx'

export default function BossTracker() {
  const { state, toggleKill, setKills, importKillMatrix } = useStore()
  const [date, setDate] = useState(todayISO())
  const [bossQuery, setBossQuery] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [hiddenGroups, setHiddenGroups] = useState(() => new Set())
  const [selMembers, setSelMembers] = useState(() => new Set())
  const [selBosses, setSelBosses] = useState(() => new Set())
  const [openMember, setOpenMember] = useState(null)
  const [showKillAll, setShowKillAll] = useState(false)
  const [showScreenshot, setShowScreenshot] = useState(false)
  const importRef = useRef(null)

  const groupById = useMemo(
    () => Object.fromEntries(state.groups.map((g) => [g.id, g])),
    [state.groups],
  )

  const visibleBosses = useMemo(() => {
    const q = bossQuery.trim().toLowerCase()
    return state.bosses.filter((b) => {
      if (groupFilter !== 'all' && b.groupId !== groupFilter) return false
      if (hiddenGroups.has(b.groupId)) return false
      if (q) {
        const g = groupById[b.groupId]
        const hay = `${b.name} ${b.type} ${g ? g.name : ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [state.bosses, bossQuery, groupFilter, hiddenGroups, groupById])

  const visibleMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    return q ? state.members.filter((m) => m.name.toLowerCase().includes(q)) : state.members
  }, [state.members, memberQuery])

  // group bosses in display order (group order, then level)
  const bossColumns = useMemo(() => {
    const byGroup = new Map()
    for (const g of state.groups) byGroup.set(g.id, [])
    for (const b of visibleBosses) {
      if (!byGroup.has(b.groupId)) byGroup.set(b.groupId, [])
      byGroup.get(b.groupId).push(b)
    }
    const cols = []
    for (const [gid, list] of byGroup) {
      if (!list.length) continue
      list.sort((a, b) => a.level - b.level)
      cols.push({ group: groupById[gid] || { id: gid, name: gid, color: '#64748b' }, bosses: list })
    }
    return cols
  }, [visibleBosses, state.groups, groupById])

  const killSet = useMemo(() => {
    const set = new Set()
    for (const k of state.kills) if (k.date === date) set.add(`${k.memberId}|${k.bossId}`)
    return set
  }, [state.kills, date])

  const bossCounts = useMemo(() => {
    const counts = {}
    for (const k of state.kills) if (k.date === date) counts[k.bossId] = (counts[k.bossId] || 0) + 1
    return counts
  }, [state.kills, date])

  const memberTotals = useMemo(() => {
    const totals = {}
    for (const k of state.kills) if (k.date === date) totals[k.memberId] = (totals[k.memberId] || 0) + 1
    return totals
  }, [state.kills, date])

  const toggleSel = (set, setSet, id) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setSet(next)
  }

  const fillSelection = (on) => {
    const memberIds = selMembers.size ? [...selMembers] : visibleMembers.map((m) => m.id)
    const bossIds = selBosses.size ? [...selBosses] : visibleBosses.map((b) => b.id)
    setKills(date, memberIds, bossIds, on)
  }

  const clearSelection = () => { setSelMembers(new Set()); setSelBosses(new Set()) }

  // ---------- export / import ----------
  const buildMatrix = () => {
    const flat = bossColumns.flatMap((c) => c.bosses)
    const header = ['Member', 'Total', ...flat.map((b) => `${b.name} (Lv.${b.level})`)]
    const rows = visibleMembers.map((m) => [
      m.name,
      memberTotals[m.id] || 0,
      ...flat.map((b) => (killSet.has(`${m.id}|${b.id}`) ? 1 : 0)),
    ])
    return [header, ...rows]
  }

  const exportCSV = () => {
    const csv = buildMatrix()
      .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    download(`boss-tracker-${date}.csv`, new Blob([csv], { type: 'text/csv' }))
  }

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildMatrix()), date)
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    download(`boss-tracker-${date}.xlsx`, new Blob([out], { type: 'application/octet-stream' }))
  }

  const importXLSX = async (file) => {
    const wb = XLSX.read(await file.arrayBuffer())
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    if (!aoa.length) return
    const header = aoa[0].map((h) => normName(String(h || '').replace(/\(lv\.?\s*\d+\)/i, '')))
    const colBoss = header.map((h) => {
      if (!h || h === 'member' || h === 'total') return null
      const boss = state.bosses.find((b) => normName(b.name) === h)
      return boss ? boss.id : null
    })
    const truthy = (c) => c === 1 || c === '1' || c === true || String(c).toLowerCase() === 'x'
    const entries = aoa.slice(1).map((row) => ({
      name: String(row[0] || '').trim(),
      bossIds: row.map((cell, i) => (colBoss[i] && truthy(cell) ? colBoss[i] : null)).filter(Boolean),
    })).filter((e) => e.name)
    importKillMatrix(date, entries)
  }

  const activeToday = Object.keys(memberTotals).length

  return (
    <div className="space-y-4">
      {/* title row */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Skull size={22} className="text-sky-400" /> Boss Tracker
        </h1>
        <span className="rounded-full bg-[#13203a] px-3 py-1 text-xs text-slate-300">{state.bosses.length} bosses</span>
        <span className="rounded-full bg-[#13203a] px-3 py-1 text-xs text-slate-300">
          {activeToday}/{state.members.length} members
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setShowKillAll(true)} className="btn bg-sky-600/90 !border-sky-500 text-white hover:bg-sky-500">
            <Sparkles size={15} /> Kill All (record multiple bosses)
          </button>
          <button onClick={() => setShowScreenshot(true)} className="btn bg-[#0e1626] text-slate-200 hover:border-sky-500">
            <Camera size={15} /> Record from party screenshot
          </button>
          <button onClick={() => importRef.current?.click()} className="btn bg-[#0e1626] text-slate-200 hover:border-sky-500">
            <Upload size={15} /> Import Excel sheet
          </button>
          <input
            ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importXLSX(f); e.target.value = '' }}
          />
        </div>
      </div>

      {/* filter bar */}
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-1">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Kill date</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setDate((d) => addDays(d, -1))} className="btn px-2 py-1.5"><ChevronLeft size={14} /></button>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="input py-1.5" />
              <button onClick={() => setDate((d) => addDays(d, 1))} className="btn px-2 py-1.5"><ChevronRight size={14} /></button>
            </div>
          </div>
          <span className="ml-2 rounded-lg border border-[#22304e] px-2.5 py-1.5 text-xs text-slate-300">
            <Calendar size={12} className="mr-1 inline" />
            {weekLabel(date)}
          </span>
        </div>
        <input value={bossQuery} onChange={(e) => setBossQuery(e.target.value)} placeholder="Search boss / zone" className="input w-44" />
        <input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Search member" className="input w-40" />
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="input">
          <option value="all">All boss groups</option>
          {state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={exportCSV} className="btn bg-[#0e1626] hover:border-sky-500"><Download size={14} /> Export CSV</button>
          <button onClick={exportXLSX} className="btn bg-[#0e1626] hover:border-sky-500"><FileSpreadsheet size={14} /> Export XLSX</button>
        </div>
      </div>

      {/* hint / bulk actions */}
      <div className="card flex flex-wrap items-center gap-3 px-4 py-2 text-xs text-slate-400">
        <Sparkles size={13} className="text-sky-400" />
        Click a cell to toggle · click boss or member names (multi-select) then use the buttons to fill/clear at once
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded border border-[#22304e] px-2 py-1">
            Bosses: {selBosses.size || 'all'}
          </span>
          <span className="rounded border border-[#22304e] px-2 py-1">
            Members: {selMembers.size || 'all'}
          </span>
          <button onClick={() => fillSelection(true)} className="btn bg-emerald-600/20 !border-emerald-600 py-1 text-emerald-300 hover:bg-emerald-600/40">
            <Check size={13} /> Fill
          </button>
          <button onClick={() => fillSelection(false)} className="btn bg-rose-600/20 !border-rose-700 py-1 text-rose-300 hover:bg-rose-600/40">
            Clear
          </button>
          {(selMembers.size > 0 || selBosses.size > 0) && (
            <button onClick={clearSelection} className="btn py-1">Deselect</button>
          )}
        </div>
      </div>

      {/* group chips */}
      <div className="card flex flex-wrap items-center gap-2 px-4 py-2">
        <span className="text-xs text-slate-500">Boss groups:</span>
        {state.groups.map((g) => {
          const count = state.bosses.filter((b) => b.groupId === g.id).length
          const hidden = hiddenGroups.has(g.id)
          return (
            <button
              key={g.id}
              onClick={() => {
                const next = new Set(hiddenGroups)
                hidden ? next.delete(g.id) : next.add(g.id)
                setHiddenGroups(next)
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${hidden ? 'opacity-30' : ''}`}
              style={{ borderColor: g.color, color: g.color }}
            >
              <Star size={11} /> {g.name} ({count})
            </button>
          )
        })}
        <button
          onClick={() => setHiddenGroups(hiddenGroups.size ? new Set() : new Set(state.groups.map((g) => g.id)))}
          className="ml-auto text-xs text-slate-400 hover:text-white"
        >
          {hiddenGroups.size ? 'Show all' : 'Hide all'}
        </button>
      </div>

      {/* grid */}
      <div className="card overflow-auto" style={{ maxHeight: '68vh' }}>
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-52 border-b border-r border-[#1c2740] bg-[#0b1220] px-4 py-2 text-left text-xs font-semibold text-slate-400">
                Member
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-[#1c2740] bg-[#0b1220] px-3 py-2 text-xs font-semibold text-slate-400">
                Total
              </th>
              {bossColumns.map((col) => (
                <th
                  key={col.group.id}
                  colSpan={col.bosses.length}
                  className="sticky top-0 z-20 border-b border-r border-[#1c2740] px-2 py-1.5 text-xs font-bold"
                  style={{ background: col.group.color + '22', color: col.group.color }}
                >
                  {col.group.name}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 top-[33px] z-30 border-b border-r border-[#1c2740] bg-[#0b1220] px-4 py-1 text-left text-[11px] font-normal text-slate-500">
                Kills (members)
              </th>
              <th className="sticky top-[33px] z-20 border-b border-r border-[#1c2740] bg-[#0b1220]" />
              {bossColumns.flatMap((col) =>
                col.bosses.map((b) => {
                  const selected = selBosses.has(b.id)
                  return (
                    <th
                      key={b.id}
                      onClick={() => toggleSel(selBosses, setSelBosses, b.id)}
                      className={`sticky top-[33px] z-20 min-w-[92px] cursor-pointer border-b border-r border-[#1c2740] px-2 py-2 align-top text-xs font-semibold ${
                        selected ? 'bg-sky-500/25 text-sky-200' : 'bg-[#0b1220] text-slate-200 hover:bg-[#101b30]'
                      }`}
                      title="Click to (de)select this boss for bulk fill"
                    >
                      <Star size={12} className="mx-auto mb-1 text-slate-500" />
                      <div className="leading-tight">{b.name}</div>
                      <div className="text-[10px] font-normal text-slate-500">Lv.{b.level}</div>
                      <div className="mt-1 font-bold" style={{ color: (groupById[b.groupId] || {}).color }}>
                        {bossCounts[b.id] || 0}
                      </div>
                    </th>
                  )
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map((m) => {
              const selected = selMembers.has(m.id)
              return (
                <tr key={m.id} className="group">
                  <td
                    onClick={() => toggleSel(selMembers, setSelMembers, m.id)}
                    className={`sticky left-0 z-10 cursor-pointer border-b border-r border-[#141d33] px-4 py-1.5 ${
                      selected ? 'bg-sky-500/25' : 'bg-[#0b1220] group-hover:bg-[#101b30]'
                    }`}
                    title="Click to (de)select · double-click for details"
                    onDoubleClick={() => setOpenMember(m)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-200">{m.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMember(m) }}
                        className="rounded px-1.5 text-[10px] text-slate-500 opacity-0 transition-opacity hover:text-sky-300 group-hover:opacity-100"
                      >
                        detail
                      </button>
                    </div>
                  </td>
                  <td className="border-b border-r border-[#141d33] px-3 py-1.5 text-center font-bold text-sky-400">
                    {memberTotals[m.id] || 0}
                  </td>
                  {bossColumns.flatMap((col) =>
                    col.bosses.map((b) => {
                      const killed = killSet.has(`${m.id}|${b.id}`)
                      return (
                        <td key={b.id} className="border-b border-r border-[#141d33] p-1">
                          <button
                            onClick={() => toggleKill(date, m.id, b.id)}
                            className={`mx-auto flex h-6 w-full min-w-14 items-center justify-center rounded ${
                              killed
                                ? 'text-[#04110a]'
                                : 'bg-[#0e1626] hover:bg-[#182642]'
                            }`}
                            style={killed ? { background: (groupById[b.groupId] || {}).color || '#22c55e' } : undefined}
                          >
                            {killed && <Check size={14} strokeWidth={3} />}
                          </button>
                        </td>
                      )
                    }),
                  )}
                </tr>
              )
            })}
            {!visibleMembers.length && (
              <tr>
                <td colSpan={2 + visibleBosses.length} className="px-4 py-8 text-center text-slate-500">
                  No members yet — add them on the Members page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openMember && <MemberModal member={openMember} onClose={() => setOpenMember(null)} />}
      {showKillAll && <KillAllModal date={date} onClose={() => setShowKillAll(false)} />}
      {showScreenshot && <ScreenshotModal date={date} onClose={() => setShowScreenshot(false)} />}
    </div>
  )
}
