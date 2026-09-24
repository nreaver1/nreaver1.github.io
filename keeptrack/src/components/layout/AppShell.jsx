import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Trophy, Users, User, PlusCircle, Crown
} from 'lucide-react'
import { useAuthStore }   from '../../store/authStore'
import Avatar            from '../ui/Avatar'
import { useNotifStore }  from '../../store/notifStore'
import InstallPrompt     from '../ui/InstallPrompt'
import { isDemo }        from '../../lib/supabase'

const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Home',      icon: LayoutDashboard },
  { to: '/games',      label: 'Games',     icon: Trophy },
  { to: '/log',        label: 'Log',       icon: PlusCircle,  primary: true },
  { to: '/groups',     label: 'Groups',    icon: Users },
  { to: '/profile',    label: 'Profile',   icon: User },
]

export default function AppShell() {
  const { profile } = useAuthStore()
  const location     = useLocation()
  const hideHeader   = ['/log', '/onboarding'].some(p => location.pathname.startsWith(p))
  const unread       = useNotifStore(s => s.unread)
  const totalUnread  = Object.values(unread).reduce((a, b) => a + b, 0)

  return (
    <div className="flex h-[100dvh] bg-surface-0 overflow-hidden">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex flex-col w-64 bg-surface-1 border-r border-surface-3 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-surface-3">
          <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center shadow-glow-sm">
            <Crown size={18} className="text-white" />
          </div>
          <span className="font-display text-2xl tracking-wide text-white">Keep Track</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, primary }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-600 transition-all duration-200
                 ${isActive
                   ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                   : 'text-white/50 hover:text-white hover:bg-surface-3'
                 }
                 ${primary ? 'mt-2' : ''}`
              }
            >
              <Icon size={18} />
              {label}
              {to === '/groups' && totalUnread > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-700 flex items-center justify-center">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
              {primary && (
                <span className="ml-auto text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded-md">
                  NEW
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        {profile && (
          <div className="px-3 pb-4">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 font-display text-sm">
                {profile.username?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-white truncate">{profile.username}</p>
                <p className="text-xs text-white/30 truncate">{profile.email}</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {isDemo && (
          <div className="shrink-0 bg-brand-500/10 border-b border-brand-500/20 px-4 py-1.5 text-center text-xs text-brand-400">
            Demo mode: sample data, signed in as nick. Changes reset when you reload.
          </div>
        )}
        {/* Mobile header — hidden on full-screen wizard pages */}
        <header className={`lg:hidden flex items-center justify-between px-4 pt-safe-top pb-3 pt-4 bg-surface-1 border-b border-surface-3 shrink-0 ${hideHeader ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <Crown size={14} className="text-white" />
            </div>
            <span className="font-display text-xl tracking-wide text-white">Keep Track</span>
          </div>
          {profile && (
            <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 font-display text-sm">
              {profile.username?.[0]?.toUpperCase()}
            </div>
          )}
        </header>

        {/* Scrollable page content */}
        <div className={`flex-1 overflow-y-auto ${hideHeader ? '' : 'pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0'}`}>
          <Outlet />
        </div>

        {/* ── Mobile Bottom Tab Bar ── */}
        <nav className="lg:hidden bg-surface-1 border-t border-surface-3 safe-bottom shrink-0">
          <div className="flex items-stretch">
            {NAV_ITEMS.map(({ to, label, icon: Icon, primary }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative transition-all duration-200
                   ${primary ? '-mt-4' : ''}
                   ${isActive && !primary ? 'text-brand-400' : !primary ? 'text-white/40' : ''}`
                }
              >
                {({ isActive }) => (
                  <>
                    {primary ? (
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-glow transition-all duration-200
                        ${isActive ? 'bg-brand-600' : 'bg-brand-500'}`}>
                        <Icon size={22} className="text-white" />
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Icon size={20} />
                          {to === '/groups' && totalUnread > 0 && (
                            <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-brand-500 text-white text-[9px] font-700 flex items-center justify-center">
                              {totalUnread > 9 ? '9+' : totalUnread}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-600">{label}</span>
                        {isActive && (
                          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-brand-500 rounded-full" />
                        )}
                      </>
                    )}
                    {primary && (
                      <span className="text-[10px] font-600 text-white/50 mt-1">{label}</span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </main>
      <InstallPrompt />
    </div>
  )
}
