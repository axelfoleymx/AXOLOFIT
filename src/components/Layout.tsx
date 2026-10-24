import { Suspense } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Dumbbell, Home, LineChart, MessageCircle, Salad, User, Cloud, CloudOff, RefreshCw, HardDrive, AlertTriangle } from 'lucide-react'
import { useApp } from '../lib/app'
import { Loading, Logo } from './ui'

const NAV = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/nutricion', label: 'Nutrición', icon: Salad },
  { to: '/entrenar', label: 'Entrenar', icon: Dumbbell },
  { to: '/progreso', label: 'Progreso', icon: LineChart },
  { to: '/coach', label: 'Coach', icon: MessageCircle, desktopOnly: true },
  { to: '/perfil', label: 'Perfil', icon: User },
]

export function SyncBadge() {
  const { sync, syncNow } = useApp()
  const map = {
    local_only: { icon: HardDrive, text: 'Guardado en este dispositivo', cls: 'text-muted' },
    idle: { icon: Cloud, text: 'Sincronizado', cls: 'text-lime' },
    pending: { icon: RefreshCw, text: `${sync.pending} cambio(s) pendientes`, cls: 'text-warn' },
    syncing: { icon: RefreshCw, text: 'Sincronizando…', cls: 'text-info animate-pulse' },
    offline: { icon: CloudOff, text: `Sin conexión · ${sync.pending} pendientes`, cls: 'text-warn' },
    error: { icon: AlertTriangle, text: sync.lastError ?? 'Error de sincronización', cls: 'text-danger' },
  }[sync.status]
  const Icon = map.icon
  return (
    <button onClick={syncNow} title={map.text} aria-label={`Estado de sincronización: ${map.text}`} className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${map.cls} hover:bg-raised`}>
      <Icon size={15} />
      <span className="hidden max-w-48 truncate sm:inline">{map.text}</span>
    </button>
  )
}

export function Layout() {
  const nav = useNavigate()
  return (
    <div className="mx-auto flex min-h-full max-w-7xl">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line/60 p-4 md:flex">
        <div className="mb-6 px-2"><Logo /></div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-lime/10 text-lime' : 'text-soft hover:bg-raised'}`}>
            <n.icon size={18} /> {n.label}
          </NavLink>
        ))}
        <div className="mt-auto px-2"><SyncBadge /></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-line/50 bg-ink/85 px-4 py-2.5 backdrop-blur md:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <SyncBadge />
            <button onClick={() => nav('/coach')} className="rounded-full p-1 hover:bg-raised" aria-label="Abrir coach">
              <img src="/mascot/coach.png" alt="" className="h-9 w-9" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-10">
          <Suspense fallback={<Loading />}><Outlet /></Suspense>
        </main>
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-ink/95 backdrop-blur md:hidden" aria-label="Navegación principal">
          <div className="mx-auto flex max-w-lg">
            {NAV.filter((n) => !n.desktopOnly).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-lime' : 'text-muted'}`}>
                <n.icon size={21} /> {n.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
