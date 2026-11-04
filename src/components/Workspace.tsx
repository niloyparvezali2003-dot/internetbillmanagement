import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownLeft, ArrowUpRight, BookOpen, CalendarDays, CheckCircle2, CircleDollarSign,
  Download, FileText, History, Pencil, Plus, RefreshCw, Search, UserMinus, UserPlus, Users, Wallet, Wifi, type LucideIcon,
} from 'lucide-react'
import { runDataOperation } from '../services/firebase/data'

type PageId = 'dashboard' | 'customers' | 'bills' | 'payments' | 'ledgers' | 'transactions' | 'reports' | 'activity' | 'settings'
type Customer = {
  id: string; customerCode?: string; name: string; phone: string; address: string; status: 'ACTIVE' | 'INACTIVE';
  monthlyAmount: number; openingBalance: number; currentBalance?: number; openingBalanceType: string; joinDate: string | null;
  leaveDate: string | null; servicePeriods: { id: string; joinDate: string; leaveDate: string | null; status: string }[];
}
type Bill = { id: string; customerId: string; customerName: string; billingMonth: string; amount: number; paidAmount: number; balance: number; previousBalance: number; openingBalanceThisMonth: number; paymentsThisMonth: number; paymentReversalsThisMonth: number; amountPayable: number; advanceCredit: number; status: string }
type Payment = { id: string; customerId: string; customerName: string; reference: string; amount: number; paymentDate: string; method: string; note: string; status: string; reversalReason?: string }
type LedgerRow = { id: string; date: string; type: string; reference: string; description: string; debit: number; credit: number; balance: number }
type LedgerData = { customer: { id: string; name: string; phone: string; address: string; status: string; monthlyAmount: number }; servicePeriods: { joinDate: string; leaveDate: string | null; status: string }[]; ledger: LedgerRow[]; summary: { totalDebit: number; totalCredit: number; balance: number; outstanding: number; advanceCredit: number } }
type AnnualIncomeData = { year: number; total: number; months: { month: string; amount: number }[] }
type DashboardData = { month: string; annualIncome?: AnnualIncomeData; stats: { activeCustomers: number; billedThisMonth: number; collectedThisMonth: number; outstanding: number; advanceCredit: number; totalBillsThisMonth: number; transactionCountThisMonth: number }; recentActivity: { id: string; description: string; createdAt: string | null; action: string }[] }
type Transaction = { id: string; customerName: string; date: string; type: string; reference: string; description: string; debit: number; credit: number }
type BillGenerationReport = {
  month: string; created: number; alreadyExists: number; skipped: number; inactive: number; outOfOrder: number; errors: number;
  errorDetails: { customerId: string; customerCode: string; customerName: string; message: string }[]; message: string
}

