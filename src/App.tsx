import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import {
  Activity, ArrowDownLeft, CalendarDays, CircleDollarSign, ClipboardList, FileText,
  LayoutDashboard, LogOut, Menu, MoreHorizontal, Settings, Users, X,
} from 'lucide-react'
import { Login } from './components/Login'
import { LoadingScreen } from './components/LoadingScreen'
import { WorkspacePage } from './components/Workspace'
import { firebaseConfigured, getFirebaseAuth } from './services/firebase/client'
import { verifyOwnerSession } from './services/firebase/data'

type AuthState = 'loading' | 'signed-out' | 'checking' | 'ready' | 'config-error'
type PageId = 'dashboard' | 'customers' | 'bills' | 'payments' | 'ledgers' | 'transactions' | 'reports' | 'activity' | 'settings'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'WORKSPACE' },
  { id: 'customers', label: 'Customers', icon: Users, group: 'WORKSPACE' },
  { id: 'bills', label: 'Monthly Bills', icon: FileText, group: 'WORKSPACE' },
  { id: 'payments', label: 'Payments', icon: ArrowDownLeft, group: 'WORKSPACE' },
  { id: 'ledgers', label: 'Customer Ledgers', icon: Activity, group: 'WORKSPACE' },
  { id: 'transactions', label: 'Transactions', icon: CircleDollarSign, group: 'WORKSPACE' },
  { id: 'reports', label: 'Reports', icon: CalendarDays, group: 'MANAGEMENT' },
  { id: 'activity', label: 'Activity History', icon: ClipboardList, group: 'MANAGEMENT' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'MANAGEMENT' },
] as const

const mobilePrimaryItems = navItems.filter(item =>
  ['dashboard', 'customers', 'bills', 'payments', 'ledgers'].includes(item.id),
)
const mobileMoreItems = navItems.filter(item =>
  ['transactions', 'reports', 'activity', 'settings'].includes(item.id),
)

