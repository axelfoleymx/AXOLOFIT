import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { repo, type SyncTable, type Row } from './db/db'
import { addDays } from './calc/weight'
import { useUser } from './app'
import { loadCatalog } from './providers/foods'

/** Lectura reactiva de una tabla del usuario: se actualiza sola cuando cambian los datos. */
export function useRows<T extends SyncTable>(t: T, where?: (r: Row<T>) => boolean, deps: unknown[] = []): Row<T>[] | undefined {
  const { userId } = useUser()
  return useLiveQuery(() => repo.list(t, userId, where), [userId, t, ...deps])
}

export function useRange<T extends SyncTable>(t: T, from: string, to: string): Row<T>[] | undefined {
  const { userId } = useUser()
  return useLiveQuery(() => repo.byDate(t, userId, from, to), [userId, t, from, to])
}

export const useDays = (today: string, days: number) => ({ from: addDays(today, -(days - 1)), to: today })

/** Carga perezosa del catálogo de alimentos (≈380 KB) con estado de error visible. */
export function useCatalog() {
  const [state, setState] = useState<{ ready: boolean; error: string | null }>({ ready: false, error: null })
  useEffect(() => {
    let alive = true
    loadCatalog().then(() => alive && setState({ ready: true, error: null })).catch((e) => alive && setState({ ready: false, error: String(e) }))
    return () => { alive = false }
  }, [])
  return state
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [s, setS] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  useEffect(() => {
    let alive = true
    setS((p) => ({ ...p, loading: true }))
    fn().then((data) => alive && setS({ data, loading: false })).catch((e) => alive && setS({ error: e instanceof Error ? e.message : String(e), loading: false }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return s
}