const todayDhaka = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const monthDhaka = () => todayDhaka().slice(0, 7)
const nextMonthDhaka = () => { const [year, month] = monthDhaka().split('-').map(Number); return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}` }
// Hide unnecessary trailing .00 while preserving real poisha values (e.g. 200.50).
const bdt = (amount: number) => new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount || 0)
const dateLabel = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(new Date(`${value.slice(0, 10)}T00:00:00`)) : '—'
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const asArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : []

function printDocument(title: string, body: string, extraStyles = '') {
  const popup = window.open('', '_blank', 'width=900,height=700')
  if (!popup) { window.alert('Please allow pop-ups to print or save this document as PDF.'); return }
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Noto+Serif+Bengali:wght@400;500;600;700&display=swap" rel="stylesheet"><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:'Noto Serif Bengali','DM Sans',Arial,sans-serif;color:#12233F;margin:0;font-size:12px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #075FE4;padding-bottom:14px;margin-bottom:22px}header strong{font-size:20px;color:#071B3A}header small{color:#61728A}.brand-lockup-print{display:flex;align-items:center;gap:11px}.brand-lockup-print img{display:block;width:78px;height:39px;object-fit:contain;padding:3px;border-radius:5px;background:#071B3A}.brand-lockup-print div{display:grid;gap:2px}h1{font-size:20px;margin:0 0 5px}p{color:#61728A;line-height:1.5}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.meta div{background:#F4F8FD;padding:10px;border:1px solid #E7EFF8;border-radius:6px}.meta span{display:block;color:#718096;font-size:10px;margin-bottom:4px}.meta strong{font-size:12px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:9px 8px;border-bottom:1px solid #E7EFF8;text-align:left}th{background:#F4F8FD;color:#52647D;font-size:10px}td.numeric,th.numeric{text-align:right;font-variant-numeric:tabular-nums}.total{margin:18px 0 0 auto;width:260px;border-top:2px solid #071B3A;padding-top:10px}.total div{display:flex;justify-content:space-between;padding:4px 0}.total strong{font-size:16px}.foot{margin-top:35px;padding-top:10px;border-top:1px solid #E7EFF8;color:#718096;font-size:10px}@media print{button{display:none}}
  </style><style>${extraStyles}</style></head><body><header><div class="brand-lockup-print"><img src="${window.location.origin}/ali-al-fateeh-logo.png" alt="ALI AL-FATEEH"><div><strong>ALI AL-FATEEH</strong><small>INTERNET SERVICE & BILLING</small></div></div><div style="text-align:right"><strong>${escapeHtml(title)}</strong><br><small>Generated ${escapeHtml(todayDhaka())}</small></div></header>${body}<div class="foot">ALI AL-FATEEH · Keep this document for your records.</div><script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
}

function Status({ value }: { value: string }) {
  const normalized = value.toUpperCase()
  const className = ['PAID', 'ACTIVE', 'COMPLETED'].includes(normalized) ? 'status-pill status-success'
    : ['PARTIAL', 'PENDING'].includes(normalized) ? 'status-pill status-warning'
      : ['UNPAID', 'OVERDUE', 'INACTIVE', 'FAILED', 'REVERSED'].includes(normalized) ? 'status-pill status-danger' : 'status-pill status-neutral'
  return <span className={className}>{value}</span>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function LoadError({ error }: { error: string }) { return error ? <div className="notice notice-error" role="alert">{error}</div> : null }
function EmptyTable({ columns, message }: { columns: number; message: string }) { return <tr><td colSpan={columns} className="empty-table">{message}</td></tr> }

export function WorkspacePage({ page, onNavigate, selectedCustomerId, onSelectCustomer }: {
  page: PageId; onNavigate: (page: PageId) => void; selectedCustomerId: string; onSelectCustomer: (id: string) => void
}) {
  switch (page) {
    case 'dashboard': return <div className="workspace-page-enter"><DashboardWorkspace onNavigate={onNavigate}/></div>
    case 'customers': return <div className="workspace-page-enter"><CustomersPage onOpenLedger={id => { onSelectCustomer(id); onNavigate('ledgers') }}/></div>
    case 'bills': return <div className="workspace-page-enter"><BillsPage/></div>
    case 'payments': return <div className="workspace-page-enter"><PaymentsPage/></div>
    case 'ledgers': return <div className="workspace-page-enter"><LedgerPage selectedCustomerId={selectedCustomerId}/></div>
    case 'transactions': return <div className="workspace-page-enter"><TransactionsPage/></div>
    case 'reports': return <div className="workspace-page-enter"><ReportsPage/></div>
    case 'activity': return <div className="workspace-page-enter"><ActivityPage/></div>
    case 'settings': return <div className="workspace-page-enter"><SettingsPage/></div>
  }
}

function DashboardWorkspace({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  async function load() { setLoading(true); setError(''); try { setData(await runDataOperation<DashboardData>('/data/dashboard')) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load dashboard.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const stats = data?.stats
  // API responses can briefly be out of sync with a newly deployed frontend.
  // Treat missing/null list fields as empty lists instead of crashing the page.
  const recentActivity = asArray<DashboardData['recentActivity'][number]>(data?.recentActivity)
  return <>
    <PageHeading eyebrow="OVERVIEW" title="Dashboard" description="A live overview of your ALI AL-FATEEH internet billing workspace." action={<button className="secondary-button" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button>}/>
    <LoadError error={error}/>
    <div className="setup-banner"><span className="setup-icon"><Wifi size={19}/></span><div><strong>Your financial workspace is live</strong><p>Customer records, monthly bills and collections are read directly from your secured Firestore data.</p></div><span className="setup-tag">ASIA/DHAKA</span></div>
    <section className="stats-grid dashboard-stats-grid">
      <StatCard label="Active customers" value={loading ? '…' : String(stats?.activeCustomers ?? 0)} note="Currently connected" icon={Users} tone="blue"/>
      <StatCard label="Monthly billed" value={loading ? '…' : bdt(stats?.billedThisMonth ?? 0)} note={`${stats?.totalBillsThisMonth ?? 0} bill(s) this month`} icon={FileText} tone="violet"/>
      <StatCard label="Net collection" value={loading ? '…' : bdt(stats?.collectedThisMonth ?? 0)} note="Payments less reversals" icon={ArrowDownLeft} tone="green"/>
      <StatCard label="Outstanding balance" value={loading ? '…' : bdt(stats?.outstanding ?? 0)} note="Across all customers" icon={ArrowUpRight} tone="amber"/>
      <StatCard label="Advance credit" value={loading ? '…' : bdt(stats?.advanceCredit ?? 0)} note="Customer account credits" icon={Wallet} tone="green"/>
      <StatCard label="Transactions this month" value={loading ? '…' : String(stats?.transactionCountThisMonth ?? 0)} note="Payments and reversals posted" icon={History} tone="blue"/>
    </section>
    <AnnualIncomeChart income={data?.annualIncome} loading={loading}/>
    <section className="dashboard-grid">
      <article className="panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest customer and financial updates.</p></div><History size={18} className="panel-mark"/></div>
        {recentActivity.length ? <div className="activity-list">{recentActivity.map(item => <div className="activity-row" key={item.id}><span className="activity-dot"/><div><strong>{item.description}</strong><small>{item.action?.replaceAll('_', ' ')} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Just now'}</small></div></div>)}</div> : <div className="empty-state"><span className="empty-icon"><History size={22}/></span><strong>{loading ? 'Loading activity…' : 'No activity recorded yet'}</strong><p>Actions will appear after a customer, bill or payment is recorded.</p></div>}
      </article>
      <article className="panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Go directly to a common task.</p></div></div><div className="quick-action-grid">
        <button onClick={() => onNavigate('customers')}><Users size={19}/><span><strong>Add customer</strong><small>Profile and opening balance</small></span></button>
        <button onClick={() => onNavigate('bills')}><FileText size={19}/><span><strong>Generate bills</strong><small>Full-month subscription</small></span></button>
        <button onClick={() => onNavigate('payments')}><Wallet size={19}/><span><strong>Record payment</strong><small>Manual collection</small></span></button>
        <button onClick={() => onNavigate('ledgers')}><BookOpen size={19}/><span><strong>View ledger</strong><small>Debit, credit and balance</small></span></button>
      </div></article>
    </section>
  </>
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function compactBdt(value: number) {
  const formatted = new Intl.NumberFormat('en-BD', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(value))
  return `${value < 0 ? '−' : ''}৳${formatted}`
}

function AnnualIncomeChart({ income, loading }: { income?: AnnualIncomeData; loading: boolean }) {
  const year = income?.year ?? Number(monthDhaka().slice(0, 4))
  const currentMonth = monthDhaka()
  const sourceMonths = asArray<AnnualIncomeData['months'][number]>(income?.months)
  const months = MONTH_NAMES.map((label, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`
    const match = sourceMonths.find(item => item.month === month)
    return { month, label, amount: Number.isFinite(Number(match?.amount)) ? Number(match?.amount ?? 0) : 0 }
  })
  // Compare only completed months so an unfinished current month or future
  // months do not automatically appear as the year's lowest collection.
  const completedMonths = months.filter(item => item.month < currentMonth)
  const completedValues = completedMonths.map(item => item.amount)
  const highest = completedValues.length ? Math.max(...completedValues) : 0
  const lowest = completedValues.length ? Math.min(...completedValues) : 0
  const hasCompletedIncome = completedMonths.some(item => item.amount !== 0)
  const isFlat = completedMonths.length > 1 && highest === lowest
  const canRank = completedMonths.length > 1 && hasCompletedIncome && !isFlat
  const highestMonths = canRank ? completedMonths.filter(item => item.amount === highest) : []
  const lowestMonths = canRank ? completedMonths.filter(item => item.amount === lowest) : []
  const total = Number.isFinite(Number(income?.total)) ? Number(income?.total) : months.reduce((sum, item) => sum + item.amount, 0)
  const plotMin = Math.min(0, ...months.map(item => item.amount))
  const plotMax = Math.max(0, ...months.map(item => item.amount))
  const plotRange = plotMax - plotMin || 1
  const zeroPosition = (plotMax / plotRange) * 100
  const currentYear = year === Number(currentMonth.slice(0, 4))
  const monthListLabel = (items: typeof months) => items.length > 3 ? `${items.length} months tied` : items.map(item => item.label).join(', ')

  return <article className="panel annual-income-panel">
    <div className="annual-income-heading">
      <div>
        <span className="eyebrow">COLLECTION OVERVIEW</span>
        <h2>January – December income</h2>
        <p>Monthly payments received, less payment reversals, for {year}.</p>
      </div>
      <div className="annual-income-total"><small>Total collected · {year}</small><strong>{loading ? '…' : bdt(total)}</strong></div>
    </div>
    <div className="annual-income-highlights">
      <div className="annual-income-highlight highest">
        <span className="annual-income-dot"/>
        <div><small>Highest completed month</small><strong>{loading ? '…' : canRank ? monthListLabel(highestMonths) : isFlat ? 'Equal across months' : completedMonths.length <= 1 ? 'Not enough months' : 'No income recorded'}</strong></div>
        <b>{loading ? '…' : canRank ? bdt(highest) : isFlat ? bdt(highest) : '—'}</b>
      </div>
      <div className="annual-income-highlight lowest">
        <span className="annual-income-dot"/>
        <div><small>Lowest completed month</small><strong>{loading ? '…' : canRank ? monthListLabel(lowestMonths) : isFlat ? 'Equal across months' : completedMonths.length <= 1 ? 'Not enough months' : 'No income recorded'}</strong></div>
        <b>{loading ? '…' : canRank ? bdt(lowest) : isFlat ? bdt(lowest) : '—'}</b>
      </div>
    </div>
    <div className="annual-income-chart" role="list" aria-label={`Monthly net income for January through December ${year}`}>
      <div className="annual-income-chart-grid" aria-hidden="true"><span/><span/><span/><span/><div className="annual-income-zero-line" style={{ top: `${zeroPosition}%` }}/></div>
      <div className="annual-income-months">
        {months.map(item => {
          const isCurrent = currentYear && item.month === currentMonth
          const isFuture = currentYear && item.month > currentMonth
          const isHighest = canRank && !isCurrent && item.month < currentMonth && item.amount === highest
          const isLowest = canRank && !isCurrent && item.month < currentMonth && item.amount === lowest
          const valuePosition = ((plotMax - item.amount) / plotRange) * 100
          const barTop = Math.min(zeroPosition, valuePosition)
          const barHeight = Math.abs(zeroPosition - valuePosition)
          const tone = isHighest ? 'highest' : isLowest ? 'lowest' : isCurrent ? 'current' : isFuture ? 'future' : 'normal'
          // Keep a tiny color marker visible for a ranked month whose actual
          // collection is zero; the marker is not included in the data value.
          const zeroValueMarker = barHeight === 0 && (isHighest || isLowest)
          const displayTop = zeroValueMarker ? Math.min(98, Math.max(0, barTop - 1)) : barTop
          const displayHeight = zeroValueMarker ? '3px' : `${barHeight}%`
          return <div className={`annual-income-month ${tone}`} key={item.month} role="listitem" title={`${item.label} ${year}: ${bdt(item.amount)}${isCurrent ? ' · month to date' : isFuture ? ' · upcoming month' : ''}`} aria-label={`${item.label} ${year}: ${bdt(item.amount)}${isCurrent ? ', current month to date' : isFuture ? ', upcoming month' : ''}`}>
            <span className="annual-income-month-value">{compactBdt(item.amount)}</span>
            <div className="annual-income-track"><span className="annual-income-bar" style={{ top: `${displayTop}%`, height: displayHeight }}/></div>
            <span className="annual-income-month-label">{item.label}</span>
          </div>
        })}
      </div>
    </div>
    <div className="annual-income-legend">
      <span><i className="legend-highest"/>Highest</span>
      <span><i className="legend-lowest"/>Lowest</span>
      <span><i className="legend-normal"/>Other months</span>
      <span><i className="legend-current"/>Current month</span>
      <small>{currentYear ? 'Highest and lowest compare completed months only; current month is still in progress.' : 'Highest and lowest are compared across all months.'}</small>
    </div>
    {!loading && !hasCompletedIncome && <p className="annual-income-empty">No completed-month income has been recorded for {year} yet. Collection totals will appear here as payments are posted.</p>}
  </article>
}

function StatCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: LucideIcon; tone: string }) {
  return <article className={`stat-card stat-card-${tone}`}>
    <div className={`stat-icon ${tone}`}><Icon size={20}/></div>
    <div className="stat-copy"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><small>{note}</small></div>
  </article>
}

function CustomersPage({ onOpenLedger }: { onOpenLedger: (id: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const [rateHistory, setRateHistory] = useState<{ customerName: string; rates: { effectiveMonth: string; amount: number; note?: string }[] } | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', address: '', joinDate: todayDhaka(), monthlyAmount: '', openingBalanceAmount: '0', openingBalanceType: 'due', openingBalanceDate: todayDhaka(), openingBalanceDescription: '' })
  async function load() { setLoading(true); setError(''); try { const result = await runDataOperation<{ customers: Customer[] }>('/data/customers'); setCustomers(asArray<Customer>(result?.customers)) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load customers.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const filtered = useMemo(() => customers.filter(c => `${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(query.toLowerCase())), [customers, query])
  const activeCustomerCount = customers.filter(customer => customer.status === 'ACTIVE').length
  const inactiveCustomerCount = customers.length - activeCustomerCount
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      const body = { ...form, monthlyAmount: Number(form.monthlyAmount), openingBalanceAmount: Number(form.openingBalanceAmount), openingBalanceType: Number(form.openingBalanceAmount) > 0 ? form.openingBalanceType : 'none' }
      await runDataOperation('/data/customers', { method: 'POST', body })
      setSuccess('Customer registered successfully. The permanent internal ID was created automatically.')
      setShowForm(false)
      setForm({ name: '', phone: '', address: '', joinDate: todayDhaka(), monthlyAmount: '', openingBalanceAmount: '0', openingBalanceType: 'due', openingBalanceDate: todayDhaka(), openingBalanceDescription: '' })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create customer.') } finally { setBusy(false) }
  }
  async function endService(customer: Customer) {
    const leaveDate = window.prompt(`Leaving date for ${customer.name} (YYYY-MM-DD):`, todayDhaka())
    if (!leaveDate) return
    setError(''); setSuccess('')
    try { await runDataOperation(`/data/customers/${encodeURIComponent(customer.id)}/leave`, { method: 'POST', body: { leaveDate } }); setSuccess(`${customer.name}'s service has been ended.`); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to end service.') }
  }
  async function restartService(customer: Customer) {
    const joinDate = window.prompt(`New joining date for ${customer.name} (YYYY-MM-DD):`, todayDhaka())
    if (!joinDate) return
    setError(''); setSuccess('')
    try { await runDataOperation(`/data/customers/${encodeURIComponent(customer.id)}/service`, { method: 'POST', body: { joinDate } }); setSuccess(`${customer.name}'s service has restarted. Their permanent customer record was retained.`); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to restart service.') }
  }
  async function viewRateHistory(customer: Customer) {
    setError('')
    try {
      const result = await runDataOperation<{ rates: { effectiveMonth: string; amount: number; note?: string }[] }>(`/data/customers/${encodeURIComponent(customer.id)}/rates`)
      setRateHistory({ customerName: customer.name, rates: asArray(result?.rates) })
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load rate history.') }
  }
  async function changeRate(customer: Customer) {
    const effectiveMonth = window.prompt(`Rate effective month for ${customer.name} (YYYY-MM). Use a new month so existing bills and rates remain unchanged:`, nextMonthDhaka())
    if (!effectiveMonth) return
    const monthlyAmount = window.prompt(`New monthly subscription amount for ${customer.name} (BDT):`, String(customer.monthlyAmount))
    if (!monthlyAmount) return
    const note = window.prompt('Reason / note for this rate change:', '') ?? ''
    setError(''); setSuccess('')
    try { await runDataOperation(`/data/customers/${encodeURIComponent(customer.id)}/rates`, { method: 'POST', body: { effectiveMonth, monthlyAmount: Number(monthlyAmount), note } }); setSuccess(`Subscription rate updated for ${customer.name} from ${effectiveMonth}.`); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to change subscription rate.') }
  }
  async function editCustomer(customer: Customer) {
    const name = window.prompt('Customer name:', customer.name)
    if (name === null) return
    const phone = window.prompt('Mobile number:', customer.phone)
    if (phone === null) return
    const address = window.prompt('Address:', customer.address)
    if (address === null) return
    setError(''); setSuccess('')
    try { await runDataOperation(`/data/customers/${encodeURIComponent(customer.id)}`, { method: 'PATCH', body: { name, phone, address } }); setSuccess('Customer profile updated.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update customer.') }
  }
  function downloadCustomerDirectoryPdf() {
    const totalDue = customers.reduce((sum, customer) => sum + Math.max(0, customer.currentBalance ?? 0), 0)
    const totalAdvance = customers.reduce((sum, customer) => sum + Math.max(0, -(customer.currentBalance ?? 0)), 0)
    const rows = customers.map((customer, index) => {
      const balance = customer.currentBalance ?? 0
      const balanceText = balance > 0 ? `Due ${bdt(balance)}` : balance < 0 ? `Advance ${bdt(Math.abs(balance))}` : 'Clear'
      return `<tr><td>${index + 1}</td><td>${escapeHtml(customer.customerCode || customer.id)}</td><td><strong>${escapeHtml(customer.name)}</strong></td><td>${escapeHtml(customer.phone || '—')}</td><td>${escapeHtml(customer.address || '—')}</td><td>${escapeHtml(dateLabel(customer.joinDate))}</td><td class="numeric">${escapeHtml(bdt(customer.monthlyAmount))}</td><td class="numeric">${escapeHtml(balanceText)}</td><td>${escapeHtml(customer.status)}</td></tr>`
    }).join('')
    const body = `<h1>Customer Directory & Outstanding Summary</h1><p>Complete customer register · ${customers.length} customer record(s)</p><div class="meta customer-pdf-summary"><div><span>Total customers</span><strong>${customers.length}</strong></div><div><span>Active customers</span><strong>${activeCustomerCount}</strong></div><div><span>Inactive customers</span><strong>${inactiveCustomerCount}</strong></div><div><span>Total outstanding due</span><strong>${escapeHtml(bdt(totalDue))}</strong></div><div><span>Advance credit (separate)</span><strong>${escapeHtml(bdt(totalAdvance))}</strong></div></div><table class="customer-pdf-table"><thead><tr><th>#</th><th>Customer ID</th><th>Customer</th><th>Phone</th><th>Address</th><th>Join date</th><th class="numeric">Monthly rate</th><th class="numeric">Current balance</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="9">No customer records found.</td></tr>'}</tbody></table><p class="customer-pdf-note">Total outstanding due is the sum of positive customer balances only. Advance credits are shown separately and are not deducted from other customers’ dues.</p>`
    const styles = `@page{size:A4 landscape;margin:10mm}.customer-pdf-summary{grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:12px 0}.customer-pdf-summary div{padding:8px}.customer-pdf-summary span{font-size:9px}.customer-pdf-summary strong{font-size:11px}.customer-pdf-table{font-size:9px;margin-top:10px}.customer-pdf-table th,.customer-pdf-table td{padding:6px 5px;font-size:8px;vertical-align:top}.customer-pdf-table td:nth-child(5){max-width:150px;overflow-wrap:anywhere}.customer-pdf-note{margin-top:14px;font-size:9px}@media print{.customer-pdf-table tr{break-inside:avoid}}`
    printDocument('Customer directory · Outstanding summary', body, styles)
  }
  const rateRows = asArray<{ effectiveMonth: string; amount: number; note?: string }>(rateHistory?.rates)
  return <>
    <PageHeading eyebrow="CUSTOMER MANAGEMENT" title="Customers" description="Register customers, keep their service history and bring forward previous account balances." action={<div className="customer-page-actions"><button className="secondary-button" onClick={downloadCustomerDirectoryPdf} disabled={loading || customers.length === 0} title="Print or save the complete customer directory as PDF"><Download size={15}/> Download PDF</button><button className="primary-button" onClick={() => setShowForm(v => !v)}><Plus size={16}/>{showForm ? 'Close form' : 'Add customer'}</button></div>}/>
    <LoadError error={error}/>{success && <div className="notice notice-success"><CheckCircle2 size={16}/>{success}</div>}
    <div className="customer-summary-grid" aria-label="Customer totals">
      <article className="customer-summary-card"><span className="customer-summary-icon blue"><Users size={18}/></span><div><small>Total customers</small><strong>{loading ? '…' : customers.length}</strong></div><span className="customer-summary-caption">All customer records</span></article>
      <article className="customer-summary-card"><span className="customer-summary-icon green"><CheckCircle2 size={18}/></span><div><small>Active customers</small><strong>{loading ? '…' : activeCustomerCount}</strong></div><span className="customer-summary-caption">Currently connected</span></article>
      <article className="customer-summary-card"><span className="customer-summary-icon neutral"><History size={18}/></span><div><small>Inactive customers</small><strong>{loading ? '…' : inactiveCustomerCount}</strong></div><span className="customer-summary-caption">Historical profiles retained</span></article>
    </div>
    {rateHistory && <section className="panel table-panel rate-history-panel"><div className="table-toolbar"><div><h2>Rate history · {rateHistory.customerName}</h2><p>Each rate applies from its effective billing month; existing bills are not recalculated.</p></div><button className="secondary-button" onClick={() => setRateHistory(null)}>Close</button></div><div className="table-scroll"><table><thead><tr><th>Effective month</th><th className="numeric">Monthly amount</th><th>Note</th></tr></thead><tbody>{rateRows.length ? rateRows.map(rate => <tr key={rate.effectiveMonth}><td>{rate.effectiveMonth}</td><td className="numeric">{bdt(rate.amount)}</td><td>{rate.note || '—'}</td></tr>) : <EmptyTable columns={3} message="No rate history found."/>}</tbody></table></div></section>}
    {showForm && <form className="panel form-panel" onSubmit={submit}>
      <div className="section-heading"><div><h2>New customer</h2><p>Permanent customer IDs are generated in the backend and are not displayed.</p></div></div>
      <div className="form-grid">
        <label>Customer name *<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Enter full name"/></label>
        <label>Mobile number<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX"/></label>
        <label className="span-2">Address<input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Customer address"/></label>
        <label>Joining date *<input type="date" required value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })}/></label>
        <label>Monthly subscription (৳) *<input type="number" min="0.01" step="0.01" required value={form.monthlyAmount} onChange={e => setForm({ ...form, monthlyAmount: e.target.value })} placeholder="1000"/></label>
      </div>
      <div className="form-subheading"><div><h3>Opening balance</h3><p>Bring forward previous due or advance credit. Leave at zero when there is no previous balance.</p></div></div>
      <div className="form-grid">
        <label>Opening amount (৳)<input type="number" min="0" step="0.01" value={form.openingBalanceAmount} onChange={e => setForm({ ...form, openingBalanceAmount: e.target.value })}/></label>
        <label>Balance type<select value={form.openingBalanceType} onChange={e => setForm({ ...form, openingBalanceType: e.target.value })}><option value="due">Outstanding due</option><option value="advance">Advance credit</option></select></label>
        <label>Opening balance date<input type="date" value={form.openingBalanceDate} onChange={e => setForm({ ...form, openingBalanceDate: e.target.value })}/></label>
        <label>Description<input maxLength={300} value={form.openingBalanceDescription} onChange={e => setForm({ ...form, openingBalanceDescription: e.target.value })} placeholder="Previous record / migration note"/></label>
      </div>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving customer…' : 'Save customer'}</button></div>
    </form>}
    <section className="panel table-panel customer-directory-panel"><div className="table-toolbar"><div><span className="table-toolbar-kicker">CUSTOMER DATABASE</span><h2>Customer directory</h2><p>{customers.length} customer record(s)</p></div><label className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, phone or address"/></label></div>
      <div className="table-scroll customer-desktop-table"><table className="customer-directory-table"><thead><tr><th>Customer</th><th>Phone</th><th>Join date</th><th className="numeric">Monthly rate</th><th>Opening balance</th><th className="numeric">Current balance</th><th>Status</th><th className="numeric">Actions</th></tr></thead><tbody>
        {loading ? <EmptyTable columns={8} message="Loading customers…"/> : filtered.length === 0 ? <EmptyTable columns={8} message={query ? 'No customers match your search.' : 'No customers yet. Add your first customer to begin.'}/> : filtered.map(customer => <tr key={customer.id}><td><div className="customer-table-identity"><span className="customer-avatar">{customer.name.trim().slice(0, 1).toUpperCase()}</span><span><strong>{customer.name}</strong><small className="cell-sub">{customer.address || 'No address'}</small></span></div></td><td>{customer.phone || '—'}</td><td>{dateLabel(customer.joinDate)}</td><td className="numeric">{bdt(customer.monthlyAmount)}</td><td>{customer.openingBalance === 0 ? '—' : <span className={customer.openingBalance > 0 ? 'money-due' : 'money-credit'}>{customer.openingBalance > 0 ? 'Due ' : 'Advance '}{bdt(Math.abs(customer.openingBalance))}</span>}</td><td className="numeric"><span className={(customer.currentBalance ?? 0) > 0 ? 'money-due' : (customer.currentBalance ?? 0) < 0 ? 'money-credit' : ''}>{bdt(Math.abs(customer.currentBalance ?? 0))}{(customer.currentBalance ?? 0) < 0 ? ' · Advance' : ''}</span></td><td><Status value={customer.status}/></td><td className="numeric action-cell"><div className="customer-action-buttons"><button type="button" className="icon-button action-icon-button" title="Open customer ledger" aria-label={`Open ledger for ${customer.name}`} onClick={() => onOpenLedger(customer.id)}><BookOpen size={15}/></button><button type="button" className="icon-button action-icon-button" title="Edit customer" aria-label={`Edit ${customer.name}`} onClick={() => void editCustomer(customer)}><Pencil size={15}/></button><button type="button" className="icon-button action-icon-button" title="Change monthly rate" aria-label={`Change rate for ${customer.name}`} onClick={() => void changeRate(customer)}><CircleDollarSign size={15}/></button><button type="button" className="icon-button action-icon-button" title="View rate history" aria-label={`View rate history for ${customer.name}`} onClick={() => void viewRateHistory(customer)}><History size={15}/></button>{customer.status === 'ACTIVE' ? <button type="button" className="icon-button action-icon-button danger-icon-button" title="Mark customer as left" aria-label={`Mark ${customer.name} as left`} onClick={() => void endService(customer)}><UserMinus size={15}/></button> : <button type="button" className="icon-button action-icon-button" title="Rejoin customer" aria-label={`Rejoin ${customer.name}`} onClick={() => void restartService(customer)}><UserPlus size={15}/></button>}</div></td></tr>)}
      </tbody></table></div>
      <div className="customer-mobile-list">
        {loading ? <div className="customer-mobile-empty">Loading customers…</div> : filtered.length === 0 ? <div className="customer-mobile-empty">{query ? 'No customers match your search.' : 'No customers yet. Add your first customer to begin.'}</div> : filtered.map(customer => <article className="customer-mobile-card" key={customer.id}>
          <div className="customer-mobile-head"><div className="customer-table-identity"><span className="customer-avatar">{customer.name.trim().slice(0, 1).toUpperCase()}</span><span><strong>{customer.name}</strong><small>{customer.phone || 'No phone number'}</small></span></div><Status value={customer.status}/></div>
          <div className="customer-mobile-data"><div><small>Monthly rate</small><strong>{bdt(customer.monthlyAmount)}</strong></div><div><small>Current balance</small><strong className={(customer.currentBalance ?? 0) > 0 ? 'money-due' : (customer.currentBalance ?? 0) < 0 ? 'money-credit' : ''}>{bdt(Math.abs(customer.currentBalance ?? 0))}{(customer.currentBalance ?? 0) < 0 ? ' · Advance' : ''}</strong></div><div><small>Joined</small><strong>{dateLabel(customer.joinDate)}</strong></div><div><small>Opening balance</small><strong className={customer.openingBalance > 0 ? 'money-due' : customer.openingBalance < 0 ? 'money-credit' : ''}>{customer.openingBalance === 0 ? '—' : `${customer.openingBalance > 0 ? 'Due ' : 'Advance '}${bdt(Math.abs(customer.openingBalance))}`}</strong></div></div>
          <div className="customer-mobile-actions" role="group" aria-label={`Actions for ${customer.name}`}>
            <button type="button" className="icon-button action-icon-button" title="Open customer ledger" aria-label={`Open ledger for ${customer.name}`} onClick={() => onOpenLedger(customer.id)}><BookOpen size={18}/></button>
            <button type="button" className="icon-button action-icon-button" title="Edit customer" aria-label={`Edit ${customer.name}`} onClick={() => void editCustomer(customer)}><Pencil size={18}/></button>
            <button type="button" className="icon-button action-icon-button" title="Change monthly rate" aria-label={`Change rate for ${customer.name}`} onClick={() => void changeRate(customer)}><CircleDollarSign size={18}/></button>
            <button type="button" className="icon-button action-icon-button" title="View rate history" aria-label={`View rate history for ${customer.name}`} onClick={() => void viewRateHistory(customer)}><History size={18}/></button>
            {customer.status === 'ACTIVE'
              ? <button type="button" className="icon-button action-icon-button danger-icon-button" title="Mark customer as left" aria-label={`Mark ${customer.name} as left`} onClick={() => void endService(customer)}><UserMinus size={18}/></button>
              : <button type="button" className="icon-button action-icon-button success-icon-button" title="Rejoin customer" aria-label={`Rejoin ${customer.name}`} onClick={() => void restartService(customer)}><UserPlus size={18}/></button>}
          </div>
        </article>)}
      </div>
    </section>
  </>
}

function BillsPage() {
  const [month, setMonth] = useState(monthDhaka())
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generationReport, setGenerationReport] = useState<BillGenerationReport | null>(null)
  const [generationFailure, setGenerationFailure] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmCancelRef = useRef<HTMLButtonElement | null>(null)
  const generateTriggerRef = useRef<HTMLButtonElement | null>(null)
  const billingMonthLabel = month
    ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
    : 'the selected month'

  useEffect(() => {
    if (!confirmOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    confirmCancelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      generateTriggerRef.current?.focus()
    }
  }, [confirmOpen])

  async function load() {
    setLoading(true); setError('')
    try {
      const result = await runDataOperation<{ bills: Bill[] }>(`/data/bills?month=${month}`)
      setBills(asArray<Bill>(result?.bills))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load bills.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [month])

  async function generate() {
    setBusy(true); setError(''); setGenerationReport(null); setGenerationFailure('')
    try {
      const result = await runDataOperation<BillGenerationReport>('/data/bills/generate', { method: 'POST', body: { month } })
      setGenerationReport({
        ...result,
        errorDetails: asArray<BillGenerationReport['errorDetails'][number]>(result?.errorDetails),
      })
      await load()
    } catch (e) {
      setGenerationFailure(e instanceof Error ? e.message : 'Unable to generate bills.')
    } finally {
      setBusy(false)
    }
  }

  function printBill(bill: Bill) {
    printDocument(`Internet bill · ${bill.billingMonth}`, `<h1>Internet Subscription Bill</h1><p>Billing month: ${escapeHtml(bill.billingMonth)}</p><div class="meta"><div><span>Customer</span><strong>${escapeHtml(bill.customerName)}</strong></div><div><span>Bill reference</span><strong>${escapeHtml(`BILL-${bill.billingMonth}`)}</strong></div></div><table><thead><tr><th>Description</th><th class="numeric">Amount</th></tr></thead><tbody><tr><td>Previous account balance</td><td class="numeric">${escapeHtml(bdt(bill.previousBalance))}</td></tr>${bill.openingBalanceThisMonth ? `<tr><td>Opening balance recorded during month</td><td class="numeric">${escapeHtml(bdt(bill.openingBalanceThisMonth))}</td></tr>` : ''}<tr><td>Monthly internet subscription · ${escapeHtml(bill.billingMonth)}</td><td class="numeric">${escapeHtml(bdt(bill.amount))}</td></tr><tr><td>Payments received during ${escapeHtml(bill.billingMonth)}</td><td class="numeric">− ${escapeHtml(bdt(bill.paymentsThisMonth))}</td></tr>${bill.paymentReversalsThisMonth ? `<tr><td>Payment reversals during ${escapeHtml(bill.billingMonth)}</td><td class="numeric">${escapeHtml(bdt(bill.paymentReversalsThisMonth))}</td></tr>` : ''}</tbody></table><div class="total"><div><span>Account payable at month-end</span><strong>${escapeHtml(bdt(bill.amountPayable))}</strong></div><div><span>Advance credit</span><span>${escapeHtml(bdt(bill.advanceCredit))}</span></div><div><span>Bill reference status</span><strong>${escapeHtml(bill.status)}</strong></div></div>`)
  }

  const total = bills.reduce((sum, bill) => sum + bill.amount, 0)
  const paid = bills.reduce((sum, bill) => sum + bill.paidAmount, 0)
  const reportStatus = !generationReport ? '' : generationReport.errors > 0
    ? (generationReport.created > 0 ? 'Completed with some errors' : 'Generation needs attention')
    : generationReport.created > 0 ? 'Bill generation completed successfully' : 'Generation completed · no new bills needed'

  return <>
    <PageHeading eyebrow="MONTHLY BILLING" title="Monthly Bills" description="Generate full-month internet subscription bills and review each customer's bill status."/>
    <LoadError error={error}/>
    <section className="panel generation-panel">
      <div className="generation-panel-heading">
        <div><h2>Generate monthly bills</h2><p>One bill per eligible customer assignment for the selected month.</p></div>
        <span className="generation-calendar-icon"><CalendarDays size={19}/></span>
      </div>
      <label className="generation-month-field">Billing month *<input type="month" value={month} onChange={e => { setMonth(e.target.value); setGenerationReport(null); setGenerationFailure('') }}/></label>
      <p className="generation-help">Existing bills are kept as-is. Running the same month again will not create duplicate bills.</p>
      <button ref={generateTriggerRef} className="primary-button generation-submit" onClick={() => setConfirmOpen(true)} disabled={busy || loading || !month}><FileText size={16}/>{busy ? 'Generating bills…' : 'Generate bills'}</button>
      {busy && <div className="generation-progress" role="status"><span className="generation-spinner"/>Processing customers and applying available credits safely…</div>}
    </section>

    {confirmOpen && createPortal(<div className="billing-confirm-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmOpen(false) }}>
      <section
        className="billing-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="billing-confirm-title"
        aria-describedby="billing-confirm-description"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setConfirmOpen(false); return }
          if (event.key === 'Tab') {
            const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}
      >
        <div className="billing-confirm-heading">
          <span className="billing-confirm-icon"><CalendarDays size={21}/></span>
          <div><span className="eyebrow">CONFIRM BILL GENERATION</span><h2 id="billing-confirm-title">Generate monthly bills?</h2></div>
        </div>
        <p id="billing-confirm-description" className="billing-confirm-intro">You are about to generate full monthly internet subscription bills for <strong>{billingMonthLabel}</strong>.</p>
        <div className="billing-confirm-details">
          <div><CheckCircle2 size={17}/><span>Existing bills for this month will be skipped. Running it again will not create duplicate bills.</span></div>
          <div><Users size={17}/><span>Each eligible customer will receive one full-month subscription charge.</span></div>
        </div>
        <div className="billing-confirm-warning"><span className="billing-confirm-warning-mark">!</span><p>This action creates financial records and may affect customer balances.</p></div>
        <div className="billing-confirm-actions">
          <button ref={confirmCancelRef} type="button" className="secondary-button" onClick={() => setConfirmOpen(false)}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => { setConfirmOpen(false); void generate() }}><FileText size={15}/>Generate bills</button>
        </div>
      </section>
    </div>, document.body)}

    {generationFailure && <section className="panel generation-report has-errors" aria-live="polite">
      <div className="generation-report-heading"><div><h2>Generation report · {month}</h2><p>The request could not be completed, so final customer counts are unavailable.</p></div><span className="generation-result-status error">Failed</span></div>
      <div className="generation-global-error">{generationFailure}</div>
      <p className="generation-breakdown">Existing bills are never duplicated. You can safely retry this month after resolving the issue; bills that were already created will be counted as already existed.</p>
    </section>}
    {generationReport && <section className={`panel generation-report ${generationReport.errors > 0 ? 'has-errors' : generationReport.created > 0 ? 'has-success' : ''}`} aria-live="polite">
      <div className="generation-report-heading"><div><h2>Generation report · {generationReport.month}</h2><p>{reportStatus}</p></div><span className={`generation-result-status ${generationReport.errors > 0 ? 'error' : generationReport.created > 0 ? 'success' : 'neutral'}`}>{generationReport.errors > 0 ? 'Attention needed' : generationReport.created > 0 ? 'Completed' : 'No changes'}</span></div>
      <div className="generation-metrics">
        <article><strong>{generationReport.created}</strong><span>created</span></article>
        <article><strong>{generationReport.alreadyExists}</strong><span>already existed</span></article>
        <article><strong>{generationReport.skipped}</strong><span>skipped</span></article>
        <article className={generationReport.errors > 0 ? 'metric-error' : ''}><strong>{generationReport.errors}</strong><span>errors</span></article>
      </div>
      {(generationReport.skipped > 0) && <p className="generation-breakdown">Skipped: {generationReport.inactive} inactive customer(s) · {generationReport.outOfOrder} customer(s) held back to protect chronological credit allocation.</p>}
      {generationReport.errorDetails.length > 0 && <details className="generation-error-details">
        <summary>Review {generationReport.errorDetails.length} item(s) that need attention</summary>
        <div className="generation-error-list">{generationReport.errorDetails.map((item, index) => <article key={`${item.customerId}-${index}`}><div><strong>{item.customerCode} · {item.customerName}</strong><small>{item.message}</small></div></article>)}</div>
      </details>}
      {generationReport.errors === 0 && generationReport.created > 0 && <div className="generation-complete-note"><CheckCircle2 size={15}/> All bill generation tasks completed without errors.</div>}
    </section>}

    <div className="mini-stats"><div className="panel"><span>Generated bills</span><strong>{loading ? '…' : bills.length}</strong></div><div className="panel"><span>Total billed</span><strong>{loading ? '…' : bdt(total)}</strong></div><div className="panel"><span>Paid against these bills</span><strong>{loading ? '…' : bdt(paid)}</strong></div><div className="panel"><span>Remaining on these bills</span><strong>{loading ? '…' : bdt(total - paid)}</strong></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><h2>Bill register</h2><p>{month}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCw size={14}/> Refresh</button></div><div className="table-scroll"><table><thead><tr><th>Customer</th><th>Month</th><th className="numeric">Bill</th><th className="numeric">Paid</th><th className="numeric">Balance</th><th>Status</th><th>PDF</th></tr></thead><tbody>{loading ? <EmptyTable columns={7} message="Loading bills…"/> : bills.length ? bills.map(bill => <tr key={bill.id}><td><strong>{bill.customerName}</strong></td><td>{bill.billingMonth}</td><td className="numeric">{bdt(bill.amount)}</td><td className="numeric">{bdt(bill.paidAmount)}</td><td className="numeric">{bdt(bill.balance)}</td><td><Status value={bill.status}/></td><td><button className="icon-button" title="Print bill / save as PDF" onClick={() => printBill(bill)}><Download size={15}/></button></td></tr>) : <EmptyTable columns={7} message="No bills for this month. Generate bills to create monthly charges."/>}</tbody></table></div></section>
  </>
}

function PaymentsPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastReceipt, setLastReceipt] = useState<{ customerName: string; reference: string; amount: number; date: string; method: string; note: string } | null>(null)
  const [form, setForm] = useState({ customerId: '', amount: '', paymentDate: todayDhaka(), method: 'CASH', externalReference: '', note: '' })
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  async function load() {
    setLoading(true); setError('')
    try {
      const [customerResult, paymentResult] = await Promise.all([runDataOperation<{ customers: Customer[] }>('/data/customers?status=all'), runDataOperation<{ payments: Payment[] }>('/data/payments')])
      const customerRows = asArray<Customer>(customerResult?.customers)
      setCustomers(customerRows)
      setPayments(asArray<Payment>(paymentResult?.payments))
      if (!form.customerId && customerRows[0]) setForm(current => ({ ...current, customerId: customerRows[0].id }))
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load payment data.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    const customer = customers.find(item => item.id === form.customerId)
    try {
      const result = await runDataOperation<{ reference: string; duplicate?: boolean }>('/data/payments', { method: 'POST', body: { ...form, amount: Number(form.amount), idempotencyKey: idempotencyKeyRef.current } })
      const receipt = { customerName: customer?.name ?? 'Customer', reference: result.reference, amount: Number(form.amount), date: form.paymentDate, method: form.method, note: form.note }
      idempotencyKeyRef.current = crypto.randomUUID()
      setLastReceipt(receipt); setSuccess(result.duplicate ? 'This payment had already been recorded; no duplicate was created.' : `Payment recorded successfully. Reference: ${result.reference}`)
      setForm(current => ({ ...current, amount: '', externalReference: '', note: '' }))
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record payment.') }
    finally { setBusy(false) }
  }
  function printReceipt(receipt = lastReceipt) {
    if (!receipt) return
    printDocument('Payment receipt', `<h1>Payment Receipt</h1><div class="meta"><div><span>Received from</span><strong>${escapeHtml(receipt.customerName)}</strong></div><div><span>Receipt reference</span><strong>${escapeHtml(receipt.reference)}</strong></div><div><span>Payment date</span><strong>${escapeHtml(dateLabel(receipt.date))}</strong></div><div><span>Payment method</span><strong>${escapeHtml(receipt.method)}</strong></div></div><div class="total"><div><span>Amount received</span><strong>${escapeHtml(bdt(receipt.amount))}</strong></div></div><p>${escapeHtml(receipt.note || 'Thank you for your payment.')}</p>`)
  }
  async function reversePayment(payment: Payment) {
    if (payment.status !== 'COMPLETED') return
    const reason = window.prompt(`Reason for reversing ${payment.reference}:`, '')
    if (reason === null) return
    if (!reason.trim()) { setError('A reversal reason is required.'); return }
    const confirmed = window.confirm(`Reverse ${payment.reference} for ${bdt(payment.amount)}? The original payment will be retained and a reversal entry will be posted to the customer ledger.`)
    if (!confirmed) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await runDataOperation<{ reversalReference: string }>(`/data/payments/${encodeURIComponent(payment.id)}/reverse`, { method: 'POST', body: { reason } })
      setSuccess(`Payment ${payment.reference} reversed. Ledger reference: ${result.reversalReference}.`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to reverse payment.') }
    finally { setBusy(false) }
  }
  return <>
    <PageHeading eyebrow="MANUAL COLLECTION" title="Payments" description="Record cash, bKash, Nagad or bank payments and print customer receipts."/>
    <LoadError error={error}/>{success && <div className="notice notice-success"><CheckCircle2 size={16}/>{success}{lastReceipt && <button className="inline-link" onClick={() => printReceipt()}>Print receipt</button>}</div>}
    <form className="panel form-panel" onSubmit={submit}><div className="section-heading"><div><h2>Record a payment</h2><p>Each submitted payment is credited once and allocated to the oldest outstanding balance first.</p></div></div>
      <div className="form-grid">
        <label>Customer *<select required value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })}><option value="">Select customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></label>
        <label>Amount (৳) *<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="1000"/></label>
        <label>Payment date *<input type="date" required max={todayDhaka()} value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })}/></label>
        <label>Payment method *<select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}><option value="CASH">Cash</option><option value="BKASH">bKash</option><option value="NAGAD">Nagad</option><option value="BANK">Bank transfer</option><option value="OTHER">Other</option></select></label>
        <label>Transaction reference<input value={form.externalReference} onChange={e => setForm({ ...form, externalReference: e.target.value })} placeholder="Optional external reference"/></label>
        <label>Note<input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Optional payment note"/></label>
      </div><div className="form-actions"><button className="primary-button" disabled={busy || customers.length === 0}>{busy ? 'Recording…' : 'Record payment'}</button></div>
    </form>
    {lastReceipt && <div className="panel receipt-preview"><div><span className="eyebrow">LATEST RECEIPT</span><strong>{lastReceipt.reference}</strong><small>{lastReceipt.customerName} · {bdt(lastReceipt.amount)}</small></div><button className="secondary-button" onClick={() => printReceipt()}><Download size={15}/> Print / Save PDF</button></div>}
    <section className="panel table-panel"><div className="table-toolbar"><div><h2>Payment history</h2><p>{payments.length} payment(s). Reversals retain the original receipt and add a separate ledger entry.</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCw size={14}/> Refresh</button></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Customer</th><th>Reference</th><th>Method</th><th className="numeric">Amount</th><th>Status</th><th>Receipt</th><th>Action</th></tr></thead><tbody>{loading ? <EmptyTable columns={8} message="Loading payments…"/> : payments.length ? payments.map(payment => <tr key={payment.id}><td>{dateLabel(payment.paymentDate)}</td><td><strong>{payment.customerName}</strong></td><td>{payment.reference}</td><td>{payment.method}</td><td className="numeric">{bdt(payment.amount)}</td><td><Status value={payment.status}/>{payment.reversalReason && <small className="table-subtext">{payment.reversalReason}</small>}</td><td><button className="icon-button" title="Print original receipt" onClick={() => printReceipt({ customerName: payment.customerName, reference: payment.reference, amount: payment.amount, date: payment.paymentDate, method: payment.method, note: payment.note })}><Download size={15}/></button></td><td>{payment.status === 'COMPLETED' ? <button className="text-button danger-text" disabled={busy} onClick={() => void reversePayment(payment)}>Reverse</button> : '—'}</td></tr>) : <EmptyTable columns={8} message="No payments recorded yet."/>}</tbody></table></div></section>
  </>
}

