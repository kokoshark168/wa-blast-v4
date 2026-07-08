import { X } from 'lucide-react'

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 md:p-10"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`card w-full ${wide ? 'max-w-6xl' : 'max-w-3xl'} p-6 shadow-2xl shadow-black/50`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[#243150] p-2 text-slate-400 hover:border-sky-500 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

export function Chip({ color, children, active = true, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity ${active ? '' : 'opacity-35'}`}
      style={{ borderColor: color, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </button>
  )
}

export function StatCard({ icon: Icon, label, value, accent = 'text-sky-400' }) {
  return (
    <div className="card flex-1 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        {Icon && <Icon size={15} />}
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${accent}`}>{value}</div>
    </div>
  )
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
