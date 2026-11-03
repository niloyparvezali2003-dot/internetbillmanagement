type LoadingScreenProps = {
  checking?: boolean
}

/** Branded full-screen loading state. Keeps authentication and routing logic in App. */
export function LoadingScreen({ checking = false }: LoadingScreenProps) {
  const title = checking ? 'Securing your workspace' : 'Preparing your workspace'
  const message = checking
    ? 'Verifying administrator access and permissions.'
    : 'Connecting your secure internet billing workspace.'
  const status = checking ? 'VERIFYING ADMIN ACCESS' : 'ESTABLISHING SECURE SESSION'

  return (
    <main
      className="brand-loading-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${title}. ${message}`}
    >
      <div className="brand-loading-backdrop" aria-hidden="true">
        <span className="brand-loading-glow brand-loading-glow--one" />
        <span className="brand-loading-glow brand-loading-glow--two" />
        <span className="brand-loading-grid" />
      </div>

      <section className="brand-loading-card" aria-label="ALI AL-FATEEH loading">
        <div className="brand-loading-visual" aria-hidden="true">
          <span className="brand-loading-orbit brand-loading-orbit--outer" />
          <span className="brand-loading-orbit brand-loading-orbit--inner" />
          <span className="brand-loading-satellite brand-loading-satellite--one" />
          <span className="brand-loading-satellite brand-loading-satellite--two" />
          <span className="brand-loading-satellite brand-loading-satellite--three" />
          <div className="brand-loading-logo-frame">
            <img
              className="brand-loading-logo"
              src="/ali-al-fateeh-logo.png"
              alt=""
              width={1774}
              height={887}
              draggable={false}
            />
          </div>
        </div>

        <div className="brand-loading-copy">
          <span className="brand-loading-eyebrow">
            <i aria-hidden="true" /> ALI AL-FATEEH <b>·</b> INTERNET BILLING
          </span>
          <h1>{title}</h1>
          <p>{message}</p>
        </div>

        <div className="brand-loading-status" aria-hidden="true">
          <div className="brand-loading-status-track"><span /></div>
          <div className="brand-loading-status-label">
            <span className="brand-loading-status-dot" />
            {status}
            <span className="brand-loading-ellipsis"><i /><i /><i /></span>
          </div>
        </div>
      </section>

      <footer className="brand-loading-footer">
        <span>PRIVATE ADMIN WORKSPACE</span>
        <i aria-hidden="true" />
        <span>ASIA / DHAKA</span>
      </footer>
    </main>
  )
}
