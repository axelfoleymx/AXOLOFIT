import { useState } from 'react'
import { authMode, signIn, signUp } from '../../lib/auth'
import { useApp } from '../../lib/app'
import { ErrorBox, Field, Logo, Mascot, Note, Tabs } from '../../components/ui'

export default function AuthPage() {
  const { setSession } = useApp()
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'signup' && !name.trim()) return setError('Escribe cómo quieres que te llamemos')
    setBusy(true)
    try {
      setSession(mode === 'signup' ? await signUp(email, password, name.trim()) : await signIn(email, password))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-5xl items-center gap-8 px-4 py-10 md:grid-cols-2">
      <div className="hidden flex-col items-start gap-5 md:flex">
        <Logo />
        <h1 className="h-display text-5xl leading-tight font-bold">Tu coach de fuerza y nutrición, <span className="text-lime">basado en tus datos</span>.</h1>
        <p className="text-soft">Registra comidas y series, recibe recomendaciones calculadas a partir de tu historial y entiende tu progreso con gráficas honestas.</p>
        <Mascot mood="lift" size={220} float />
      </div>
      <div className="card mx-auto w-full max-w-md p-6">
        <div className="mb-4 flex flex-col items-center gap-2 md:hidden">
          <Mascot mood="wave" size={120} float />
          <Logo />
        </div>
        <Tabs value={mode} onChange={(v) => { setMode(v); setError(null) }} tabs={[{ value: 'signup', label: 'Crear cuenta' }, { value: 'login', label: 'Iniciar sesión' }]} />
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          {mode === 'signup' && (
            <Field label="Nombre">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />}</Field>
          )}
          <Field label="Correo">{(id) => <input id={id} type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}</Field>
          <Field label="Contraseña" hint={mode === 'signup' ? 'Mínimo 8 caracteres' : undefined}>
            {(id) => <input id={id} type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />}
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Un momento…' : mode === 'signup' ? 'Crear cuenta' : 'Entrar'}</button>
        </form>
        <div className="mt-4">
          {authMode === 'local' ? (
            <Note>
              <b>Modo local.</b> No hay un servidor conectado: tu cuenta y tus datos se guardan solo en este navegador (IndexedDB). La contraseña se guarda con hash PBKDF2, pero los datos no están cifrados en el dispositivo. Para sincronizar entre dispositivos se debe configurar Supabase.
            </Note>
          ) : (
            <Note>Tu cuenta se guarda en el servidor y tus datos se sincronizan entre dispositivos. Cada persona solo puede acceder a sus propios datos.</Note>
          )}
        </div>
      </div>
    </div>
  )
}
