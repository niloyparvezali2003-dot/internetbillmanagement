import type { User } from 'firebase/auth'
import {
  collection, doc, getDoc, getDocs, query, where, runTransaction, setDoc,
  serverTimestamp, type DocumentData, type DocumentReference, type DocumentSnapshot, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getCurrentActorUid, getFirebaseServices } from './client'

// This compatibility layer keeps the existing UI calls stable while moving all
// application data operations to the Firebase Web SDK, like the POS reference.
type Body = Record<string, unknown>
type PaymentAllocation = { targetType: 'OPENING_BALANCE' | 'BILL'; targetId: string; amountPoisha: number }
type AllocationTarget = {
  targetType: 'OPENING_BALANCE' | 'BILL'; targetId: string; duePoisha: number; effectiveDate: string
  billDoc?: DocumentSnapshot<DocumentData>; isCurrentBill?: boolean
}
type CreditSource =
  | { sourceType: 'OPENING_ADVANCE'; effectiveDate: string; remaining: number }
  | { sourceType: 'PAYMENT'; effectiveDate: string; remaining: number; paymentDoc: DocumentSnapshot<DocumentData> }

function uid() { return getCurrentActorUid() }
function ownerCol(owner: string, name: string) { return collection(getFirebaseServices().db, 'users', owner, name) }
function ownerDoc(owner: string, name: string, id: string) { return doc(getFirebaseServices().db, 'users', owner, name, id) }
function customerDoc(owner: string, id: string) { return ownerDoc(owner, 'customers', id) }
function customerSubcol(owner: string, id: string, name: string) { return collection(getFirebaseServices().db, 'users', owner, 'customers', id, name) }
function customerSubdoc(owner: string, id: string, name: string, childId: string) { return doc(getFirebaseServices().db, 'users', owner, 'customers', id, name, childId) }
function asIso(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') return (value.toDate as () => Date)().toISOString()
  return null
}
function asNumber(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0 }
function textValue(value: unknown, field: string, max = 200, required = true) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (required && !result) throw new Error(`${field} is required.`)
  if (result.length > max) throw new Error(`${field} must be ${max} characters or fewer.`)
  return result
}
function dateValue(value: unknown, field: string, optional = false): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result && optional) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${field} must be a valid date in YYYY-MM-DD format.`)
  const date = new Date(`${result}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result) throw new Error(`${field} is not a valid calendar date.`)
  return result
}
function monthValue(value: unknown, field = 'Billing month'): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result)) throw new Error(`${field} must use YYYY-MM format.`)
  return result
}
function moneyToPoisha(value: unknown, field: string, allowZero = true): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0) || amount > 1_000_000_000) throw new Error(`${field} must be a valid ${allowZero ? 'non-negative' : 'positive'} amount in BDT.`)
  const poisha = Math.round((amount + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(poisha)) throw new Error(`${field} is too large.`)
  return poisha
}
function monthStart(month: string) { return `${month}-01` }
function monthEnd(month: string) {
  const [year, m] = month.split('-').map(Number)
  return `${year}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, '0')}`
}
function dhakaToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
function dhakaMonth() { return dhakaToday().slice(0, 7) }
function dateOverlapsMonth(joinDate: string, leaveDate: string | null | undefined, month: string) { return joinDate <= monthEnd(month) && (!leaveDate || leaveDate >= monthStart(month)) }
async function appendAudit(owner: string, action: string, entityType: string, entityId: string, description: string, metadata: Record<string, unknown> = {}) {
  try {
    const ref = doc(ownerCol(owner, 'auditLogs'))
    await setDoc(ref, { action, entityType, entityId, description, metadata, actorUid: owner, actorEmail: getFirebaseServices().auth.currentUser?.email ?? null, createdAt: serverTimestamp() })
  } catch (error) {
    // The business operation has already committed; a separate audit failure must not make it appear unsuccessful.
    console.error('Audit log append failed:', error)
  }
}

async function getCustomerView(owner: string, id: string) {
  const ref = customerDoc(owner, id)
  const [snap, periodsSnap, ratesSnap] = await Promise.all([
    getDoc(ref), getDocs(customerSubcol(owner, id, 'servicePeriods')), getDocs(customerSubcol(owner, id, 'rates')),
  ])
  if (!snap.exists()) return null
  const data = snap.data()
  const currentMonth = dhakaMonth()
  const latestRate = ratesSnap.docs
    .filter(item => String(item.data().effectiveMonth ?? item.id) <= currentMonth)
    .sort((a, b) => String(b.data().effectiveMonth ?? b.id).localeCompare(String(a.data().effectiveMonth ?? a.id)))[0]
  const monthlyAmountPoisha = asNumber(latestRate?.data().amountPoisha ?? data.monthlyAmountPoisha)
  const periods = periodsSnap.docs.map(item => ({
    id: item.id, joinDate: String(item.data().joinDate ?? ''), leaveDate: (item.data().leaveDate as string | null) ?? null,
    status: String(item.data().status ?? ''), createdAt: asIso(item.data().createdAt),
  })).sort((a, b) => a.joinDate.localeCompare(b.joinDate))
  return {
    id: snap.id, customerCode: String(data.customerCode ?? snap.id), name: String(data.name ?? ''), phone: String(data.phone ?? ''), address: String(data.address ?? ''),
    status: String(data.status ?? 'INACTIVE'), monthlyAmountPoisha, monthlyAmount: monthlyAmountPoisha / 100,
    creditBalancePoisha: asNumber(data.creditBalancePoisha), creditBalance: asNumber(data.creditBalancePoisha) / 100,
    openingBalancePoisha: asNumber(data.openingBalancePoisha), openingBalance: asNumber(data.openingBalancePoisha) / 100,
    openingBalanceType: String(data.openingBalanceType ?? 'none'), openingBalanceDate: (data.openingBalanceDate as string | null) ?? null,
    createdAt: asIso(data.createdAt), updatedAt: asIso(data.updatedAt), servicePeriods: periods,
    joinDate: periods[0]?.joinDate ?? null, leaveDate: periods.at(-1)?.leaveDate ?? null,
  }
}
async function listCustomers(owner: string, status: string) {
  const [customersSnap, entriesSnap] = await Promise.all([getDocs(ownerCol(owner, 'customers')), getDocs(ownerCol(owner, 'ledgerEntries'))])
  const balances = new Map<string, number>()
  for (const entry of entriesSnap.docs) {
    const customerId = String(entry.data().customerId ?? '')
    balances.set(customerId, (balances.get(customerId) ?? 0) + asNumber(entry.data().debitPoisha) - asNumber(entry.data().creditPoisha))
  }
  const views = await Promise.all(customersSnap.docs.map(item => getCustomerView(owner, item.id)))
  return views.filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map(item => ({ ...item, currentBalancePoisha: balances.get(item.id) ?? 0, currentBalance: (balances.get(item.id) ?? 0) / 100 }))
    .filter(item => status === 'all' || item.status === status).sort((a, b) => a.name.localeCompare(b.name))
}

