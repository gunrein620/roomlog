const roleApps = [
  {
    label: "Tenant",
    eyebrow: "TENANT",
    href: process.env.NEXT_PUBLIC_TENANT_URL ?? "http://localhost:3001",
    title: "AI defect intake",
    description: "Start a consultation thread, upload photos, and track repair status.",
    port: "3001"
  },
  {
    label: "Manager",
    eyebrow: "MANAGER",
    href: process.env.NEXT_PUBLIC_MANAGER_URL ?? "http://localhost:3002",
    title: "Ticket operations",
    description: "Review AI analysis, assign vendors, and approve completion.",
    port: "3002"
  },
  {
    label: "Vendor",
    eyebrow: "VENDOR",
    href: process.env.NEXT_PUBLIC_VENDOR_URL ?? "http://localhost:3003",
    title: "Repair workflow",
    description: "Handle assigned repairs, estimates, schedules, and completion reports.",
    port: "3003"
  }
];

export default function Home() {
  return (
    <main className="page">
      <section className="intro">
        <p className="eyebrow">ROOMLOG</p>
        <h1>Role apps</h1>
        <p className="description">Open the active MVP app for each Roomlog role.</p>
      </section>
      <nav className="app-grid" aria-label="Roomlog role apps">
        {roleApps.map((app) => (
          <a className="app-link" href={app.href} key={app.label}>
            <span className="app-eyebrow">{app.eyebrow}</span>
            <strong>{app.title}</strong>
            <span>{app.description}</span>
            <em>localhost:{app.port}</em>
          </a>
        ))}
      </nav>
    </main>
  );
}
