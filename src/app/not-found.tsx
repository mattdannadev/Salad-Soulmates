import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Page not found</h1>
        <p>This page may not be available in the current build.</p>
        <Link href="/app" className="button">
          Back to home
        </Link>
      </section>
    </main>
  );
}