async function createCustomer(owner: string, body: Body) {
  const name = textValue(body.name, 'Customer name', 120)
  const phone = textValue(body.phone, 'Phone number', 30, false)
  const address = textValue(body.address, 'Address', 300, false)
  const joinDate = dateValue(body.joinDate, 'Joining date')
  const monthlyAmountPoisha = moneyToPoisha(body.monthlyAmount, 'Monthly subscription', false)
  const openingAmountPoisha = moneyToPoisha(body.openingBalanceAmount ?? 0, 'Opening balance')
  const openingType = openingAmountPoisha === 0 ? 'none' : textValue(body.openingBalanceType, 'Opening balance type', 20)
  if (!['none', 'due', 'advance'].includes(openingType)) throw new Error('Opening balance type must be Due or Advance.')
  const openingDate = openingAmountPoisha > 0 ? dateValue(body.openingBalanceDate || joinDate, 'Opening balance date') : null
  const openingDescription = textValue(body.openingBalanceDescription, 'Opening balance description', 300, false)
  const db = getFirebaseServices().db
  const customerRef = doc(ownerCol(owner, 'customers'))
  const periodRef = doc(customerSubcol(owner, customerRef.id, 'servicePeriods'))
  const rateRef = customerSubdoc(owner, customerRef.id, 'rates', joinDate.slice(0, 7))
  const openingRef = ownerDoc(owner, 'ledgerEntries', `${customerRef.id}_OPENING`)
  const counterRef = ownerDoc(owner, 'systemCounters', 'customer')
  await runTransaction(db, async tx => {
    const counterSnap = await tx.get(counterRef)
    const next = asNumber(counterSnap.data()?.nextValue) || 1
    const customerCode = `C${String(next).padStart(6, '0')}`
    const initialCredit = openingType === 'advance' ? openingAmountPoisha : 0
    tx.set(counterRef, { nextValue: next + 1, updatedAt: serverTimestamp() }, { merge: true })
    tx.set(customerRef, {
      customerCode, name, phone, address, status: 'ACTIVE', monthlyAmountPoisha,
      openingBalancePoisha: openingType === 'due' ? openingAmountPoisha : openingType === 'advance' ? -openingAmountPoisha : 0,
      openingBalanceType: openingType, openingBalanceDate: openingDate, openingBalanceDescription: openingDescription,
      openingBalanceRemainingPoisha: openingType === 'due' ? openingAmountPoisha : 0,
      openingAdvanceRemainingPoisha: initialCredit, creditBalancePoisha: initialCredit,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: owner, updatedBy: owner,
    })
    tx.set(periodRef, { joinDate, leaveDate: null, status: 'ACTIVE', createdAt: serverTimestamp(), createdBy: owner })
    tx.set(rateRef, { effectiveMonth: joinDate.slice(0, 7), amountPoisha: monthlyAmountPoisha, createdAt: serverTimestamp(), createdBy: owner, note: 'Initial subscription rate' })
    if (openingAmountPoisha > 0) tx.set(openingRef, {
      customerId: customerRef.id, customerName: name, type: 'OPENING_BALANCE', entryDate: openingDate,
      reference: 'OPENING', description: openingDescription || 'Previous account balance',
      debitPoisha: openingType === 'due' ? openingAmountPoisha : 0,
      creditPoisha: openingType === 'advance' ? openingAmountPoisha : 0,
      actorUid: owner, createdAt: serverTimestamp(),
    })
  })
  await appendAudit(owner, 'CUSTOMER_CREATED', 'CUSTOMER', customerRef.id, `Created customer ${name}.`, { openingBalanceType: openingType, openingAmountPoisha })
  return { customer: await getCustomerView(owner, customerRef.id) }
}

async function getCustomerRates(owner: string, id: string) {
  const snap = await getDocs(customerSubcol(owner, id, 'rates'))
  return { rates: snap.docs.map(item => ({ id: item.id, effectiveMonth: String(item.data().effectiveMonth ?? item.id), amount: asNumber(item.data().amountPoisha) / 100, note: typeof item.data().note === 'string' ? item.data().note : '' })).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth)) }
}
async function addCustomerRate(owner: string, id: string, body: Body) {
  const effectiveMonth = monthValue(body.effectiveMonth, 'Effective month')
  const amountPoisha = moneyToPoisha(body.monthlyAmount, 'Monthly subscription', false)
  const note = textValue(body.note, 'Rate change note', 300, false)
  const db = getFirebaseServices().db
  const customerRef = customerDoc(owner, id)
  const rateRef = customerSubdoc(owner, id, 'rates', effectiveMonth)
  await runTransaction(db, async tx => {
    const [customerSnap, existing] = await Promise.all([tx.get(customerRef), tx.get(rateRef)])
    if (!customerSnap.exists()) throw new Error('Customer not found.')
    if (existing.exists()) throw new Error('A subscription rate is already recorded for this effective month.')
    tx.set(rateRef, { effectiveMonth, amountPoisha, note, createdAt: serverTimestamp(), createdBy: owner })
    tx.update(customerRef, { ...(effectiveMonth <= dhakaMonth() ? { monthlyAmountPoisha: amountPoisha } : {}), updatedAt: serverTimestamp(), updatedBy: owner })
  })
  await appendAudit(owner, 'RATE_CHANGED', 'CUSTOMER', id, 'Added a subscription rate.', { effectiveMonth, amountPoisha, note })
  return { success: true }
}
async function updateCustomer(owner: string, id: string, body: Body) {
  const ref = customerDoc(owner, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Customer not found.')
  const name = textValue(body.name ?? snap.data().name, 'Customer name', 120)
  const phone = textValue(body.phone ?? snap.data().phone, 'Phone number', 30, false)
  const address = textValue(body.address ?? snap.data().address, 'Address', 300, false)
  await runTransaction(getFirebaseServices().db, tx => {
    tx.update(ref, { name, phone, address, updatedAt: serverTimestamp(), updatedBy: owner })
  })
  await appendAudit(owner, 'CUSTOMER_UPDATED', 'CUSTOMER', id, `Updated customer ${name}.`)
  return { customer: await getCustomerView(owner, id) }
}
async function customerService(owner: string, id: string, body: Body, operation: 'leave' | 'restart') {
  const db = getFirebaseServices().db
  const ref = customerDoc(owner, id)
  const periodsRef = customerSubcol(owner, id, 'servicePeriods')
  const existingPeriods = await getDocs(periodsRef)
  const periodRefs = existingPeriods.docs.map(item => customerSubdoc(owner, id, 'servicePeriods', item.id))
  const date = dateValue(operation === 'leave' ? body.leaveDate : body.joinDate, operation === 'leave' ? 'Leaving date' : 'Joining date')
  await runTransaction(db, async tx => {
    // The Firebase Web SDK only supports DocumentReference reads in transactions.
    // Read collection contents first, then re-read every known document in the transaction.
    const [customerSnap, ...periodSnapshots] = await Promise.all([tx.get(ref), ...periodRefs.map(periodRef => tx.get(periodRef))])
    if (!customerSnap.exists()) throw new Error('Customer not found.')
    const periods = periodSnapshots.filter(item => item.exists())
    if (operation === 'leave') {
      const active = periods.find(item => item.data()?.status === 'ACTIVE' && !item.data()?.leaveDate)
      if (!active) throw new Error('Customer has no active service period.')
      if (date < String(active.data()?.joinDate ?? '')) throw new Error('Leaving date cannot be before joining date.')
      tx.update(customerSubdoc(owner, id, 'servicePeriods', active.id), { leaveDate: date, status: 'ENDED', endedAt: serverTimestamp(), endedBy: owner })
      tx.update(ref, { status: 'INACTIVE', updatedAt: serverTimestamp(), updatedBy: owner })
    } else {
      if (periods.some(item => item.data()?.status === 'ACTIVE' && !item.data()?.leaveDate)) throw new Error('Customer already has an active service period.')
      if (periods.some(item => typeof item.data()?.leaveDate === 'string' && date <= String(item.data()?.leaveDate))) throw new Error('New joining date must be after the previous leaving date.')
      const periodRef = doc(periodsRef)
      tx.set(periodRef, { joinDate: date, leaveDate: null, status: 'ACTIVE', createdAt: serverTimestamp(), createdBy: owner })
      tx.update(ref, { status: 'ACTIVE', updatedAt: serverTimestamp(), updatedBy: owner })
    }
  })
  const action = operation === 'leave' ? 'SERVICE_ENDED' : 'SERVICE_RESTARTED'
  await appendAudit(owner, action, 'CUSTOMER', id, operation === 'leave' ? 'Ended customer service.' : 'Started a new customer service period.', { [operation === 'leave' ? 'leaveDate' : 'joinDate']: date })
  return { success: true }
}

async function listBills(owner: string, selectedMonth = '') {
  const [billsSnap, customersSnap, entriesSnap] = await Promise.all([
    getDocs(ownerCol(owner, 'bills')), getDocs(ownerCol(owner, 'customers')), getDocs(ownerCol(owner, 'ledgerEntries')),
  ])
  const entriesByCustomer = new Map<string, { date: string; type: string; debit: number; credit: number }[]>()
  for (const entry of entriesSnap.docs) {
    const customerId = String(entry.data().customerId ?? '')
    const list = entriesByCustomer.get(customerId) ?? []
    list.push({ date: String(entry.data().entryDate ?? ''), type: String(entry.data().type ?? ''), debit: asNumber(entry.data().debitPoisha), credit: asNumber(entry.data().creditPoisha) })
    entriesByCustomer.set(customerId, list)
  }
  const customerNames = new Map(customersSnap.docs.map(item => [item.id, String(item.data().name ?? '')]))
  const bills = billsSnap.docs.map(item => {
    const data = item.data()
    const billingMonth = String(data.billingMonth ?? '')
    const start = monthStart(billingMonth)
    const end = monthEnd(billingMonth)
    const entries = entriesByCustomer.get(String(data.customerId)) ?? []
    const previous = entries.filter(entry => entry.date < start).reduce((sum, entry) => sum + entry.debit - entry.credit, 0)
    const openingThisMonth = entries.filter(entry => entry.type === 'OPENING_BALANCE' && entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + entry.debit - entry.credit, 0)
    const paymentsThisMonth = entries.filter(entry => entry.type === 'PAYMENT' && entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + entry.credit, 0)
    const reversalsThisMonth = entries.filter(entry => entry.type === 'PAYMENT_REVERSAL' && entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + entry.debit, 0)
    const amountPoisha = asNumber(data.amountPoisha)
    const paidAmountPoisha = asNumber(data.paidAmountPoisha)
    const balanceAtMonthEnd = entries.filter(entry => entry.date && entry.date <= end).reduce((sum, entry) => sum + entry.debit - entry.credit, 0)
    return {
      id: item.id, customerId: data.customerId, customerName: customerNames.get(String(data.customerId)) ?? 'Unknown customer',
      billingMonth, amountPoisha, amount: amountPoisha / 100, paidAmountPoisha, paidAmount: paidAmountPoisha / 100,
      balance: (amountPoisha - paidAmountPoisha) / 100, previousBalance: previous / 100,
      openingBalanceThisMonth: openingThisMonth / 100, paymentsThisMonth: paymentsThisMonth / 100,
      paymentReversalsThisMonth: reversalsThisMonth / 100, amountPayable: Math.max(0, balanceAtMonthEnd) / 100,
      advanceCredit: Math.max(0, -balanceAtMonthEnd) / 100, status: data.status, createdAt: asIso(data.createdAt),
    }
  }).filter(item => !selectedMonth || item.billingMonth === selectedMonth)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth) || a.customerName.localeCompare(b.customerName))
  return { bills }
}

