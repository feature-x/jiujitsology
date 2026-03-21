export default function Home() {
  return (
    <main>
      <h1>Agile Flow</h1>
      <p>
        Your deployment pipeline is live. Configure your stack with{" "}
        <code>/bootstrap-architecture</code>.
      </p>

      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/health</code> — Health check
        </li>
        <li>
          <code>GET /api/error</code> — Trigger a test error (for Sentry)
        </li>
        <li>
          <code>POST /api/error-events</code> — Error event receiver
        </li>
      </ul>

      <p>
        <small>
          This is the deploy-first starter. Your tech stack will be configured
          during the bootstrap phase.
        </small>
      </p>
    </main>
  );
}
