import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './lib/app'
import { Loading, Toaster } from './components/ui'
import { Layout } from './components/Layout'
import AuthPage from './features/auth/AuthPage'
import Onboarding from './features/onboarding/Onboarding'

const Dashboard = lazy(() => import('./features/dashboard/Dashboard'))
const Nutrition = lazy(() => import('./features/nutrition/Nutrition'))
const Training = lazy(() => import('./features/training/Training'))
const LiveSession = lazy(() => import('./features/training/LiveSession'))
const Progress = lazy(() => import('./features/progress/Progress'))
const Coach = lazy(() => import('./features/coach/Coach'))
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'))
const Science = lazy(() => import('./features/profile/Science'))

export default function App() {
  const { session, profile, loading } = useApp()
  if (!session) return (<><AuthPage /><Toaster /></>)
  if (loading) return <Loading label="Preparando tus datos…" />
  if (!profile?.onboardingDone) return (<><Onboarding /><Toaster /></>)
  return (
    <>
      <Routes>
        <Route path="/entrenar/sesion/:id" element={<Suspense fallback={<Loading />}><LiveSession /></Suspense>} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="nutricion/*" element={<Nutrition />} />
          <Route path="entrenar/*" element={<Training />} />
          <Route path="progreso/*" element={<Progress />} />
          <Route path="coach" element={<Coach />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="ciencia" element={<Science />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}
