function AppShell({
  topBar,
  statusBanner,
  topControls,
  children,
  footer
}) {
  return (
    <div className="app-shell">
      {topBar}
      {statusBanner}

      <section className="app-shell__controls" aria-label="Top controls container">
        {topControls}
      </section>

      <main className="app-shell__main" role="main">
        {children}
      </main>

      <footer className="app-shell__footer">{footer}</footer>
    </div>
  );
}

export default AppShell;