async function generateBills(owner: string, body: Body) {
  const month = monthValue(body.month)
  const db = getFirebaseServices().db
  const customersSnap = await getDocs(ownerCol(owner, 'customers'))
  let created = 0, alreadyExists = 0, inactive = 0, outOfOrder = 0
  const errorDetails: { customerId: string; customerCode: string; customerName: string; message: string }[] = []
  const selectedMonthEnd = monthEnd(month)

  const processCustomer = async (customerSnapshot: QueryDocumentSnapshot<DocumentData>) => {
    const customerId = customerSnapshot.id
    const customerRef = customerDoc(owner, customerId)
    const billRef = ownerDoc(owner, 'bills', `${customerId}_${month}`)
    try {
      // Firestore's browser SDK does not allow tx.get() on Query/CollectionReference.
      // Fetch the query result sets, then re-read each known document by its explicit
      // owner-scoped DocumentReference inside the transaction.
      const [periodsQuerySnap, ratesQuerySnap, existingBillsQuerySnap, paymentsQuerySnap] = await Promise.all([
        getDocs(customerSubcol(owner, customerId, 'servicePeriods')),
        getDocs(customerSubcol(owner, customerId, 'rates')),
        getDocs(query(ownerCol(owner, 'bills'), where('customerId', '==', customerId))),
        getDocs(query(ownerCol(owner, 'payments'), where('customerId', '==', customerId))),
      ])
      const periodRefs = periodsQuerySnap.docs.map(item => customerSubdoc(owner, customerId, 'servicePeriods', item.id))
      const rateRefs = ratesQuerySnap.docs.map(item => customerSubdoc(owner, customerId, 'rates', item.id))
      const existingBillRefs = existingBillsQuerySnap.docs.map(item => ownerDoc(owner, 'bills', item.id))
      const paymentRefs = paymentsQuerySnap.docs.map(item => ownerDoc(owner, 'payments', item.id))

      return await runTransaction(db, async tx => {
      const transactionReads = await Promise.all([
        tx.get(customerRef), tx.get(billRef),
        ...periodRefs.map(ref => tx.get(ref)),
        ...rateRefs.map(ref => tx.get(ref)),
        ...existingBillRefs.map(ref => tx.get(ref)),
        ...paymentRefs.map(ref => tx.get(ref)),
      ])
      let readIndex = 0
      const customerSnap = transactionReads[readIndex++]
      const billSnap = transactionReads[readIndex++]
      const periodsSnap = transactionReads.slice(readIndex, readIndex + periodRefs.length); readIndex += periodRefs.length
      const ratesSnap = transactionReads.slice(readIndex, readIndex + rateRefs.length); readIndex += rateRefs.length
      const existingBillsSnap = transactionReads.slice(readIndex, readIndex + existingBillRefs.length); readIndex += existingBillRefs.length
      const paymentsSnap = transactionReads.slice(readIndex, readIndex + paymentRefs.length)
      if (!customerSnap.exists()) return 'inactive' as const
      if (billSnap.exists()) return 'skipped' as const
      const activePeriod = periodsSnap.find(item => item.exists() && dateOverlapsMonth(String(item.data()?.joinDate ?? ''), (item.data()?.leaveDate as string | null) ?? null, month))
      if (!activePeriod) return 'inactive' as const
      const existingBillDocs = existingBillsSnap.filter(item => item.exists())
      const paymentDocs = paymentsSnap.filter(item => item.exists())
      const rateDocs = ratesSnap.filter(item => item.exists())
      if (existingBillDocs.some(item => String(item.data()?.billingMonth ?? '') > month)) return 'outOfOrder' as const

      const matchingRates = rateDocs.filter(item => String(item.data()?.effectiveMonth ?? item.id) <= month)
        .sort((a, b) => String(b.data()?.effectiveMonth ?? b.id).localeCompare(String(a.data()?.effectiveMonth ?? a.id)))
      const customerData = customerSnap.data() ?? {}
      const amountPoisha = asNumber(matchingRates[0]?.data()?.amountPoisha ?? customerData.monthlyAmountPoisha)
      if (!Number.isSafeInteger(amountPoisha) || amountPoisha <= 0) throw new Error(`Customer ${customerId} has no valid monthly subscription amount.`)

      const currentCredit = Math.max(0, asNumber(customerData.creditBalancePoisha))
      const openingDueRemaining = Math.max(0, asNumber(customerData.openingBalanceRemainingPoisha))
      const openingDate = String(customerData.openingBalanceDate ?? '')
      const openingType = String(customerData.openingBalanceType ?? 'none')
      const openingAdvanceRemaining = Math.max(0, asNumber(customerData.openingAdvanceRemainingPoisha ?? (openingType === 'advance' ? Math.abs(asNumber(customerData.openingBalancePoisha)) : 0)))
      const eligibleOpeningAdvance = openingType === 'advance' && openingDate && openingDate <= selectedMonthEnd ? Math.min(openingAdvanceRemaining, currentCredit) : 0
      const paymentCreditPoolPoisha = Math.max(0, currentCredit - openingAdvanceRemaining)
      const paymentCreditDocs = paymentDocs.filter(item => item.data()?.status === 'COMPLETED' && String(item.data()?.paymentDate ?? '') <= selectedMonthEnd && asNumber(item.data()?.unallocatedCreditPoisha) > 0)
        .sort((a, b) => String(a.data()?.paymentDate ?? '').localeCompare(String(b.data()?.paymentDate ?? '')) || a.id.localeCompare(b.id))
      const creditSources: CreditSource[] = []
      if (eligibleOpeningAdvance > 0) creditSources.push({ sourceType: 'OPENING_ADVANCE', effectiveDate: openingDate, remaining: eligibleOpeningAdvance })
      for (const paymentDoc of paymentCreditDocs) {
        const paymentData = paymentDoc.data() ?? {}
        const availablePool = paymentCreditPoolPoisha - creditSources.filter(source => source.sourceType === 'PAYMENT').reduce((sum, source) => sum + source.remaining, 0)
        const eligibleAmount = Math.min(Math.max(0, asNumber(paymentData.unallocatedCreditPoisha)), Math.max(0, availablePool))
        if (eligibleAmount > 0) creditSources.push({ sourceType: 'PAYMENT', effectiveDate: String(paymentData.paymentDate ?? ''), remaining: eligibleAmount, paymentDoc })
      }
      creditSources.sort((a, b) => {
        const dateOrder = a.effectiveDate.localeCompare(b.effectiveDate)
        if (dateOrder) return dateOrder
        if (a.sourceType !== b.sourceType) return a.sourceType === 'OPENING_ADVANCE' ? -1 : 1
        return a.sourceType === 'PAYMENT' && b.sourceType === 'PAYMENT' ? a.paymentDoc.id.localeCompare(b.paymentDoc.id) : 0
      })

      const targets: AllocationTarget[] = []
      if (openingType === 'due' && openingDate && openingDate <= selectedMonthEnd && openingDueRemaining > 0) targets.push({ targetType: 'OPENING_BALANCE', targetId: `${customerId}_OPENING`, duePoisha: openingDueRemaining, effectiveDate: openingDate })
      const olderBills = existingBillDocs.filter(item => String(item.data()?.billingMonth ?? '') < month).sort((a, b) => String(a.data()?.billingMonth ?? '').localeCompare(String(b.data()?.billingMonth ?? '')))
      for (const olderBill of olderBills) {
        const olderBillData = olderBill.data() ?? {}
        const total = asNumber(olderBillData.amountPoisha)
        const paid = asNumber(olderBillData.paidAmountPoisha)
        const due = Math.max(0, total - paid)
        if (due > 0) targets.push({ targetType: 'BILL', targetId: olderBill.id, duePoisha: due, effectiveDate: monthStart(String(olderBillData.billingMonth ?? '')), billDoc: olderBill })
      }
      targets.push({ targetType: 'BILL', targetId: billRef.id, duePoisha: amountPoisha, effectiveDate: monthStart(month), isCurrentBill: true })
      targets.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || (a.targetType !== b.targetType ? (a.targetType === 'OPENING_BALANCE' ? -1 : 1) : a.targetId.localeCompare(b.targetId)))

      const paymentUpdates = new Map<string, { allocations: PaymentAllocation[]; unallocated: number }>()
      let openingAdvanceAppliedTotal = 0, paymentCreditAppliedTotal = 0, openingDueAfterAllocation = openingDueRemaining
      let currentBillOpeningApplied = 0, currentBillPaymentApplied = 0
      const olderBillUpdates = new Map<string, { paidAmount: number; total: number; creditApplied: number; openingCredit: number; paymentCredit: number }>()
      const allocateToTarget = (target: AllocationTarget) => {
        let remaining = target.duePoisha, targetOpeningCredit = 0, targetPaymentCredit = 0
        for (const source of creditSources) {
          if (remaining <= 0) break
          if (source.remaining <= 0) continue
          const applied = Math.min(remaining, source.remaining)
          source.remaining -= applied; remaining -= applied
          if (source.sourceType === 'OPENING_ADVANCE') { targetOpeningCredit += applied; openingAdvanceAppliedTotal += applied }
          else {
            targetPaymentCredit += applied; paymentCreditAppliedTotal += applied
            const paymentId = source.paymentDoc.id
            const prior = paymentUpdates.get(paymentId)
            const paymentData = source.paymentDoc.data() ?? {}
            const baseAllocations = prior?.allocations ?? (Array.isArray(paymentData.allocations) ? paymentData.allocations as PaymentAllocation[] : [])
            const baseUnallocated = prior?.unallocated ?? asNumber(paymentData.unallocatedCreditPoisha)
            paymentUpdates.set(paymentId, { allocations: [...baseAllocations, { targetType: target.targetType, targetId: target.targetId, amountPoisha: applied }], unallocated: baseUnallocated - applied })
          }
        }
        if (target.targetType === 'OPENING_BALANCE') openingDueAfterAllocation = remaining
        else if (target.isCurrentBill) { currentBillOpeningApplied = targetOpeningCredit; currentBillPaymentApplied = targetPaymentCredit }
        else if (target.billDoc && targetOpeningCredit + targetPaymentCredit > 0) {
          const data = target.billDoc.data() ?? {}
          const oldPaid = asNumber(data.paidAmountPoisha), total = asNumber(data.amountPoisha)
          const oldCredit = asNumber(data.creditAppliedPoisha)
          const oldOpening = asNumber(data.openingCreditAppliedPoisha ?? oldCredit)
          const oldPayment = asNumber(data.paymentCreditAppliedPoisha)
          olderBillUpdates.set(target.targetId, { paidAmount: oldPaid + targetOpeningCredit + targetPaymentCredit, total, creditApplied: oldCredit + targetOpeningCredit + targetPaymentCredit, openingCredit: oldOpening + targetOpeningCredit, paymentCredit: oldPayment + targetPaymentCredit })
        }
      }
      for (const target of targets) allocateToTarget(target)

      for (const [olderBillId, update] of olderBillUpdates) {
        const olderBillRef = ownerDoc(owner, 'bills', olderBillId)
        tx.update(olderBillRef, {
          paidAmountPoisha: update.paidAmount, status: update.paidAmount >= update.total ? 'PAID' : 'PARTIAL',
          creditAppliedPoisha: update.creditApplied, openingCreditAppliedPoisha: update.openingCredit,
          paymentCreditAppliedPoisha: update.paymentCredit, updatedAt: serverTimestamp(), updatedBy: owner,
        })
      }
      const billCreditApplied = currentBillOpeningApplied + currentBillPaymentApplied
      const paidAmountPoisha = billCreditApplied
      tx.set(billRef, {
        customerId, customerNameSnapshot: customerData.name, billingMonth: month, servicePeriodId: activePeriod.id,
        rateEffectiveMonth: matchingRates[0]?.data()?.effectiveMonth ?? month, amountPoisha, paidAmountPoisha,
        status: paidAmountPoisha >= amountPoisha ? 'PAID' : paidAmountPoisha > 0 ? 'PARTIAL' : 'UNPAID',
        issueDate: monthStart(month), creditAppliedPoisha: billCreditApplied,
        openingCreditAppliedPoisha: currentBillOpeningApplied, paymentCreditAppliedPoisha: currentBillPaymentApplied,
        createdAt: serverTimestamp(), createdBy: owner,
      })
      tx.set(ownerDoc(owner, 'ledgerEntries', `${customerId}_BILL_${month}`), {
        customerId, customerName: customerData.name, type: 'MONTHLY_BILL', entryDate: monthStart(month), reference: `BILL-${month}`,
        description: `Internet subscription for ${month}`, billingMonth: month, debitPoisha: amountPoisha, creditPoisha: 0,
        actorUid: owner, createdAt: serverTimestamp(),
      })
      const totalCreditUsed = openingAdvanceAppliedTotal + paymentCreditAppliedTotal
      const customerUpdates: Record<string, unknown> = {}
      if (totalCreditUsed > 0) customerUpdates.creditBalancePoisha = Math.max(0, currentCredit - totalCreditUsed)
      if (openingAdvanceAppliedTotal > 0) customerUpdates.openingAdvanceRemainingPoisha = Math.max(0, openingAdvanceRemaining - openingAdvanceAppliedTotal)
      if (openingDueRemaining !== openingDueAfterAllocation) customerUpdates.openingBalanceRemainingPoisha = openingDueAfterAllocation
      if (Object.keys(customerUpdates).length) { customerUpdates.updatedAt = serverTimestamp(); customerUpdates.updatedBy = owner; tx.update(customerRef, customerUpdates) }
      for (const [paymentId, update] of paymentUpdates) {
        const paymentRef = ownerDoc(owner, 'payments', paymentId)
        tx.update(paymentRef, { allocations: update.allocations, unallocatedCreditPoisha: update.unallocated, updatedAt: serverTimestamp() })
      }
      return 'created' as const
      })
    } catch (error) {
      const customerData = customerSnapshot.data() ?? {}
      const customerCode = String(customerData.customerCode ?? customerId)
      const customerName = String(customerData.name ?? customerCode)
      const detail = error instanceof Error ? error.message : String(error)
      return {
        type: 'error' as const,
        customerId, customerCode, customerName,
        message: `Could not generate the ${month} bill for ${customerCode}: ${detail}`,
      }
    }
  }

  for (let index = 0; index < customersSnap.docs.length; index += 12) {
    const chunk = customersSnap.docs.slice(index, index + 12)
    const results = await Promise.all(chunk.map(processCustomer))
    for (const result of results) {
      if (result === 'created') created++
      else if (result === 'skipped') alreadyExists++
      else if (result === 'outOfOrder') outOfOrder++
      else if (result === 'inactive') inactive++
      else errorDetails.push({ customerId: result.customerId, customerCode: result.customerCode, customerName: result.customerName, message: result.message })
    }
  }
  const skipped = inactive + outOfOrder
  const errorCount = errorDetails.length
  const summary = `Created ${created} bill(s); ${alreadyExists} already existed; ${skipped} skipped (${inactive} inactive, ${outOfOrder} out of order); ${errorCount} error(s).`
  await appendAudit(owner, 'BILLS_GENERATED', 'BILLING_RUN', month, `Monthly bill generation finished for ${month}. ${summary}`, { month, created, alreadyExists, skipped, inactive, outOfOrder, errorCount, monthStart: monthStart(month), monthEnd: selectedMonthEnd })
  return {
    month, created, alreadyExists, skipped, inactive, outOfOrder, errors: errorCount, errorDetails, message: summary,
  }
}

