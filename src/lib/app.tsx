import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { loadSession, signOut as doSignOut, type Session } from './auth'
import { SyncEngine, type SyncState } from './sync/engine'
import { supabase, supabaseRemote } from './sync/supabase'
import { localToday } from './plan'
import type { NutritionTargets, Preferences, Profile } from './types'

interface AppCtx {
  session: Session | null
  setSession: (s: Session | null) => void
  signOut: () => Promise<void>
  profile: Profile | undefined
  prefs: Preferences | undefined
  targets: NutritionTargets | undefined
  loading: boolean
  today: string
  sync: SyncState
  syncNow: () => void
}

const Ctx = createContext<AppCtx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [today, setToday] = useState(() => localToday())
  const [sync, setSync] = useState<SyncState>({ status: 'local_only', pending: 0, lastSyncAt: null, lastError: null })
  const uid = session?.userId ?? '__none__'

  const state = useLiveQuery(async () => {
    const profile = (await db.profiles.where('userId').equals(uid).toArray()).find((p) => !p.deletedAt)
    const prefs = (await db.preferences.where('userId').equals(uid).toArray()).find((p) => !p.deletedAt)
    const all = (await db.targets.where('userId').equals(uid).toArray()).filter((t) => !t.deletedAt)
    const targets = all.sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.updatedAt.localeCompare(a.updatedAt))[0]
    return { profile, prefs, targets }
  }, [uid])
  const { profile, prefs, targets } = state ?? {}

  const engine = useMemo(() => (session ? new SyncEngine(session.mode === 'supabase' && supabase ? supabaseRemote(supabase) : null, session.userId) : null), [session])

  useEffect(() => {
    if (!engine) return
    const unsub = engine.subscribe(setSync)
    void engine.run()
    const onOnline = () => void engine.run()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOnline)
    const tick = setInterval(() => void engine.run(), 30_000)
    // Refresca el contador de pendientes cuando cambia la cola
    // Ojo: un hook 'creating' que devuelve un valor lo usa Dexie como clave primaria; debe devolver undefined
    const hook = () => {
      setTimeout(() => void engine.refresh(), 50)
    }
    db.outbox.hook('creating', hook)
    return () => {
      unsub()
      clearInterval(tick)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOnline)
      db.outbox.hook('creating').unsubscribe(hook)
    }
  }, [engine])

  // Cambio de día a medianoche sin recargar
  useEffect(() => {
    const t = setInterval(() => setToday(localToday(profile?.timezone)), 60_000)
    return () => clearInterval(t)
  }, [profile?.timezone])

  const value: AppCtx = {
    session, setSession, today, sync,
    signOut: async () => {
      await engine?.run()
      await doSignOut()
      setSession(null)
    },
    profile, prefs, targets, loading: session != null && state === undefined,
    syncNow: () => void engine?.run(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp fuera de AppProvider')
  return c
}

/** Para pantallas que requieren sesión: devuelve el userId garantizado. */
export function useUser() {
  const c = useApp()
  if (!c.session) throw new Error('Sin sesión')
  return { ...c, userId: c.session.userId }
}
