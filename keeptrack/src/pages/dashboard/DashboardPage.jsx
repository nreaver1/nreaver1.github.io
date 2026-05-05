import { useAuthStore } from '../../store/authStore'
import { Trophy, Users, TrendingUp, PlusCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function DashboardPage() {
  const { profile } = useAuthStore()

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto lg:px-6 lg:py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-white/40 text-sm font-600 uppercase tracking-wider mb-1">Welcome back</p>
        <h1 className="page-title">{profile?.username ?? 'Player'}</h1>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="stat-card">
          <span className="stat-value text-emerald-400">—</span>
          <span className="stat-label">Wins</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-red-400">—</span>
          <span className="stat-label">Losses</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-brand-400">—</span>
          <span className="stat-label">Win %</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link to="/log" className="card-hover p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center">
            <PlusCircle size={18} className="text-brand-400" />
          </div>
          <p className="font-600 text-white text-sm">Log a Game</p>
          <p className="text-white/30 text-xs">Record a new result</p>
        </Link>

        <Link to="/groups" className="card-hover p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <Users size={18} className="text-purple-400" />
          </div>
          <p className="font-600 text-white text-sm">My Groups</p>
          <p className="text-white/30 text-xs">View your crews</p>
        </Link>

        <Link to="/games" className="card-hover p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-yellow-500/20 rounded-xl flex items-center justify-center">
            <Trophy size={18} className="text-yellow-400" />
          </div>
          <p className="font-600 text-white text-sm">Leaderboard</p>
          <p className="text-white/30 text-xs">See who's on top</p>
        </Link>

        <Link to="/stats" className="card-hover p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-sky-500/20 rounded-xl flex items-center justify-center">
            <TrendingUp size={18} className="text-sky-400" />
          </div>
          <p className="font-600 text-white text-sm">My Stats</p>
          <p className="text-white/30 text-xs">Head-to-head, streaks</p>
        </Link>
      </div>

      {/* Recent games placeholder */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-title">Recent Games</h2>
        <Link to="/games" className="text-brand-400 text-sm font-600 hover:text-brand-300 transition-colors">
          See all
        </Link>
      </div>

      <div className="empty-state card">
        <Trophy size={32} className="empty-state-icon" />
        <p className="empty-state-title">No games yet</p>
        <p className="empty-state-desc">Log your first game to start tracking wins and losses.</p>
        <Link to="/log" className="btn-primary mt-2">Log a Game</Link>
      </div>
    </div>
  )
}