async function listPayments(owner: string) {
  const [paymentsSnap, customersSnap] = await Promise.all([getDocs(ownerCol(owner, 'payments')), getDocs(ownerCol(owner, 'customers'))])
  const names = new Map(customersSnap.docs.map(item => [item.id, String(item.data().name ?? '')]))
  const payments = paymentsSnap.docs.map(item => {
    const data = item.data()
    return {
      id: item.id, customerId: data.customerId,
      customerName: names.get(String(data.customerId)) ?? data.customerNameSnapshot ?? 'Unknown customer',
      reference: data.reference, amountPoisha: data.amountPoisha, amount: asNumber(data.amountPoisha) / 100,
      paymentDate: data.paymentDate, method: data.method, note: data.note ?? '', status: data.status ?? 'COMPLETED',
      reversalReason: data.reversalReason ?? '', createdAt: asIso(data.createdAt),
    }
  }).sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)) || String(b.createdAt).localeCompare(String(a.createdAt)))
  return { payments }
}

async function createPayment(owner: string, body: Body) {
  const customerId = textValue(body.customerId, 'Customer', 150)
  const amountPoisha = moneyToPoisha(body.amount, 'Payment amount', false)
  const paymentDate = dateValue(body.paymentDate, 'Payment date')
  if (paymentDate > dhakaToday()) throw new Error('Payment date cannot be in the future.')
  const method = textValue(body.method, 'Payment method', 20).toUpperCase()
  const allowedMethods = ['CASH', 'BKASH', 'NAGAD', 'BANK', 'OTHER']
  if (!allowedMethods.includes(method)) throw new Error('Select a valid payment method.')
  const note = textValue(body.note, 'Payment note', 300, false)
  const externalReference = textValue(body.externalReference, 'External transaction reference', 100, false)
  const idempotencyKey = textValue(body.idempotencyKey, 'Idempotency key', 100, false) || crypto.randomUUID()
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(idempotencyKey)) throw new Error('Idempotency key has an invalid format.')
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(customerId)) throw new Error('Customer reference has an invalid format.')
  const db = getFirebaseServices().db
  const customerRef = customerDoc(owner, customerId)
  const billsQuery = query(ownerCol(owner, 'bills'), where('customerId', '==', customerId))
  const existingBillsQuerySnap = await getDocs(billsQuery)
  const counterRef = ownerDoc(owner, 'systemCounters', 'payment')
  const idempotencyRef = ownerDoc(owner, 'idempotencyKeys', idempotencyKey)
  const paymentRef = doc(ownerCol(owner, 'payments'))
  const ledgerRef = doc(ownerCol(owner, 'ledgerEntries'))
  let paymentReference = ''
  let allocations: PaymentAllocation[] = []
  let duplicate = false

  await runTransaction(db, async tx => {
    allocations = []; duplicate = false; paymentReference = ''
    const [customerSnap, counterSnap, idempotencySnap, ...billSnapshots] = await Promise.all([
      tx.get(customerRef), tx.get(counterRef), tx.get(idempotencyRef),
      ...existingBillsQuerySnap.docs.map(item => tx.get(ownerDoc(owner, 'bills', item.id))),
    ])
    const existingBillDocs = billSnapshots.filter(item => item.exists())
    if (idempotencySnap.exists()) { duplicate = true; paymentReference = String(idempotencySnap.data().paymentReference ?? ''); return }
    if (!customerSnap.exists()) throw new Error('Customer not found.')
    const customer = customerSnap.data()
    const next = asNumber(counterSnap.data()?.nextValue) || 1
    paymentReference = `PAY-${String(next).padStart(8, '0')}`
    tx.set(counterRef, { nextValue: next + 1, updatedAt: serverTimestamp() }, { merge: true })

    const items: { date: string; type: 'OPENING_BALANCE' | 'BILL'; id: string; remaining: number; ref: DocumentReference }[] = []
    const openingRemaining = Math.max(0, asNumber(customer.openingBalanceRemainingPoisha))
    let openingRemainingAfterAllocation = openingRemaining
    const openingDate = String(customer.openingBalanceDate ?? '')
    if (openingRemaining > 0 && openingDate && openingDate <= paymentDate) items.push({ date: openingDate, type: 'OPENING_BALANCE', id: `${customerId}_OPENING`, remaining: openingRemaining, ref: customerRef })
    for (const billDoc of existingBillDocs) {
      const data = billDoc.data() ?? {}
      const billingMonth = String(data.billingMonth ?? '')
      const amount = asNumber(data.amountPoisha)
      const paid = asNumber(data.paidAmountPoisha)
      // A receipt before a billing month remains advance credit rather than paying a future bill.
      if (billingMonth && billingMonth <= paymentDate.slice(0, 7) && amount > paid) items.push({ date: `${billingMonth}-01`, type: 'BILL', id: billDoc.id, remaining: amount - paid, ref: ownerDoc(owner, 'bills', billDoc.id) })
    }
    items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    let left = amountPoisha
    for (const item of items) {
      if (left <= 0) break
      const applied = Math.min(left, item.remaining)
      allocations.push({ targetType: item.type, targetId: item.id, amountPoisha: applied })
      if (item.type === 'OPENING_BALANCE') openingRemainingAfterAllocation = item.remaining - applied
      else {
        const bill = existingBillDocs.find(itemDoc => itemDoc.id === item.id)!
        const billData = bill.data() ?? {}
        const newPaid = asNumber(billData.paidAmountPoisha) + applied
        const total = asNumber(billData.amountPoisha)
        tx.update(item.ref, { paidAmountPoisha: newPaid, status: newPaid >= total ? 'PAID' : 'PARTIAL', updatedAt: serverTimestamp() })
      }
      left -= applied
    }
    const newCreditBalance = Math.max(0, asNumber(customer.creditBalancePoisha)) + left
    tx.update(customerRef, { openingBalanceRemainingPoisha: openingRemainingAfterAllocation, creditBalancePoisha: newCreditBalance, updatedAt: serverTimestamp(), updatedBy: owner })
    tx.set(paymentRef, {
      customerId, customerNameSnapshot: customer.name, reference: paymentReference, amountPoisha, paymentDate,
      method, externalReference, note, status: 'COMPLETED', allocations, unallocatedCreditPoisha: left,
      createdAt: serverTimestamp(), createdBy: owner,
    })
    tx.set(ledgerRef, {
      customerId, customerName: customer.name, type: 'PAYMENT', entryDate: paymentDate, reference: paymentReference,
      description: note || `Payment received via ${method}`, debitPoisha: 0, creditPoisha: amountPoisha,
      paymentId: paymentRef.id, actorUid: owner, createdAt: serverTimestamp(),
    })
    tx.set(idempotencyRef, { paymentId: paymentRef.id, paymentReference, createdAt: serverTimestamp() })
  })
  if (duplicate) return { success: true, duplicate: true, reference: paymentReference }
  await appendAudit(owner, 'PAYMENT_RECORDED', 'PAYMENT', paymentRef.id, `Recorded payment ${paymentReference}.`, { customerId, amountPoisha, method })
  return { success: true, paymentId: paymentRef.id, reference: paymentReference, allocations, unallocatedCredit: allocations.length ? undefined : amountPoisha / 100 }
}

