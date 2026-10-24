import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

export type Mood = 'wave' | 'lift' | 'food' | 'trophy' | 'coach' | 'rest' | 'scale'

export function Mascot({ mood = 'wave', size = 96, className = '', float = false }: { mood?: Mood; size?: number; className?: string; float?: boolean }) {
  return <img src={`/mascot/${mood}.png`} width={size} height={size} alt="" aria-hidden className={`select-none object-contain ${float ? 'animate-float' : ''} ${className}`} draggable={false} />
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <img src="/mascot/logo.webp" alt="" className="h-8 w-8 rounded-xl" />
      {!compact && <span className="h-display text-lg font-bold tracking-wide text-lime">ATHLETIQ</span>}
    </span>
  )
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-soft">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ mood = 'wave', title, text, action }: { mood?: Mood; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Mascot mood={mood} size={88} float />
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-xs text-sm text-muted">{text}</p>}
      {action}
    </div>
  )
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Mascot mood="lift" size={96} float />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children(id)}
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function NumberInput({ value, onChange, min, max, step = 'any', placeholder, id, className = '', suffix, ariaLabel }: {
  value: number | null | undefined; onChange: (v: number | null) => void; min?: number; max?: number; step?: number | 'any'; placeholder?: string; id?: string; className?: string; suffix?: string; ariaLabel?: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    if (value == null ? text !== '' : Number(text.replace(',', '.')) !== value) setText(value == null ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className="relative">
      <input
        id={id} aria-label={ariaLabel} inputMode="decimal" className={`input ${suffix ? 'pr-10' : ''} ${className}`} placeholder={placeholder} value={text} min={min} max={max} step={step}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, '')
          setText(t)
          if (t === '') return onChange(null)
          const n = Number(t.replace(',', '.'))
          if (Number.isFinite(n)) onChange(n)
        }}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange, multi = false }: { options: { value: T; label: string }[]; value: T[] | T; onChange: (v: T[] | T) => void; multi?: boolean }) {
  const sel = Array.isArray(value) ? value : [value]
  return (
    <div className="flex flex-wrap gap-2" role={multi ? 'group' : 'radiogroup'}>
      {options.map((o) => {
        const on = sel.includes(o.value)
        return (
          <button key={o.value} type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on} className={`chip ${on ? 'chip-on' : 'hover:border-soft'}`}
            onClick={() => (multi ? onChange(on ? sel.filter((x) => x !== o.value) : [...sel, o.value]) : onChange(o.value))}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 rounded-xl bg-base p-1">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${value === t.value ? 'bg-raised text-lime' : 'text-muted hover:text-soft'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** Hoja modal: inferior en móvil, centrada en escritorio. Cierra con Escape y al pulsar fuera. */
export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    ref.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', k)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={`animate-pop safe-bottom max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-base p-4 outline-none md:rounded-3xl ${wide ? 'md:max-w-3xl' : 'md:max-w-lg'}`}>
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between border-b border-line/60 bg-base/95 px-4 py-3 backdrop-blur">
          <h2 className="h-display text-lg font-semibold">{title}</h2>
          <button className="rounded-full p-2 text-muted hover:bg-raised hover:text-text" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Anillo de progreso accesible (el valor también se expone como texto). */
export function Ring({ value, max, size = 120, stroke = 10, color = 'var(--color-lime)', children, label }: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.max(0, Math.min(1.5, value / max)) : 0
  const over = pct > 1
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(value)} de ${Math.round(max)}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-raised)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={over ? 'var(--color-warn)' : color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct))} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

export function Bar({ value, max, color = 'var(--color-lime)', label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-raised" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: value > max * 1.05 ? 'var(--color-warn)' : color }} />
    </div>
  )
}

export function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="h-display text-xl font-bold">{value}{unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'lime' | 'warn' | 'danger' | 'info' }) {
  const c = { muted: 'bg-raised text-muted', lime: 'bg-lime/15 text-lime', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger', info: 'bg-info/15 text-info' }[tone]
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{children}</div>
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={`rounded-xl border p-3 text-xs leading-relaxed ${tone === 'warn' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-line bg-raised/50 text-soft'}`}>{children}</div>
}

// --------- Toasts ---------
type ToastMsg = { id: number; text: string; tone: 'ok' | 'err'; action?: { label: string; run: () => void } }
let pushToast: (t: Omit<ToastMsg, 'id'>) => void = () => {}
export const toast = (text: string, tone: 'ok' | 'err' = 'ok', action?: ToastMsg['action']) => pushToast({ text, tone, action })

export function Toaster() {
  const [list, setList] = useState<ToastMsg[]>([])
  useEffect(() => {
    let n = 0
    pushToast = (t) => {
      const id = ++n
      setList((l) => [...l, { ...t, id }])
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.action ? 6000 : 3200)
    }
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`animate-pop pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-xl ${t.tone === 'ok' ? 'border-lime/40 bg-raised' : 'border-danger/50 bg-[#2a1416] text-danger'}`}>
          <span>{t.text}</span>
          {t.action && <button className="font-semibold text-lime" onClick={() => { t.action!.run(); setList((l) => l.filter((x) => x.id !== t.id)) }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  )
}

export const fmt = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: 0 }))
