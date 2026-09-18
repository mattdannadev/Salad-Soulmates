'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>We couldn’t load this page.</h1>
      <p>Your saved data is safe. Check your connection and try again.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