async function reversePayment(owner: string, paymentId: string, body: Body) {
  const reason = textValue(body.reason, 'Reversal reason', 300)
  const db = getFirebaseServices().db
  const paymentRef = ownerDoc(owner, 'payments', paymentId)
  const reversalLedgerRef = doc(ownerCol(owner, 'ledgerEntries'))
  let paymentReference = '', customerId = '', amountPoisha = 0
  await runTransaction(db, async tx => {
    const paymentSnap = await tx.get(paymentRef)
    if (!paymentSnap.exists()) throw new Error('Payment not found.')
    const payment = paymentSnap.data()
    if (payment.status === 'REVERSED') throw new Error('This payment has already been reversed.')
    if (payment.status !== 'COMPLETED') throw new Error('Only completed payments can be reversed.')
    customerId = String(payment.customerId ?? '')
    paymentReference = String(payment.reference ?? paymentId)
    amountPoisha = asNumber(payment.amountPoisha)
    if (!customerId || !Number.isSafeInteger(amountPoisha) || amountPoisha <= 0) throw new Error('Payment record is missing valid accounting details.')
    const customerRef = customerDoc(owner, customerId)
    const customerSnap = await tx.get(customerRef)
    if (!customerSnap.exists()) throw new Error('Customer not found.')
    const rawAllocations = Array.isArray(payment.allocations) ? payment.allocations as PaymentAllocation[] : []
    const billAllocations = rawAllocations.filter(item => item.targetType === 'BILL')
    const refsById = new Map<string, DocumentReference>()
    for (const allocation of billAllocations) {
      const id = String(allocation.targetId ?? '')
      if (!id) throw new Error('Payment allocation is missing a bill reference.')
      refsById.set(id, ownerDoc(owner, 'bills', id))
    }
    const billEntries = await Promise.all([...refsById.values()].map(ref => tx.get(ref)))
    const billsById = new Map(billEntries.map(item => [item.id, item]))
    let openingReversalPoisha = 0
    const billReversals = new Map<string, number>()
    for (const allocation of rawAllocations) {
      const amount = asNumber(allocation.amountPoisha)
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Payment allocation contains an invalid amount.')
      if (allocation.targetType === 'OPENING_BALANCE') openingReversalPoisha += amount
      else if (allocation.targetType === 'BILL') billReversals.set(allocation.targetId, (billReversals.get(allocation.targetId) ?? 0) + amount)
      else throw new Error('Payment allocation has an unsupported target type.')
    }
    const unallocatedCredit = asNumber(payment.unallocatedCreditPoisha)
    const currentCredit = asNumber(customerSnap.data().creditBalancePoisha)
    if (!Number.isSafeInteger(unallocatedCredit) || unallocatedCredit < 0) throw new Error('Payment has an invalid unallocated-credit amount.')
    if (currentCredit < unallocatedCredit) throw new Error('This payment created advance credit that has since been used by a bill. It cannot be reversed automatically; review the affected bill and customer ledger first.')
    for (const [billId, amount] of billReversals) {
      const billSnap = billsById.get(billId)
      if (!billSnap?.exists()) throw new Error(`Allocated bill ${billId} was not found.`)
      const paid = asNumber(billSnap.data().paidAmountPoisha)
      const protectedCredit = asNumber(billSnap.data().openingCreditAppliedPoisha ?? billSnap.data().creditAppliedPoisha)
      const nextPaid = paid - amount
      if (!Number.isSafeInteger(amount) || amount < 0 || nextPaid < protectedCredit) throw new Error('This payment allocation cannot be reversed safely because the bill has since used other advance credit. Review the affected bill and ledger first.')
      const total = asNumber(billSnap.data().amountPoisha)
      tx.update(billSnap.ref, { paidAmountPoisha: nextPaid, status: nextPaid >= total ? 'PAID' : nextPaid > 0 ? 'PARTIAL' : 'UNPAID', updatedAt: serverTimestamp(), updatedBy: owner })
    }
    tx.update(customerRef, {
      openingBalanceRemainingPoisha: asNumber(customerSnap.data().openingBalanceRemainingPoisha) + openingReversalPoisha,
      creditBalancePoisha: currentCredit - unallocatedCredit, updatedAt: serverTimestamp(), updatedBy: owner,
    })
    tx.update(paymentRef, { status: 'REVERSED', reversalReason: reason, reversedAt: serverTimestamp(), reversedBy: owner, updatedAt: serverTimestamp() })
    tx.set(reversalLedgerRef, {
      customerId, customerName: payment.customerNameSnapshot ?? '', type: 'PAYMENT_REVERSAL', entryDate: dhakaToday(),
      reference: `REV-${paymentReference}`, description: `Reversal of ${paymentReference}: ${reason}`,
      debitPoisha: amountPoisha, creditPoisha: 0, paymentId, actorUid: owner, createdAt: serverTimestamp(),
    })
  })
  await appendAudit(owner, 'PAYMENT_REVERSED', 'PAYMENT', paymentId, `Reversed payment ${paymentReference}.`, { customerId, amountPoisha, reason })
  return { success: true, paymentReference, reversalReference: `REV-${paymentReference}` }
}

