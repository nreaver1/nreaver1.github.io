import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Static imports (dynamic imports don't resolve in this Vite/Vitest config) ──
import LoginPage    from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import StepPickGame from '../components/games/StepPickGame'
import StepSelectPlayers from '../components/games/StepSelectPlayers'
import StepConfirm  from '../components/games/StepConfirm'

// ── Shared mocks ─────────────────────────────────────────────

const mockSignIn    = vi.fn()
const mockSignUp    = vi.fn()
const mockSignOut   = vi.fn()
const mockListFactors = vi.fn().mockResolvedValue({ data: { totp: [] } })
const mockChallenge   = vi.fn()
const mockVerify      = vi.fn()
const mockFrom        = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a) => mockSignIn(...a),
      signUp:             (...a) => mockSignUp(...a),
      signOut:            (...a) => mockSignOut(...a),
      mfa: {
        listFactors: (...a) => mockListFactors(...a),
        challenge:   (...a) => mockChallenge(...a),
        verify:      (...a) => mockVerify(...a),
      },
    },
    from: (...a) => mockFrom(...a),
  },
  startInactivityWatcher: vi.fn(),
  stopInactivityWatcher:  vi.fn(),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({
    user: null, profile: null, session: null, loading: false,
    initialize: vi.fn(), signOut: vi.fn(), setProfile: vi.fn(),
  }),
}))

vi.mock('../store/notifStore', () => ({
  useNotifStore: () => ({
    unread: {}, markRead: vi.fn(), increment: vi.fn(),
    reset: vi.fn(), totalUnread: () => 0,
  }),
}))

vi.mock('../store/groupStore', () => ({
  useGroupStore: () => ({
    groups: [], members: [], loading: false, activeGroup: null,
    fetchGroups: vi.fn(), setActiveGroup: vi.fn(),
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function setupFromChain(overrides = {}) {
  const chain = {
    select:      vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    neq:         vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single:      vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  mockFrom.mockReturnValue(chain)
  return chain
}

function wrap(ui, route = '/', state = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: route.split('?')[0], search: route.includes('?') ? '?' + route.split('?')[1] : '', state }]}>
      {ui}
    </MemoryRouter>
  )
}

// ── LoginPage ────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockListFactors.mockResolvedValue({ data: { totp: [] } })
    setupFromChain()
  })

  it('renders email and password fields', () => {
    wrap(<LoginPage />)
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(screen.getByPlaceholderText('••••••••')).toBeTruthy()
  })

  it('shows inactivity banner when reason=inactivity', () => {
    wrap(<LoginPage />, '/login?reason=inactivity')
    expect(screen.getByText(/signed out after 30 minutes/i)).toBeTruthy()
  })

  it('shows session expired banner when reason=session_expired', () => {
    wrap(<LoginPage />, '/login?reason=session_expired')
    expect(screen.getByText(/session expired after 7 days/i)).toBeTruthy()
  })

  it('shows error on failed login', async () => {
    mockSignIn.mockResolvedValueOnce({ data: null, error: { message: 'Invalid login credentials' } })
    wrap(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'),         { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeTruthy())
  })

  it('navigates to dashboard on successful login', async () => {
    mockSignIn.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } }, error: null })
    wrap(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'),         { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true }))
  })

  it('redirects to original destination after login', async () => {
    mockSignIn.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } }, error: null })
    wrap(<LoginPage />, '/login', { from: '/invite/abc' })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'),         { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/invite/abc', { replace: true }))
  })

  it('shows MFA step when user has verified TOTP factor', async () => {
    mockSignIn.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } }, error: null })
    mockListFactors.mockResolvedValueOnce({ data: { totp: [{ id: 'f1', status: 'verified' }] } })
    mockChallenge.mockResolvedValueOnce({ data: { id: 'ch1' } })
    wrap(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'),         { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText(/Two-Factor Auth/i)).toBeTruthy())
  })

  it('shows error on invalid MFA code', async () => {
    mockSignIn.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } }, error: null })
    mockListFactors.mockResolvedValueOnce({ data: { totp: [{ id: 'f1', status: 'verified' }] } })
    mockChallenge.mockResolvedValueOnce({ data: { id: 'ch1' } })
    mockVerify.mockResolvedValueOnce({ error: { message: 'bad code' } })
    wrap(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'),         { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => screen.getByPlaceholderText('000 000'))
    fireEvent.change(screen.getByPlaceholderText('000 000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    await waitFor(() => expect(screen.getByText(/Invalid code/i)).toBeTruthy())
  })
})

