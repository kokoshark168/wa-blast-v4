import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const LS_KEY = 'guildhub-data-v1'

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ---------- date helpers ----------
export function toISO(d) {
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}
export const todayISO = () => toISO(new Date())
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export function weekLabel(iso) {
  const d = new Date(iso + 'T00:00:00')
  const dow = (d.getDay() + 6) % 7 // Monday = 0
  const mon = new Date(d)
  mon.setDate(d.getDate() - dow)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return `${mon.getDate()}/${mon.getMonth() + 1} – ${sun.getDate()}/${sun.getMonth() + 1}`
}
export function normName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ---------- seed ----------
function seedData() {
  const groups = [
    { id: 'ga', name: 'Novus Boss Group A', color: '#22c55e' },
    { id: 'gb', name: 'Novus Boss Group B', color: '#10b981' },
    { id: 'gc', name: 'Novus Boss Group C', color: '#eab308' },
    { id: 'gd', name: 'Novus Boss Group D', color: '#8b5cf6' },
    { id: 'ge', name: 'Novus Boss Group E', color: '#f43f5e' },
    { id: 'gatlas', name: 'Atlas Boss Group', color: '#3b82f6' },
    { id: 'gcrag', name: 'Crag Boss Group', color: '#ec4899' },
    { id: 'glaunch', name: 'Launch Base Boss Group', color: '#06b6d4' },
    { id: 'gdef', name: 'Defense Facility Boss Group', color: '#ef4444' },
  ]
  let n = 0
  const B = (name, level, groupId, type = 'Field Boss') => ({
    id: 'b' + ++n, name, level, groupId, type,
  })
  const bosses = [
    B('Mecha Yusigula', 36, 'ga'), B('Mecha Dagan', 38, 'ga'), B('Subject 13', 40, 'ga'),
    B('Flower of Corruption', 42, 'gb'), B('Mecha Wild Beast', 48, 'gb'),
    B('Mecha Optic Larva', 48, 'gb'), B('Rusty Sickle', 49, 'gb'),
    B('Mecha Lunker', 50, 'gc'), B('Mecha Lizard', 52, 'gc'),
    B('Mecha Temizl', 60, 'gc'), B('Prime Draco', 62, 'gc'),
    B('Mecha Tamac', 66, 'gd'), B('Mecha Infernal Larva', 67, 'gd'),
    B('Locust', 68, 'gd'), B('Mecha Tweezer', 70, 'gd'), B('Vastus', 74, 'gd'),
    B('Mecha Warbeast', 76, 'ge'), B('Eldrige', 77, 'ge'), B('Mecha Devourer', 79, 'ge'),
    B('Mecha Grumble Hook', 80, 'ge'), B('Mecha Basilisk', 82, 'ge'),
    B('Mecha Lapis', 60, 'gatlas', 'Battleground Boss'),
    B('Mecha Silex', 65, 'gatlas', 'Battleground Boss'),
    B('Mecha Nyoka', 70, 'gatlas', 'Battleground Boss'),
    B('Flem Kukra', 55, 'gcrag'), B('Blink', 60, 'gcrag'),
    B('Brutal Lash', 65, 'gcrag'), B('Calliana Arachnid', 70, 'gcrag'),
    B('Seter', 60, 'glaunch'), B('Hidden Blade', 65, 'glaunch'), B('Splinter', 70, 'glaunch'),
    B('Alert Guarder', 62, 'gdef'), B('Assault Commander', 66, 'gdef'),
    B('Defense Turret X', 70, 'gdef'), B('Bulky Grumble', 74, 'gdef'),
  ]
  const members = [
    'Asagi I', 'abdullahSss', 'AceOSpade', 'Am4nda', 'AsaEnami', 'Badfood',
    'Bowkylion', 'BSC4', 'Burakpokpok', 'Creebs', 'Crocodile',
  ].map((name, i) => ({ id: 'm' + (i + 1), name, note: '' }))
  return {
    guildName: 'OMAKASE RF GUILD HUB',
    groups,
    bosses,
    members,
    kills: [],    // { date, memberId, bossId }
    checkins: [], // { date, memberId }
    events: [],   // { id, date, name, points, memberIds }
    settings: { killPts: 4, checkinPts: 2, eventPts: 3, missedMin: 3 },
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data && Array.isArray(data.members) && Array.isArray(data.bosses)) {
        return { ...seedData(), ...data, settings: { ...seedData().settings, ...data.settings } }
      }
    }
  } catch { /* corrupted storage falls back to seed */ }
  return seedData()
}

const StoreCtx = createContext(null)