function readPageFromHash(): PageId {
  const candidate = window.location.hash.replace(/^#\/?/, '')
  return navItems.some(item => item.id === candidate) ? candidate as PageId : 'dashboard'
}

function Dashboard({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [page, setPage] = useState<PageId>(readPageFromHash)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')

  useEffect(() => {
    const syncPage = () => { setPage(readPageFromHash()); setMenuOpen(false); setMoreOpen(false) }
    window.addEventListener('hashchange', syncPage)
    return () => window.removeEventListener('hashchange', syncPage)
  }, [])

  function navigate(nextPage: PageId) {
    if (nextPage !== page) window.location.hash = `/${nextPage}`
    else setPage(nextPage)
    setMenuOpen(false)
    setMoreOpen(false)
  }

  const currentPageLabel = navItems.find(item => item.id === page)?.label ?? 'Dashboard'
  const groupedItems = [
    { title: 'WORKSPACE', items: navItems.filter(item => item.group === 'WORKSPACE') },
    { title: 'MANAGEMENT', items: navItems.filter(item => item.group === 'MANAGEMENT') },
  ]

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-stack">
          <span className="sidebar-logo-frame"><img className="brand-logo-img" src="/ali-al-fateeh-logo.png" alt="ALI AL-FATEEH" width={1774} height={887} draggable={false}/></span>
          <span className="sidebar-brand-caption"><i/> INTERNET BILL MANAGEMENT</span>
        </div>
        <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19}/></button>
      </div>
      {groupedItems.map(group => <div className="nav-group" key={group.title}><div className="nav-caption">{group.title}</div><nav>{group.items.map(item => <button key={item.id} type="button" className={`nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={18}/><span>{item.label}</span>{page === item.id && <i/>}</button>)}</nav></div>)}
      <div className="sidebar-bottom"><div className="admin-avatar">A</div><div className="admin-info"><strong>Administrator</strong><span>{email}</span></div><button className="logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={17}/></button></div>
    </aside>
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-main">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
          <div className="topbar-heading">
            <span className="topbar-overline">ALI AL-FATEEH <b>/</b> ADMIN WORKSPACE</span>
            <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{currentPageLabel}</strong></div>
          </div>
        </div>
        <div className="topbar-right"><span className="topbar-local-time"><i/> Asia/Dhaka</span><span className="admin-pill"><i/> Secure admin</span><div className="top-avatar">A</div></div>
      </header>
      <div className="page-wrap">
        <WorkspacePage page={page} onNavigate={navigate} selectedCustomerId={selectedCustomerId} onSelectCustomer={setSelectedCustomerId}/>
        <footer className="app-footer"><span>ALI AL-FATEEH · INTERNET BILLING</span><span>Financial records are traceable and auditable.</span></footer>
      </div>
    </main>
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      {mobilePrimaryItems.map(item => <button key={item.id} type="button" className={`mobile-bottom-nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
        <item.icon size={19} strokeWidth={page === item.id ? 2.4 : 1.9}/><span>{item.id === 'bills' ? 'Bills' : item.id === 'ledgers' ? 'Ledger' : item.label}</span>
      </button>)}
      <button type="button" className={`mobile-bottom-nav-item ${mobileMoreItems.some(item => item.id === page) || moreOpen ? 'active' : ''}`} aria-expanded={moreOpen} aria-haspopup="dialog" onClick={() => setMoreOpen(value => !value)}>
        <MoreHorizontal size={20}/><span>More</span>
      </button>
    </nav>
    {moreOpen && <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)}>
      <section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="More navigation options" onClick={event => event.stopPropagation()}>
        <div className="mobile-more-heading"><div><span className="topbar-overline">ALI AL-FATEEH</span><strong>More workspace</strong></div><button type="button" className="mobile-more-close" onClick={() => setMoreOpen(false)} aria-label="Close more menu"><X size={18}/></button></div>
        <div className="mobile-more-grid">{mobileMoreItems.map(item => <button key={item.id} type="button" className={`mobile-more-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><span><item.icon size={19}/></span><strong>{item.label}</strong></button>)}</div>
      </section>
    </div>}
  </div>
}

export default function App() {
  const [state, setState] = useState<AuthState>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!firebaseConfigured()) { setState('config-error'); return }
    let alive = true
    let unsubscribe: (() => void) | undefined
    try {
      const auth = getFirebaseAuth()
      unsubscribe = onAuthStateChanged(auth, async current => {
        if (!alive) return
        if (!current) { setUser(null); setState('signed-out'); return }
        setState('checking')
        try {
          const admin = await verifyOwnerSession(current)
          if (!alive) return
          setUser(current)
          setEmail(admin.email || current.email || 'Administrator')
          setState('ready')
          setAuthError('')
        } catch (error) {
          await signOut(auth)
          if (!alive) return
          setUser(null)
          setAuthError(error instanceof Error ? error.message : 'Administrator verification failed.')
          setState('signed-out')
        }
      }, error => { if (alive) { setAuthError(error.message); setState('signed-out') } })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Firebase setup error.')
      setState('config-error')
    }
    return () => { alive = false; unsubscribe?.() }
  }, [])

  async function logout() {
    if (user) await signOut(getFirebaseAuth())
    setUser(null)
    setState('signed-out')
    window.location.hash = '/dashboard'
  }

  if (state === 'loading' || state === 'checking') return <LoadingScreen checking={state === 'checking'} />
  if (state === 'config-error') return <main className="config-screen"><div className="config-card"><div className="system-brand-frame config-brand-frame"><img className="brand-logo-img" src="/ali-al-fateeh-logo.png" alt="ALI AL-FATEEH" width={1774} height={887} draggable={false}/></div><h1>Firebase setup required</h1><p>Add your Firebase web app settings to <code>.env.local</code>, then restart the development server.</p><pre>VITE_FIREBASE_API_KEY=…{'\n'}VITE_FIREBASE_AUTH_DOMAIN=…{'\n'}VITE_FIREBASE_PROJECT_ID=…{'\n'}VITE_FIREBASE_APP_ID=…</pre>{authError && <small>{authError}</small>}</div></main>
  if (state === 'ready') return <Dashboard email={email} onLogout={logout}/>
  return <Login onSignedIn={value => { setEmail(value); setState('checking') }}/>
}
