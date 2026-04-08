function AppShell({
  topBar,
  statusBanner,
  topControls,
  children,
  footer
}) {
  return (
    <div className="app-shell">
      {topBar || null}
      {statusBanner || null}

      {topControls ? (
        <section className="app-shell__controls" aria-label="Top controls container">
          {topControls}
        </section>
      ) : null}

      <main className="app-shell__main" role="main">
        {children}
      </main>

      {footer ? <footer className="app-shell__footer">{footer}</footer> : null}
    </div>
  );
}

export default AppShell;