async function getLedger(owner: string, customerId: string) {
  const customerRef = customerDoc(owner, customerId)
  const entriesQuery = query(ownerCol(owner, 'ledgerEntries'), where('customerId', '==', customerId))
  const billsQuery = query(ownerCol(owner, 'bills'), where('customerId', '==', customerId))
  const [customerSnap, periodsSnap, entriesSnap, billsSnap] = await Promise.all([
    getDoc(customerRef), getDocs(customerSubcol(owner, customerId, 'servicePeriods')), getDocs(entriesQuery), getDocs(billsQuery),
  ])
  if (!customerSnap.exists()) throw new Error('Customer not found.')
  const data = customerSnap.data()
  const entries = entriesSnap.docs.map(item => ({
    id: item.id, date: String(item.data().entryDate ?? ''), type: String(item.data().type ?? ''),
    reference: String(item.data().reference ?? ''), description: String(item.data().description ?? ''),
    debitPoisha: asNumber(item.data().debitPoisha), creditPoisha: asNumber(item.data().creditPoisha),
    debit: asNumber(item.data().debitPoisha) / 100, credit: asNumber(item.data().creditPoisha) / 100,
    createdAt: asIso(item.data().createdAt),
  })).sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))
  let running = 0, totalDebit = 0, totalCredit = 0
  const ledger = entries.map(entry => {
    totalDebit += entry.debitPoisha; totalCredit += entry.creditPoisha; running += entry.debitPoisha - entry.creditPoisha
    return { ...entry, balancePoisha: running, balance: running / 100 }
  })
  const servicePeriods = periodsSnap.docs.map(item => ({ id: item.id, joinDate: item.data().joinDate, leaveDate: item.data().leaveDate ?? null, status: item.data().status }))
    .sort((a, b) => String(a.joinDate).localeCompare(String(b.joinDate)))
  const bills = billsSnap.docs.map(item => ({
    id: item.id, billingMonth: item.data().billingMonth, amount: asNumber(item.data().amountPoisha) / 100,
    paidAmount: asNumber(item.data().paidAmountPoisha) / 100, status: item.data().status,
  })).sort((a, b) => String(a.billingMonth).localeCompare(String(b.billingMonth)))
  return {
    customer: { id: customerSnap.id, name: data.name, phone: data.phone ?? '', address: data.address ?? '', status: data.status, monthlyAmount: asNumber(data.monthlyAmountPoisha) / 100, createdAt: asIso(data.createdAt) },
    servicePeriods, bills, ledger,
    summary: {
      totalDebitPoisha: totalDebit, totalCreditPoisha: totalCredit, totalDebit: totalDebit / 100, totalCredit: totalCredit / 100,
      balancePoisha: running, balance: running / 100, advanceCredit: Math.max(0, -running / 100), outstanding: Math.max(0, running / 100),
    },
  }
}

