import { db, nowIso, purgeUser, uid } from './db/db'
import { supabase, supabaseConfigured } from './sync/supabase'

export interface Session { userId: string; email: string; displayName: string; mode: 'local' | 'supabase' }

const SESSION_KEY = 'athletiq.session'

function b64(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

/** PBKDF2-SHA256 (210 000 iteraciones). Protege la contraseña en el dispositivo; no cifra los datos. */
export async function hashPassword(password: string, saltB64?: string) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210_000 }, key, 256)
  return { hash: b64(bits), salt: b64(salt.buffer as ArrayBuffer) }
}

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Introduce un correo válido'
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
  return null
}

const save = (s: Session | null) => {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* almacenamiento bloqueado: la sesión dura lo que la pestaña */
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export async function signUp(email: string, password: string, displayName: string): Promise<Session> {
  const err = validateCredentials(email, password)
  if (err) throw new Error(err)
  email = email.trim().toLowerCase()
  if (supabase) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('No se pudo crear la cuenta')
    if (!data.session) throw new Error('Revisa tu correo para confirmar la cuenta y después inicia sesión.')
    const s: Session = { userId: data.user.id, email, displayName, mode: 'supabase' }
    save(s)
    return s
  }
  if (await db.accounts.where('email').equals(email).first()) throw new Error('Ya existe una cuenta con ese correo en este dispositivo')
  const { hash, salt } = await hashPassword(password)
  const id = uid()
  await db.accounts.add({ id, email, displayName, passwordHash: hash, salt, createdAt: nowIso() })
  const s: Session = { userId: id, email, displayName, mode: 'local' }
  save(s)
  return s
}

export async function signIn(email: string, password: string): Promise<Session> {
  email = email.trim().toLowerCase()
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) throw new Error('Correo o contraseña incorrectos')
    const s: Session = { userId: data.user.id, email, displayName: (data.user.user_metadata?.display_name as string) ?? email, mode: 'supabase' }
    save(s)
    return s
  }
  const acc = await db.accounts.where('email').equals(email).first()
  if (!acc) throw new Error('Correo o contraseña incorrectos')
  const { hash } = await hashPassword(password, acc.salt)
  if (hash !== acc.passwordHash) throw new Error('Correo o contraseña incorrectos')
  const s: Session = { userId: acc.id, email, displayName: acc.displayName, mode: 'local' }
  save(s)
  return s
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut()
  save(null)
}

/** Elimina la cuenta y sus datos locales. En modo Supabase, la Edge Function delete-account borra los del servidor. */
export async function deleteAccount(s: Session, password: string) {
  if (s.mode === 'local') {
    const acc = await db.accounts.get(s.userId)
    if (!acc) throw new Error('Cuenta no encontrada')
    const { hash } = await hashPassword(password, acc.salt)
    if (hash !== acc.passwordHash) throw new Error('Contraseña incorrecta')
  } else if (supabase) {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} })
    if (error) throw new Error('No se pudo eliminar la cuenta en el servidor: ' + error.message)
  }
  await purgeUser(s.userId)
  await signOut()
}

export const authMode = supabaseConfigured ? 'supabase' : 'local'