function LedgerPage({ selectedCustomerId }: { selectedCustomerId: string }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState(selectedCustomerId)
  const [data, setData] = useState<LedgerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    runDataOperation<{ customers: Customer[] }>('/data/customers?status=all')
      .then(result => {
        const customerRows = asArray<Customer>(result?.customers)
        setCustomers(customerRows)
        if (!customerId && customerRows[0]) setCustomerId(customerRows[0].id)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load customers.'))
  }, [])
  useEffect(() => { if (selectedCustomerId) setCustomerId(selectedCustomerId) }, [selectedCustomerId])
  useEffect(() => {
    if (!customerId) { setData(null); return }
    setLoading(true); setError('')
    runDataOperation<LedgerData>(`/data/ledger/${encodeURIComponent(customerId)}`)
      .then(result => setData({ ...result, servicePeriods: asArray(result?.servicePeriods), ledger: asArray(result?.ledger) }))
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load ledger.'))
      .finally(() => setLoading(false))
  }, [customerId])
  function printLedger() {
    if (!data) return
    const ledgerRows = Array.isArray(data.ledger) ? data.ledger : []
    const servicePeriods = Array.isArray(data.servicePeriods) ? data.servicePeriods : []
    const rows = ledgerRows.map(row => `<tr><td>${escapeHtml(dateLabel(row.date))}</td><td>${escapeHtml(row.type.replaceAll('_', ' '))}</td><td>${escapeHtml(row.reference)}</td><td class="numeric">${escapeHtml(row.debit ? bdt(row.debit) : '—')}</td><td class="numeric">${escapeHtml(row.credit ? bdt(row.credit) : '—')}</td><td class="numeric">${escapeHtml(bdt(row.balance))}</td></tr>`).join('')
    const periods = servicePeriods.map(period => `${dateLabel(period.joinDate)} – ${period.leaveDate ? dateLabel(period.leaveDate) : 'Current'}`).join('<br>')
    printDocument('Customer ledger', `<h1>Customer Ledger</h1><div class="meta"><div><span>Customer</span><strong>${escapeHtml(data.customer.name)}</strong></div><div><span>Phone</span><strong>${escapeHtml(data.customer.phone || '—')}</strong></div><div><span>Service period(s)</span><strong>${periods || '—'}</strong></div><div><span>Current balance</span><strong>${escapeHtml(bdt(data.summary.balance))}</strong></div></div><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th class="numeric">Debit</th><th class="numeric">Credit</th><th class="numeric">Balance</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No ledger entries.</td></tr>'}</tbody></table><div class="total"><div><span>Total debit</span><strong>${escapeHtml(bdt(data.summary.totalDebit))}</strong></div><div><span>Total credit</span><strong>${escapeHtml(bdt(data.summary.totalCredit))}</strong></div><div><span>Balance</span><strong>${escapeHtml(bdt(data.summary.balance))}</strong></div></div>`)
  }
  const ledgerRows = asArray<LedgerRow>(data?.ledger)
  const servicePeriodRows = asArray<LedgerData['servicePeriods'][number]>(data?.servicePeriods)
  return <>
    <PageHeading eyebrow="CUSTOMER ACCOUNTING" title="Customer Ledger" description="A chronological statement of opening balance, monthly charges, payments and running balance." action={<button className="secondary-button" disabled={!data} onClick={printLedger}><Download size={15}/> Print / Save PDF</button>}/>
    <LoadError error={error}/>
    <section className="panel filter-panel"><label>Choose customer<select value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Select customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></label>{data && <div className="filter-note"><span><strong>{data.customer.name}</strong><small>{data.customer.phone || 'No phone'} · {data.customer.status}</small></span><span><strong>{servicePeriodRows.map(p => `${dateLabel(p.joinDate)} – ${p.leaveDate ? dateLabel(p.leaveDate) : 'Now'}`).join(' | ')}</strong><small>Service period history</small></span></div>}</section>
    {data && <div className="mini-stats"><div className="panel"><span>Total debit</span><strong>{bdt(data.summary.totalDebit)}</strong></div><div className="panel"><span>Total credit</span><strong>{bdt(data.summary.totalCredit)}</strong></div><div className="panel"><span>Outstanding</span><strong className="money-due">{bdt(data.summary.outstanding)}</strong></div><div className="panel"><span>Advance credit</span><strong className="money-credit">{bdt(data.summary.advanceCredit)}</strong></div></div>}
    <section className="panel table-panel"><div className="table-toolbar"><div><h2>Account statement</h2><p>Date · Type · Reference · Debit · Credit · Balance</p></div>{loading && <span className="muted-label">Loading…</span>}</div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="numeric">Debit</th><th className="numeric">Credit</th><th className="numeric">Balance</th></tr></thead><tbody>{loading ? <EmptyTable columns={6} message="Loading ledger…"/> : !customerId ? <EmptyTable columns={6} message="Select a customer to view the ledger."/> : ledgerRows.length ? ledgerRows.map(row => <tr key={row.id}><td>{dateLabel(row.date)}</td><td>{row.type.replaceAll('_', ' ')}</td><td>{row.reference || '—'}</td><td className="numeric">{row.debit ? bdt(row.debit) : '—'}</td><td className="numeric">{row.credit ? bdt(row.credit) : '—'}</td><td className="numeric"><strong>{bdt(row.balance)}</strong></td></tr>) : <EmptyTable columns={6} message="No financial entries recorded for this customer yet."/>}</tbody></table></div></section>
  </>
}

