import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore }    from './store/authStore'
import AppShell            from './components/layout/AppShell'
import ProtectedRoute      from './components/auth/ProtectedRoute'
import ErrorBoundary       from './components/ui/ErrorBoundary'
import { ToastContainer }  from './components/ui/Toast'
import LoginPage           from './pages/auth/LoginPage'
import RegisterPage        from './pages/auth/RegisterPage'
import DashboardPage       from './pages/dashboard/DashboardPage'
import GroupsPage          from './pages/groups/GroupsPage'
import GroupDetailPage     from './pages/groups/GroupDetailPage'
import InviteAcceptPage    from './pages/groups/InviteAcceptPage'
import LogGamePage         from './pages/games/LogGamePage'
import StatsPage           from './pages/stats/StatsPage'
import ProfilePage         from './pages/profile/ProfilePage'
import { GamesPlaceholder } from './pages/Placeholders'
import OnboardingPage      from './pages/groups/OnboardingPage'

export default function App() {
  const initialize = useAuthStore(s => s.initialize)
  useEffect(() => { initialize() }, [])

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route path="/invite/:token" element={
            <ProtectedRoute><InviteAcceptPage /></ProtectedRoute>
          } />

          <Route path="/" element={
            <ProtectedRoute><AppShell /></ProtectedRoute>
          }>
            <Route index                  element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"       element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
            <Route path="onboarding"       element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>} />
            <Route path="games"           element={<Navigate to="/stats" replace />} />
            <Route path="groups"          element={<ErrorBoundary><GroupsPage /></ErrorBoundary>} />
            <Route path="groups/:groupId" element={<ErrorBoundary><GroupDetailPage /></ErrorBoundary>} />
            <Route path="log"             element={<ErrorBoundary><LogGamePage /></ErrorBoundary>} />
            <Route path="stats"           element={<ErrorBoundary><StatsPage /></ErrorBoundary>} />
            <Route path="profile"         element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        <ToastContainer />
      </ErrorBoundary>
    </BrowserRouter>
  )
}