export function StoreProvider({ children }) {
  const [state, setState] = useState(loadState)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch { /* quota */ }
  }, [state])

  const api = useMemo(() => {
    const killKey = (k) => `${k.date}|${k.memberId}|${k.bossId}`

    const setKills = (date, memberIds, bossIds, on) =>
      setState((s) => {
        const have = new Set(s.kills.map(killKey))
        let kills = s.kills
        if (on) {
          const added = []
          for (const memberId of memberIds)
            for (const bossId of bossIds) {
              const k = { date, memberId, bossId }
              if (!have.has(killKey(k))) { have.add(killKey(k)); added.push(k) }
            }
          kills = added.length ? [...s.kills, ...added] : s.kills
        } else {
          const mem = new Set(memberIds), bos = new Set(bossIds)
          kills = s.kills.filter((k) => !(k.date === date && mem.has(k.memberId) && bos.has(k.bossId)))
        }
        return kills === s.kills ? s : { ...s, kills }
      })

    return {
      setState,
      setKills,
      toggleKill: (date, memberId, bossId) =>
        setState((s) => {
          const idx = s.kills.findIndex((k) => k.date === date && k.memberId === memberId && k.bossId === bossId)
          const kills = idx >= 0 ? s.kills.filter((_, i) => i !== idx) : [...s.kills, { date, memberId, bossId }]
          return { ...s, kills }
        }),
      addMembers: (names) =>
        setState((s) => {
          const have = new Set(s.members.map((m) => normName(m.name)))
          const fresh = []
          for (const raw of names) {
            const name = String(raw).trim()
            if (!name || have.has(normName(name))) continue
            have.add(normName(name))
            fresh.push({ id: uid(), name, note: '' })
          }
          return fresh.length ? { ...s, members: [...s.members, ...fresh] } : s
        }),
      updateMember: (id, patch) =>
        setState((s) => ({ ...s, members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      deleteMember: (id) =>
        setState((s) => ({
          ...s,
          members: s.members.filter((m) => m.id !== id),
          kills: s.kills.filter((k) => k.memberId !== id),
          checkins: s.checkins.filter((c) => c.memberId !== id),
          events: s.events.map((e) => ({ ...e, memberIds: e.memberIds.filter((x) => x !== id) })),
        })),
      toggleCheckin: (date, memberId) =>
        setState((s) => {
          const idx = s.checkins.findIndex((c) => c.date === date && c.memberId === memberId)
          const checkins = idx >= 0 ? s.checkins.filter((_, i) => i !== idx) : [...s.checkins, { date, memberId }]
          return { ...s, checkins }
        }),
      // entries: [{ name, bossIds: [] }] — creates missing members and records kills atomically
      importKillMatrix: (date, entries) =>
        setState((s) => {
          const members = [...s.members]
          const byName = new Map(members.map((m) => [normName(m.name), m.id]))
          const have = new Set(s.kills.map(killKey))
          const kills = [...s.kills]
          for (const { name, bossIds } of entries) {
            const clean = String(name).trim()
            if (!clean) continue
            let mid = byName.get(normName(clean))
            if (!mid) {
              mid = uid()
              members.push({ id: mid, name: clean, note: '' })
              byName.set(normName(clean), mid)
            }
            for (const bossId of bossIds) {
              const k = { date, memberId: mid, bossId }
              if (!have.has(killKey(k))) { have.add(killKey(k)); kills.push(k) }
            }
          }
          return { ...s, members, kills }
        }),
      addEvent: (evt) =>
        setState((s) => ({ ...s, events: [...s.events, { id: uid(), ...evt }] })),
      deleteEvent: (id) =>
        setState((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) })),
      addBoss: (boss) =>
        setState((s) => ({ ...s, bosses: [...s.bosses, { id: uid(), type: 'Field Boss', ...boss }] })),
      updateBoss: (id, patch) =>
        setState((s) => ({ ...s, bosses: s.bosses.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
      deleteBoss: (id) =>
        setState((s) => ({
          ...s,
          bosses: s.bosses.filter((b) => b.id !== id),
          kills: s.kills.filter((k) => k.bossId !== id),
        })),
      addGroup: (grp) =>
        setState((s) => ({ ...s, groups: [...s.groups, { id: uid(), color: '#3b82f6', ...grp }] })),
      updateGroup: (id, patch) =>
        setState((s) => ({ ...s, groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      deleteGroup: (id) =>
        setState((s) => {
          const bossIds = new Set(s.bosses.filter((b) => b.groupId === id).map((b) => b.id))
          return {
            ...s,
            groups: s.groups.filter((g) => g.id !== id),
            bosses: s.bosses.filter((b) => b.groupId !== id),
            kills: s.kills.filter((k) => !bossIds.has(k.bossId)),
          }
        }),
      updateSettings: (patch) =>
        setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
      setGuildName: (guildName) => setState((s) => ({ ...s, guildName })),
      resetAll: () => setState(seedData()),
      importBackup: (data) => setState({ ...seedData(), ...data }),
    }
  }, [])

  const value = useMemo(() => ({ state, ...api }), [state, api])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  return useContext(StoreCtx)
}

// ---------- derived stats ----------
// missed = boss killed by >= missedMin members on a date, but not by this member
export function computeMissed(state, memberId) {
  const byDate = new Map()
  for (const k of state.kills) {
    if (!byDate.has(k.date)) byDate.set(k.date, new Map())
    const m = byDate.get(k.date)
    if (!m.has(k.bossId)) m.set(k.bossId, new Set())
    m.get(k.bossId).add(k.memberId)
  }
  const missed = []
  for (const [date, bossMap] of byDate) {
    for (const [bossId, killers] of bossMap) {
      if (killers.size >= state.settings.missedMin && !killers.has(memberId)) {
        missed.push({ date, bossId })
      }
    }
  }
  missed.sort((a, b) => (a.date < b.date ? 1 : -1))
  return missed
}

export function memberStats(state, memberId) {
  const { killPts, checkinPts } = state.settings
  const kills = state.kills.filter((k) => k.memberId === memberId)
  const checkins = state.checkins.filter((c) => c.memberId === memberId)
  const events = state.events.filter((e) => e.memberIds.includes(memberId))
  const missed = computeMissed(state, memberId)
  const killPoints = kills.length * killPts
  const checkinPoints = checkins.length * checkinPts
  const eventPoints = events.reduce((sum, e) => sum + (Number(e.points) || 0), 0)
  return {
    kills, checkins, events, missed,
    killPoints, checkinPoints, eventPoints,
    total: killPoints + checkinPoints + eventPoints,
  }
}