function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  async function load() { setLoading(true); setError(''); try { const result = await runDataOperation<{ transactions: Transaction[] }>('/data/transactions'); setTransactions(asArray<Transaction>(result?.transactions)) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load transactions.') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const filtered = transactions.filter(t => `${t.customerName} ${t.reference} ${t.type} ${t.description}`.toLowerCase().includes(query.toLowerCase()))
  return <><PageHeading eyebrow="FINANCIAL RECORDS" title="Transactions" description="Review every posted debit and credit entry across all customer accounts." action={<button className="secondary-button" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button>}/><LoadError error={error}/><section className="panel table-panel"><div className="table-toolbar"><div><h2>Transaction register</h2><p>{transactions.length} ledger entry/entries</p></div><label className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customer or reference"/></label></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Reference</th><th className="numeric">Debit</th><th className="numeric">Credit</th><th>Description</th></tr></thead><tbody>{loading ? <EmptyTable columns={7} message="Loading transactions…"/> : filtered.length ? filtered.map(t => <tr key={t.id}><td>{dateLabel(t.date)}</td><td><strong>{t.customerName}</strong></td><td>{t.type.replaceAll('_', ' ')}</td><td>{t.reference}</td><td className="numeric">{t.debit ? bdt(t.debit) : '—'}</td><td className="numeric">{t.credit ? bdt(t.credit) : '—'}</td><td>{t.description}</td></tr>) : <EmptyTable columns={7} message="No matching transactions."/>}</tbody></table></div></section></>
}

type ReportData = { collection: number; billTotal: number; paymentCount: number; billCount: number; outstandingTotal: number; outstandingCustomers: { customerId: string; customerName: string; amount: number }[]; customerCount: number; activeCustomers: number }

function ReportsPage() {
  const [month, setMonth] = useState(monthDhaka())
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setLoading(true); setError(''); runDataOperation<ReportData>(`/data/reports?month=${month}`).then(result => setReport({ ...result, outstandingCustomers: asArray(result?.outstandingCustomers) })).catch(e => setError(e instanceof Error ? e.message : 'Unable to load report.')).finally(() => setLoading(false)) }, [month])
  const outstandingCustomers = asArray<ReportData['outstandingCustomers'][number]>(report?.outstandingCustomers)
  function printReport() {
    if (!report) return
    const rows = outstandingCustomers.map(customer => `<tr><td>${escapeHtml(customer.customerName)}</td><td class="numeric">${escapeHtml(bdt(customer.amount))}</td></tr>`).join('')
    printDocument(`Monthly report · ${month}`, `<h1>Monthly Billing & Collection Report</h1><p>Reporting month: ${escapeHtml(month)}</p><div class="meta"><div><span>Total billed</span><strong>${escapeHtml(bdt(report.billTotal))}</strong></div><div><span>Net collection after reversals</span><strong>${escapeHtml(bdt(report.collection))}</strong></div><div><span>Current outstanding</span><strong>${escapeHtml(bdt(report.outstandingTotal))}</strong></div><div><span>Active customers</span><strong>${escapeHtml(report.activeCustomers)} / ${escapeHtml(report.customerCount)}</strong></div></div><h2>Customers with outstanding balances</h2><table><thead><tr><th>Customer</th><th class="numeric">Outstanding</th></tr></thead><tbody>${rows || '<tr><td colspan="2">No outstanding balances.</td></tr>'}</tbody></table>`)
  }
  return <><PageHeading eyebrow="BUSINESS OVERVIEW" title="Reports" description="Monthly billing and collection performance, plus current customer outstanding balances." action={<button className="secondary-button" disabled={!report || loading} onClick={printReport}><Download size={15}/> Print / Save PDF</button>}/><LoadError error={error}/><section className="panel filter-panel"><label>Report month<input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label><div className="filter-note">Reports use posted ledger and payment records.</div></section>
    <div className="mini-stats"><div className="panel"><span>Monthly bills</span><strong>{loading ? '…' : bdt(report?.billTotal ?? 0)}</strong></div><div className="panel"><span>Monthly collection</span><strong>{loading ? '…' : bdt(report?.collection ?? 0)}</strong></div><div className="panel"><span>Total outstanding</span><strong className="money-due">{loading ? '…' : bdt(report?.outstandingTotal ?? 0)}</strong></div><div className="panel"><span>Active customers</span><strong>{loading ? '…' : `${report?.activeCustomers ?? 0} / ${report?.customerCount ?? 0}`}</strong></div></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><h2>Customers with outstanding balances</h2><p>Positive balances are customer dues. Advance credits are excluded.</p></div></div><div className="table-scroll"><table><thead><tr><th>Customer</th><th className="numeric">Outstanding</th></tr></thead><tbody>{loading ? <EmptyTable columns={2} message="Loading report…"/> : outstandingCustomers.length ? outstandingCustomers.map(c => <tr key={c.customerId}><td>{c.customerName}</td><td className="numeric money-due">{bdt(c.amount)}</td></tr>) : <EmptyTable columns={2} message="No outstanding balances."/>}</tbody></table></div></section>
  </>
}

