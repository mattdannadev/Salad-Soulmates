'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>We couldn’t load this page.</h1>
      <p>We could not complete the request. Check the latest records before retrying a save.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