async function getTransactions(owner: string) {
  const [entriesSnap, customersSnap] = await Promise.all([getDocs(ownerCol(owner, 'ledgerEntries')), getDocs(ownerCol(owner, 'customers'))])
  const names = new Map(customersSnap.docs.map(item => [item.id, String(item.data().name ?? '')]))
  const transactions = entriesSnap.docs.map(item => {
    const data = item.data()
    return {
      id: item.id, customerId: data.customerId, customerName: names.get(String(data.customerId)) ?? data.customerName ?? 'Unknown customer',
      date: data.entryDate ?? '', type: data.type, reference: data.reference ?? '', description: data.description ?? '',
      debit: asNumber(data.debitPoisha) / 100, credit: asNumber(data.creditPoisha) / 100, createdAt: asIso(data.createdAt),
    }
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
  return { transactions }
}

async function getReport(owner: string, rawMonth: string) {
  const month = rawMonth ? monthValue(rawMonth) : dhakaMonth()
  const [customersSnap, billsSnap, paymentsSnap, entriesSnap] = await Promise.all([
    getDocs(ownerCol(owner, 'customers')), getDocs(ownerCol(owner, 'bills')),
    getDocs(ownerCol(owner, 'payments')), getDocs(ownerCol(owner, 'ledgerEntries')),
  ])
  const customerNames = new Map(customersSnap.docs.map(item => [item.id, String(item.data().name ?? '')]))
  const balances = new Map<string, number>()
  for (const entry of entriesSnap.docs) {
    const id = String(entry.data().customerId ?? '')
    balances.set(id, (balances.get(id) ?? 0) + asNumber(entry.data().debitPoisha) - asNumber(entry.data().creditPoisha))
  }
  const payments = paymentsSnap.docs.filter(item => String(item.data().paymentDate ?? '').startsWith(month))
  const bills = billsSnap.docs.filter(item => item.data().billingMonth === month)
  const start = monthStart(month), end = monthEnd(month)
  const collectionPoisha = entriesSnap.docs.filter(item => {
    const date = String(item.data().entryDate ?? ''); return date >= start && date <= end
  }).reduce((sum, item) => sum + (item.data().type === 'PAYMENT' ? asNumber(item.data().creditPoisha) : item.data().type === 'PAYMENT_REVERSAL' ? -asNumber(item.data().debitPoisha) : 0), 0)
  const outstanding = [...balances.entries()].filter(([, value]) => value > 0).map(([id, value]) => ({ customerId: id, customerName: customerNames.get(id) ?? 'Unknown customer', amount: value / 100 })).sort((a, b) => b.amount - a.amount)
  return {
    month, collection: collectionPoisha / 100,
    billTotal: bills.reduce((sum, item) => sum + asNumber(item.data().amountPoisha), 0) / 100,
    paymentCount: payments.length, billCount: bills.length,
    outstandingTotal: outstanding.reduce((sum, item) => sum + item.amount, 0), outstandingCustomers: outstanding,
    customerCount: customersSnap.size, activeCustomers: customersSnap.docs.filter(item => item.data().status === 'ACTIVE').length,
  }
}

async function getDashboard(owner: string) {
  const [customersSnap, billsSnap, entriesSnap, activitySnap] = await Promise.all([
    getDocs(ownerCol(owner, 'customers')), getDocs(ownerCol(owner, 'bills')),
    getDocs(ownerCol(owner, 'ledgerEntries')), getDocs(ownerCol(owner, 'auditLogs')),
  ])
  const month = dhakaMonth(), year = Number(month.slice(0, 4)), yearPrefix = `${year}-`
  const activeCustomers = customersSnap.docs.filter(item => item.data().status === 'ACTIVE').length
  const monthBills = billsSnap.docs.filter(item => item.data().billingMonth === month)
  const billedPoisha = monthBills.reduce((sum, item) => sum + asNumber(item.data().amountPoisha), 0)
  const collectedPoisha = entriesSnap.docs.filter(item => String(item.data().entryDate ?? '').startsWith(month)).reduce((sum, item) => sum + (item.data().type === 'PAYMENT' ? asNumber(item.data().creditPoisha) : item.data().type === 'PAYMENT_REVERSAL' ? -asNumber(item.data().debitPoisha) : 0), 0)
  const annualPoisha = Array.from({ length: 12 }, () => 0)
  for (const item of entriesSnap.docs) {
    const date = String(item.data().entryDate ?? '')
    if (!date.startsWith(yearPrefix)) continue
    const monthNumber = Number(date.slice(5, 7))
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) continue
    if (item.data().type === 'PAYMENT') annualPoisha[monthNumber - 1] += asNumber(item.data().creditPoisha)
    else if (item.data().type === 'PAYMENT_REVERSAL') annualPoisha[monthNumber - 1] -= asNumber(item.data().debitPoisha)
  }
  const annualIncome = { year, total: annualPoisha.reduce((sum, value) => sum + value, 0) / 100, months: annualPoisha.map((value, index) => ({ month: `${year}-${String(index + 1).padStart(2, '0')}`, amount: value / 100 })) }
  const balances = new Map<string, number>()
  for (const item of entriesSnap.docs) {
    const customerId = String(item.data().customerId ?? '')
    balances.set(customerId, (balances.get(customerId) ?? 0) + asNumber(item.data().debitPoisha) - asNumber(item.data().creditPoisha))
  }
  const balanceValues = [...balances.values()]
  const outstanding = balanceValues.reduce((sum, value) => sum + Math.max(0, value), 0)
  const advance = balanceValues.reduce((sum, value) => sum + Math.max(0, -value), 0)
  const recentActivity = activitySnap.docs.map(item => ({
    id: item.id, description: item.data().description, action: item.data().action,
    createdAt: asIso(item.data().createdAt),
  })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8)
  return {
    month, annualIncome,
    stats: {
      activeCustomers, billedThisMonth: billedPoisha / 100, collectedThisMonth: collectedPoisha / 100,
      outstanding: outstanding / 100, advanceCredit: advance / 100, totalBillsThisMonth: monthBills.length,
      transactionCountThisMonth: entriesSnap.docs.filter(item => String(item.data().entryDate ?? '').startsWith(month) && ['PAYMENT', 'PAYMENT_REVERSAL'].includes(String(item.data().type ?? ''))).length,
    },
    recentActivity,
  }
}

async function getActivities(owner: string) {
  const snap = await getDocs(ownerCol(owner, 'auditLogs'))
  const activities = snap.docs.map(item => ({
    id: item.id, action: item.data().action, entityType: item.data().entityType, entityId: item.data().entityId,
    description: item.data().description, actorEmail: item.data().actorEmail ?? getFirebaseServices().auth.currentUser?.email ?? '',
    createdAt: asIso(item.data().createdAt),
  })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200)
  return { activities }
}

export async function verifyOwnerSession(user: User) {
  const current = getFirebaseServices().auth.currentUser
  if (!current || current.uid !== user.uid) throw new Error('Your sign-in session is no longer valid. Please sign in again.')
  // The signed-in UID is the workspace owner. Firestore rules enforce that all
  // reads and writes remain inside users/{uid}; there is no server Admin API.
  return { uid: user.uid, email: user.email ?? undefined, role: 'owner' as const }
}

export async function runDataOperation<T>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}): Promise<T> {
  const owner = uid()
  const method = options.method ?? 'GET'
  const body = (options.body && typeof options.body === 'object' ? options.body : {}) as Body
  const url = new URL(path, window.location.origin)
  const route = url.pathname
  let result: unknown

  if (route === '/data/customers') {
    if (method === 'GET') {
      const rows = await listCustomers(owner, url.searchParams.get('status') ?? 'all')
      const search = (url.searchParams.get('q') ?? '').trim().toLowerCase()
      result = { customers: rows.filter(item => !search || `${item.name} ${item.phone} ${item.address}`.toLowerCase().includes(search)) }
    } else if (method === 'POST') result = await createCustomer(owner, body)
    else throw new Error('Method not allowed.')
  } else if (route.startsWith('/data/customers/')) {
    const match = /^\/data\/customers\/([^/]+)(?:\/(rates|leave|service))?$/.exec(route)
    if (!match) throw new Error('Customer route was not found.')
    const id = decodeURIComponent(match[1])
    const action = match[2]
    if (action === 'rates') {
      if (method === 'GET') result = await getCustomerRates(owner, id)
      else if (method === 'POST') result = await addCustomerRate(owner, id, body)
      else throw new Error('Method not allowed.')
    } else if (action === 'leave') {
      if (method !== 'POST') throw new Error('Method not allowed.')
      result = await customerService(owner, id, body, 'leave')
    } else if (action === 'service') {
      if (method !== 'POST') throw new Error('Method not allowed.')
      result = await customerService(owner, id, body, 'restart')
    } else {
      if (method === 'GET') {
        const customer = await getCustomerView(owner, id)
        if (!customer) throw new Error('Customer not found.')
        result = { customer }
      } else if (method === 'PATCH') result = await updateCustomer(owner, id, body)
      else throw new Error('Method not allowed.')
    }
  } else if (route === '/data/bills') {
    if (method !== 'GET') throw new Error('Method not allowed.')
    result = await listBills(owner, url.searchParams.get('month') ? monthValue(url.searchParams.get('month')) : '')
  } else if (route === '/data/bills/generate') {
    if (method !== 'POST') throw new Error('Method not allowed.')
    result = await generateBills(owner, body)
  } else if (route === '/data/payments') {
    if (method === 'GET') result = await listPayments(owner)
    else if (method === 'POST') result = await createPayment(owner, body)
    else throw new Error('Method not allowed.')
  } else if (route.startsWith('/data/payments/')) {
    const match = /^\/data\/payments\/([^/]+)\/reverse$/.exec(route)
    if (!match || method !== 'POST') throw new Error('Payment route was not found.')
    result = await reversePayment(owner, decodeURIComponent(match[1]), body)
  } else if (route.startsWith('/data/ledger/')) {
    if (method !== 'GET') throw new Error('Method not allowed.')
    const customerId = decodeURIComponent(route.slice('/data/ledger/'.length))
    if (!customerId) throw new Error('Customer is required.')
    result = await getLedger(owner, customerId)
  } else if (route === '/data/dashboard') {
    if (method !== 'GET') throw new Error('Method not allowed.')
    result = await getDashboard(owner)
  } else if (route === '/data/transactions') {
    if (method !== 'GET') throw new Error('Method not allowed.')
    result = await getTransactions(owner)
  } else if (route === '/data/reports') {
    if (method !== 'GET') throw new Error('Method not allowed.')
    result = await getReport(owner, url.searchParams.get('month') ?? '')
  } else if (route === '/data/activity') {
    if (method !== 'GET') throw new Error('Method not allowed.')
    result = await getActivities(owner)
  } else {
    throw new Error(`Unknown application data operation: ${route}`)
  }
  return result as T
}
