import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ImagePlus, Loader2, Save, ScanText, UserPlus } from 'lucide-react'
import { useStore, normName } from '../store.jsx'
import { Modal } from './ui.jsx'

export default function ScreenshotModal({ date, onClose }) {
  const { state, setKills, addMembers } = useStore()
  const [killDate, setKillDate] = useState(date)
  const [images, setImages] = useState([]) // {url, file}
  const [manual, setManual] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [bossQuery, setBossQuery] = useState('')
  const [selBosses, setSelBosses] = useState(() => new Set())
  const fileRef = useRef(null)

  const groupById = useMemo(() => Object.fromEntries(state.groups.map((g) => [g.id, g])), [state.groups])

  // paste support
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
      if (files.length) addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const addFiles = (files) => {
    setImages((prev) => [
      ...prev,
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ])
  }

  const runOCR = async () => {
    if (!images.length || ocrBusy) return
    setOcrBusy(true)
    setOcrError('')
    try {
      const { default: Tesseract } = await import('tesseract.js')
      const found = []
      for (const img of images) {
        const { data } = await Tesseract.recognize(img.file, 'eng')
        for (const line of data.text.split('\n')) {
          const cleaned = line.replace(/[^\w\s\-|[\]]/g, ' ').trim()
          for (const token of cleaned.split(/\s{2,}|[|]/)) {
            const t = token.trim()
            if (t.length >= 3 && t.length <= 24 && /[a-zA-Z]/.test(t)) found.push(t)
          }
        }
      }
      if (found.length) {
        setManual((prev) => [...new Set([...(prev ? prev.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : []), ...found])].join('\n'))
      } else {
        setOcrError('No readable names found — add them manually below.')
      }
    } catch (e) {
      setOcrError('OCR failed (' + (e?.message || 'unknown error') + '). Add names manually below.')
    } finally {
      setOcrBusy(false)
    }
  }

  // parse manual names + match against roster
  const parsed = useMemo(() => {
    const names = [...new Set(manual.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))]
    const roster = state.members.map((m) => ({ id: m.id, name: m.name, norm: normName(m.name) }))
    const matched = []
    const unmatched = []
    for (const raw of names) {
      const n = normName(raw)
      if (!n) continue
      const hit =
        roster.find((r) => r.norm === n) ||
        roster.find((r) => n.length >= 4 && (r.norm.includes(n) || n.includes(r.norm)))
      if (hit && !matched.some((m) => m.id === hit.id)) matched.push({ ...hit, raw })
      else if (!hit) unmatched.push(raw)
    }
    return { names, matched, unmatched }
  }, [manual, state.members])

  const filteredBosses = useMemo(() => {
    const q = bossQuery.trim().toLowerCase()
    return state.bosses.filter((b) =>
      !q || `${b.name} ${groupById[b.groupId]?.name || ''}`.toLowerCase().includes(q),
    )
  }, [state.bosses, bossQuery, groupById])

  const toggleBoss = (id) => {
    const next = new Set(selBosses)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelBosses(next)
  }

  const save = () => {
    if (!parsed.matched.length || !selBosses.size) return
    setKills(killDate, parsed.matched.map((m) => m.id), [...selBosses], true)
    onClose()
  }

  return (
    <Modal
      title="Log boss kills from party screenshot"
      subtitle="Paste/upload the party screenshot → AI reads names → pick bosses → Save. Everyone in the party is flagged at once."
      onClose={onClose}
      wide
    >
      <div className="grid gap-6 md:grid-cols-2">
        {/* left: images + names */}
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex min-h-44 cursor-pointer flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-[#2a3a5e] bg-[#0e1626]/60 p-3 hover:border-sky-500"
          >
            {images.length ? (
              images.map((img, i) => (
                <img key={i} src={img.url} alt="" className="max-h-36 rounded-lg border border-[#22304e]" />
              ))
            ) : (
              <div className="text-center text-sm text-slate-500">
                <ImagePlus size={28} className="mx-auto mb-2" />
                Click to choose files or Ctrl+V to paste
              </div>
            )}
          </div>
          <input
            ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { addFiles([...e.target.files]); e.target.value = '' }}
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => fileRef.current?.click()} className="btn bg-[#0e1626] hover:border-sky-500">
              <ImagePlus size={15} /> Add images
            </button>
            <button
              onClick={runOCR}
              disabled={!images.length || ocrBusy}
              className="btn bg-sky-600/80 !border-sky-500 text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ocrBusy ? <Loader2 size={15} className="animate-spin" /> : <ScanText size={15} />}
              {ocrBusy ? 'Reading…' : 'Read names from image'}
            </button>
          </div>
          {ocrError && <p className="mt-2 text-xs text-amber-400">{ocrError}</p>}

          <label className="mt-4 block text-sm font-semibold text-slate-300">
            Add/edit names manually (comma or new line)
          </label>
          <textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="In case AI misreads, or to add manually"
            rows={4}
            className="input mt-2 w-full resize-y"
          />

          <div className="card mt-3 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[#2a3a5e] px-2 py-0.5 text-xs">Total {parsed.names.length}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700 px-2 py-0.5 text-xs text-emerald-400">
                <CheckCircle2 size={12} /> Confirmed {parsed.matched.length}
              </span>
            </div>
            {!parsed.names.length && <div className="py-2 text-center text-xs text-slate-500">— No names yet —</div>}
            {parsed.matched.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {parsed.matched.map((m) => (
                  <span key={m.id} className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">{m.name}</span>
                ))}
              </div>
            )}
            {parsed.unmatched.length > 0 && (
              <div className="mt-2">
                <div className="flex flex-wrap gap-1">
                  {parsed.unmatched.map((n, i) => (
                    <span key={i} className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">{n}</span>
                  ))}
                </div>
                <button
                  onClick={() => addMembers(parsed.unmatched)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
                >
                  <UserPlus size={12} /> Add {parsed.unmatched.length} unmatched as new members
                </button>
              </div>
            )}
          </div>
        </div>

        {/* right: date + bosses */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-300">Kill date</span>
            <input type="date" value={killDate} onChange={(e) => e.target.value && setKillDate(e.target.value)} className="input" />
          </div>
          <div className="mt-4 text-sm font-semibold text-slate-300">Select bosses killed (multiple allowed)</div>
          <input
            value={bossQuery}
            onChange={(e) => setBossQuery(e.target.value)}
            placeholder="Search bosses..."
            className="input mt-2"
          />
          <div className="mt-2 max-h-80 min-h-40 flex-1 overflow-y-auto rounded-lg border border-[#1c2740]">
            {filteredBosses.map((b) => (
              <button
                key={b.id}
                onClick={() => toggleBoss(b.id)}
                className={`flex w-full items-center gap-2 border-b border-[#141d33] px-3 py-2 text-left text-sm ${
                  selBosses.has(b.id) ? 'bg-sky-500/15 text-sky-200' : 'text-slate-300 hover:bg-[#101b30]'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                    selBosses.has(b.id) ? 'border-sky-400 bg-sky-500 text-white' : 'border-[#2a3a5e]'
                  }`}
                >
                  {selBosses.has(b.id) ? '✓' : ''}
                </span>
                <b>{b.name}</b>
                <span className="text-xs text-slate-500">Lv.{b.level}</span>
                <span className="text-xs" style={{ color: groupById[b.groupId]?.color }}>
                  {groupById[b.groupId]?.name}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs text-slate-500">{selBosses.size} selected</div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button onClick={onClose} className="btn text-slate-300">Cancel</button>
        <button
          onClick={save}
          disabled={!parsed.matched.length || !selBosses.size}
          className="btn bg-sky-600 !border-sky-500 text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save size={15} /> Save ({parsed.matched.length} × {selBosses.size} bosses)
        </button>
      </div>
    </Modal>
  )
}