// ── RegisterPage ─────────────────────────────────────────────

describe('RegisterPage', () => {
  beforeEach(() => { vi.clearAllMocks(); setupFromChain() })

  it('renders all registration fields', () => {
    wrap(<RegisterPage />)
    expect(screen.getByPlaceholderText('coolplayer99')).toBeTruthy()
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(screen.getByPlaceholderText('Min. 8 characters')).toBeTruthy()
  })

  it('shows validation error for short username', async () => {
    wrap(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText('coolplayer99'),      { target: { value: 'ab' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'),   { target: { value: 't@t.com' } })
    fireEvent.change(screen.getByPlaceholderText('Min. 8 characters'), { target: { value: 'password1' } })
    const pwFields = screen.getAllByPlaceholderText('••••••••')
    fireEvent.change(pwFields[0], { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(screen.getByText(/Username must be at least 3 characters/i)).toBeTruthy())
  })

  it('shows validation error for mismatched passwords', async () => {
    wrap(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText('coolplayer99'),    { target: { value: 'testuser' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 't@t.com' } })
    fireEvent.change(screen.getByPlaceholderText('Min. 8 characters'), { target: { value: 'password1' } })
    // Confirm field is second password field
    const pwFields = screen.getAllByPlaceholderText('••••••••')
    fireEvent.change(pwFields[0], { target: { value: 'different1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(screen.getByText(/do not match/i)).toBeTruthy())
  })

  it('shows taken error when username exists', async () => {
    setupFromChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) })
    wrap(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText('coolplayer99'),    { target: { value: 'taken' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 't@t.com' } })
    fireEvent.change(screen.getByPlaceholderText('Min. 8 characters'), { target: { value: 'password1' } })
    const pwFields = screen.getAllByPlaceholderText('••••••••')
    fireEvent.change(pwFields[0], { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(screen.getByText(/username already taken/i)).toBeTruthy())
  })
})

// ── StepPickGame ─────────────────────────────────────────────

describe('StepPickGame', () => {
  const games = [
    { id: '1', name: 'Mario Kart', category: 'Video Games',     supports_draws: false },
    { id: '2', name: 'Beer Pong',  category: 'Drinking & Party', supports_draws: false },
    { id: '3', name: 'Chess',      category: 'Board & Dice',     supports_draws: true  },
  ]

  it('renders all games', () => {
    render(<StepPickGame gameTypes={games} onSelect={vi.fn()} onCreateCustom={vi.fn()} />)
    expect(screen.getByText('Mario Kart')).toBeTruthy()
    expect(screen.getByText('Beer Pong')).toBeTruthy()
    expect(screen.getByText('Chess')).toBeTruthy()
  })

  it('filters by search query', () => {
    render(<StepPickGame gameTypes={games} onSelect={vi.fn()} onCreateCustom={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/search games/i), { target: { value: 'mario' } })
    expect(screen.getByText('Mario Kart')).toBeTruthy()
    expect(screen.queryByText('Beer Pong')).toBeNull()
  })

  it('calls onSelect when game clicked', () => {
    const onSelect = vi.fn()
    render(<StepPickGame gameTypes={games} onSelect={onSelect} onCreateCustom={vi.fn()} />)
    fireEvent.click(screen.getByText('Mario Kart'))
    expect(onSelect).toHaveBeenCalledWith(games[0])
  })

  it('calls onCreateCustom when create button clicked', () => {
    const onCreateCustom = vi.fn()
    render(<StepPickGame gameTypes={games} onSelect={vi.fn()} onCreateCustom={onCreateCustom} />)
    fireEvent.click(screen.getByText(/create custom game/i))
    expect(onCreateCustom).toHaveBeenCalled()
  })

  it('shows no results when search has no matches', () => {
    render(<StepPickGame gameTypes={games} onSelect={vi.fn()} onCreateCustom={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/search games/i), { target: { value: 'zzz' } })
    expect(screen.getByText(/no games found/i)).toBeTruthy()
  })
})

// ── StepSelectPlayers ────────────────────────────────────────

describe('StepSelectPlayers', () => {
  const members = [
    { id: 'u1', username: 'alice', avatar_url: null },
    { id: 'u2', username: 'bob',   avatar_url: null },
    { id: 'u3', username: 'carol', avatar_url: null },
  ]
  const gameType = { id: 'g1', name: 'Beer Pong', supports_draws: false }

  it('renders all members', () => {
    render(<StepSelectPlayers members={members} gameType={gameType} onConfirm={vi.fn()} />)
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
    expect(screen.getByText('carol')).toBeTruthy()
  })

  it('calls onConfirm with activePlayers and teams', () => {
    const onConfirm = vi.fn()
    render(<StepSelectPlayers members={members} gameType={gameType} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onConfirm).toHaveBeenCalled()
    const arg = onConfirm.mock.calls[0][0]
    expect(arg).toHaveProperty('activePlayers')
    expect(arg).toHaveProperty('teams')
  })

  it('shows FFA and Teams toggle buttons', () => {
    render(<StepSelectPlayers members={members} gameType={gameType} onConfirm={vi.fn()} />)
    expect(screen.getByText(/FFA/i)).toBeTruthy()
    expect(screen.getByText(/Teams/i)).toBeTruthy()
  })
})

// ── StepConfirm ───────────────────────────────────────────────

describe('StepConfirm', () => {
  const gameType = { id: 'g1', name: 'Mario Kart', category: 'Video Games' }
  const teams = [
    { key: 'A', playerIds: ['u1'], isWinner: true,  score: '3' },
    { key: 'B', playerIds: ['u2'], isWinner: false, score: '1' },
  ]
  const members = [{ id: 'u1', username: 'alice' }, { id: 'u2', username: 'bob' }]

  it('renders game name and players', () => {
    render(<StepConfirm gameType={gameType} teams={teams} isTeamMode={false} isDrawn={false} members={members} onConfirm={vi.fn()} loading={false} />)
    expect(screen.getByText('Mario Kart')).toBeTruthy()
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
  })

  it('shows Draw when isDrawn is true', () => {
    render(<StepConfirm gameType={gameType} teams={teams} isTeamMode={false} isDrawn={true} members={members} onConfirm={vi.fn()} loading={false} />)
    expect(screen.getByText(/draw/i)).toBeTruthy()
  })

  it('calls onConfirm with notes and playedAt', () => {
    const onConfirm = vi.fn()
    render(<StepConfirm gameType={gameType} teams={teams} isTeamMode={false} isDrawn={false} members={members} onConfirm={onConfirm} loading={false} />)
    fireEvent.click(screen.getByRole('button', { name: /save game/i }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ notes: '', playedAt: expect.any(String) }))
  })

  it('passes notes when entered', () => {
    const onConfirm = vi.fn()
    render(<StepConfirm gameType={gameType} teams={teams} isTeamMode={false} isDrawn={false} members={members} onConfirm={onConfirm} loading={false} />)
    fireEvent.change(screen.getByPlaceholderText(/e.g. Rematch/i), { target: { value: 'Epic!' } })
    fireEvent.click(screen.getByRole('button', { name: /save game/i }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Epic!' }))
  })

  it('disables button while loading', () => {
    render(<StepConfirm gameType={gameType} teams={teams} isTeamMode={false} isDrawn={false} members={members} onConfirm={vi.fn()} loading={true} />)
    // When loading, the save button should be disabled (spinner shows, no text)
    const buttons = screen.getAllByRole('button')
    const saveBtn = buttons.find(b => b.disabled)
    expect(saveBtn).toBeTruthy()
  })
})

// ── Regression: invite redirect ───────────────────────────────

describe('regression: invite redirect after login', () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockClear(); setupFromChain() })

  it('navigates to invite URL after login when from state is set', async () => {
    mockSignIn.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } }, error: null })
    mockListFactors.mockResolvedValue({ data: { totp: [] } })
    wrap(<LoginPage />, '/login', { from: '/invite/tok123' })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@a.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'),         { target: { value: 'password1' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/invite/tok123', { replace: true }))
  })
})
