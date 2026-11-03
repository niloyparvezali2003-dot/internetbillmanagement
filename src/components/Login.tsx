import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { getFirebaseAuth } from '../services/firebase/client'
import { verifyOwnerSession } from '../services/firebase/data'

type Props = { onSignedIn: (email: string) => void }

export function Login({ onSignedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const auth = getFirebaseAuth()
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
      try {
        const admin = await verifyOwnerSession(credential.user)
        onSignedIn(admin.email || credential.user.email || email.trim())
      } catch (accessError) {
        await signOut(auth)
        throw accessError
      }
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : ''
      const message = err instanceof Error ? err.message : ''
      if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) setError('Email or password is incorrect.')
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Please wait and try again.')
      else if (code === 'auth/operation-not-allowed') setError('Enable Email/Password sign-in in Firebase Authentication.')
      else if (code === 'auth/unauthorized-domain') setError('Add this domain to Firebase Authentication authorized domains.')
      else setError(message || 'Unable to sign in. Check your Firebase configuration and connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-lockup brand-lockup--logo"><img className="brand-logo-img" src="/ali-al-fateeh-logo.png" alt="ALI AL-FATEEH" width={1774} height={887} draggable={false}/></div>
        <div className="login-heading"><span className="eyebrow">ADMIN PORTAL</span><h1>Welcome back</h1><p>Sign in to manage customers, monthly bills and payments.</p></div>
        <form onSubmit={submit} className="login-form">
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" autoComplete="username" required disabled={busy} /></label>
          <label>Password<div className="password-field"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required disabled={busy}/><button type="button" className="reveal" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Verifying access…' : 'Sign in securely'} {!busy && <ArrowRight size={17}/>}</button>
        </form>
        <div className="login-foot"><LockKeyhole size={14}/> Private administrator access · No customer accounts</div>
      </section>
      <div className="login-side"><div className="side-orb orb-one"/><div className="side-orb orb-two"/><div className="side-copy"><span className="side-kicker">SIMPLE. CLEAR. ACCOUNTABLE.</span><h2>Your internet billing,<br/>under control.</h2><p>One place for customer records, monthly billing, payment collection and accurate ledgers.</p><div className="side-points"><span>✓ Monthly billing</span><span>✓ Payment tracking</span><span>✓ Customer statements</span></div></div><div className="side-bottom">ALI AL-FATEEH · ADMINISTRATION</div></div>
    </main>
  )
}
