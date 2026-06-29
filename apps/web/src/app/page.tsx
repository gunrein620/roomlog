import { HealthCheck } from "@/components/HealthCheck";

export default function Home() {
  return (
    <main className="page">
      <section className="intro">
        <p className="eyebrow">Roomlog</p>
        <h1>Roomlog Frontend</h1>
        <p className="description">
          Next.js frontend for the Roomlog rental management platform.
        </p>
      </section>
      <HealthCheck />
    </main>
  );
}
