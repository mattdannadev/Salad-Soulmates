import Link from 'next/link';
import {
  Leaf, ArrowRight, ShieldCheck, Layers, Languages,
} from 'lucide-react';

export default function Setup() {
  return (
    <div className="setup-page">
      <header className="setup-brand">
        <Leaf />
        Salad Soulmates
        <span>APPLICATION FOUNDATION</span>
      </header>
      <main className="setup-content">
        <p className="eyebrow">GROWING SOMETHING GOOD</p>
        <h1>
          Fresh operations.
          <br />
          <em>Thoughtfully connected.</em>
        </h1>
        <p className="lead">
          One clear place for ingredients, recipes, planning, and the people who bring it all
          together.
        </p>
        <div className="notice">A database connection is required before signing in.</div>
        <div className="feature-grid">
          <article>
            <Layers />
            <h2>A dependable foundation</h2>
            <p>Ingredients, supplier packs, and an auditable inventory history come first.</p>
          </article>
          <article>
            <Languages />
            <h2>Built for your whole team</h2>
            <p>Spanish-first worker screens, with scheduling and PTO in the first increment.</p>
          </article>
          <article>
            <ShieldCheck />
            <h2>Care at every step</h2>
            <p>Role-based access and a carefully tested path to production.</p>
          </article>
        </div>
        <Link className="button" href="/login">
          Go to sign in
          {' '}
          <ArrowRight size={18} />
        </Link>
        <p className="muted">Setup instructions: docs/database.md in the repository.</p>
      </main>
      <footer>Good food brings people together.</footer>
    </div>
  );
}