function ActivityPage() {
  const [activities, setActivities] = useState<{ id: string; description: string; action: string; actorEmail: string; createdAt: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { runDataOperation<{ activities: typeof activities }>('/data/activity').then(result => setActivities(asArray(result?.activities))).catch(e => setError(e instanceof Error ? e.message : 'Unable to load activity history.')).finally(() => setLoading(false)) }, [])
  return <><PageHeading eyebrow="ADMINISTRATOR AUDIT" title="Activity History" description="An audit trail of customer, billing and payment operations."/><LoadError error={error}/><section className="panel table-panel"><div className="table-toolbar"><div><h2>Recent administrator activity</h2><p>Newest actions appear first.</p></div></div><div className="table-scroll"><table><thead><tr><th>Date & time</th><th>Action</th><th>Description</th><th>Administrator</th></tr></thead><tbody>{loading ? <EmptyTable columns={4} message="Loading activity…"/> : activities.length ? activities.map(item => <tr key={item.id}><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</td><td>{item.action?.replaceAll('_', ' ')}</td><td>{item.description}</td><td>{item.actorEmail || 'Admin'}</td></tr>) : <EmptyTable columns={4} message="No audit activity recorded yet."/>}</tbody></table></div></section></>
}

function SettingsPage() {
  return <><PageHeading eyebrow="WORKSPACE CONFIGURATION" title="Settings" description="The business and accounting rules currently applied to ALI AL-FATEEH."/><div className="settings-grid"><section className="panel"><div className="panel-heading"><div><h2>Billing policy</h2><p>Applied by the monthly bill generator.</p></div><CalendarDays size={18} className="panel-mark"/></div><div className="settings-value"><strong>Full monthly charge</strong><small>Customers active for any part of a calendar month receive the full subscription charge. No daily proration.</small></div></section><section className="panel"><div className="panel-heading"><div><h2>Financial calculation</h2><p>Consistent across bills and ledgers.</p></div><CircleDollarSign size={18} className="panel-mark"/></div><div className="settings-value"><strong>BDT · Integer poisha</strong><small>Amounts are stored as integer poisha. Customer balance = total debit − total credit.</small></div></section><section className="panel"><div className="panel-heading"><div><h2>Payments</h2><p>Manual collection only.</p></div><Wallet size={18} className="panel-mark"/></div><div className="settings-value"><strong>Cash · bKash · Nagad · Bank</strong><small>Partial and advance payments are supported. Payments are recorded once and allocated oldest-first.</small></div></section><section className="panel"><div className="panel-heading"><div><h2>Service history</h2><p>Customer lifecycle.</p></div><Users size={18} className="panel-mark"/></div><div className="settings-value"><strong>Permanent customer identity</strong><small>Leaving a customer ends the active service period. Rejoining starts a new service period without replacing the customer record.</small></div></section></div>
    <div className="notice notice-info"><CheckCircle2 size={16}/> Financial records are stored in your owner-scoped Firestore workspace. Firebase Security Rules prevent other accounts from accessing your records.</div>
  </>
}
