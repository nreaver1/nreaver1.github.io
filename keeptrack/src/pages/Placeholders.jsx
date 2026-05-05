// Placeholder pages — will be fully built in later phases

import { Trophy, Users, TrendingUp, PlusCircle, User } from 'lucide-react'

function PlaceholderPage({ icon: Icon, title, description, color = 'brand' }) {
  return (
    <div className="px-4 py-6 max-w-2xl mx-auto animate-fade-in">
      <div className="empty-state py-24">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-2
          ${color === 'brand'   ? 'bg-brand-500/20'  : ''}
          ${color === 'yellow'  ? 'bg-yellow-500/20' : ''}
          ${color === 'purple'  ? 'bg-purple-500/20' : ''}
          ${color === 'sky'     ? 'bg-sky-500/20'    : ''}
          ${color === 'emerald' ? 'bg-emerald-500/20': ''}
        `}>
          <Icon size={28} className={`
            ${color === 'brand'   ? 'text-brand-400'  : ''}
            ${color === 'yellow'  ? 'text-yellow-400' : ''}
            ${color === 'purple'  ? 'text-purple-400' : ''}
            ${color === 'sky'     ? 'text-sky-400'    : ''}
            ${color === 'emerald' ? 'text-emerald-400': ''}
          `} />
        </div>
        <h1 className="page-title mt-2">{title}</h1>
        <p className="empty-state-desc">{description}</p>
      </div>
    </div>
  )
}

export function GamesPage() {
  return <PlaceholderPage icon={Trophy}     color="yellow"  title="Games"     description="Leaderboards and game history — coming soon." />
}

export function GroupsPage() {
  return <PlaceholderPage icon={Users}      color="purple"  title="Groups"    description="Create and manage your friend groups — coming soon." />
}

export function StatsPage() {
  return <PlaceholderPage icon={TrendingUp} color="sky"     title="Stats"     description="Head-to-head records and streaks — coming soon." />
}

export function LogGamePage() {
  return <PlaceholderPage icon={PlusCircle} color="brand"   title="Log Game"  description="Record a game result — coming soon." />
}

export function ProfilePage() {
  return <PlaceholderPage icon={User}       color="emerald" title="Profile"   description="Edit your profile and manage MFA — coming soon." />
}
