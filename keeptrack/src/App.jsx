import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import AppShell         from './components/layout/AppShell'
import ProtectedRoute   from './components/auth/ProtectedRoute'
import LoginPage        from './pages/auth/LoginPage'
import RegisterPage     from './pages/auth/RegisterPage'
import DashboardPage    from './pages/dashboard/DashboardPage'
import GroupsPage       from './pages/groups/GroupsPage'
import GroupDetailPage  from './pages/groups/GroupDetailPage'
import InviteAcceptPage from './pages/groups/InviteAcceptPage'
import LogGamePage      from './pages/games/LogGamePage'
import { GamesPage, StatsPage, ProfilePage } from './pages/Placeholders'

export default function App() {
  const initialize = useAuthStore(s => s.initialize)
  useEffect(() => { initialize() }, [])

  return (
    <BrowserRouter>
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
          <Route path="dashboard"       element={<DashboardPage />} />
          <Route path="games"           element={<GamesPage />} />
          <Route path="groups"          element={<GroupsPage />} />
          <Route path="groups/:groupId" element={<GroupDetailPage />} />
          <Route path="log"             element={<LogGamePage />} />
          <Route path="stats"           element={<StatsPage />} />
          <Route path="profile"         element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
