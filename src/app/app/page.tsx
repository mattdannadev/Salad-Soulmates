import Link from 'next/link';
import {
  Leaf, Truck, MessageCircle, ArrowRight,
} from 'lucide-react';
import { requireAdminShell } from '@/lib/auth';
import { PageHeader } from '@/components/shell';
import { z } from 'zod';
import { operationError } from '@/lib/operation-error';

export default async function Home() {
  const { db, profile } = await requireAdminShell();
  const results = await Promise.all(
    (['ingredients', 'suppliers', 'feedback_items'] as const).map((table) => db.from(table).select('id', { count: 'exact', head: true })),
  );
  const counts = results.map((result) => {
    if (result.error) throw operationError('dashboard_counts', 'Unable to load overview.', result.error);
    return z.number().int().nonnegative().parse(result.count);
  });
  const cards = [
    { name: 'Ingredients', icon: Leaf, href: '/app/ingredients' },
    { name: 'Suppliers', icon: Truck, href: '/app/suppliers' },
    { name: 'Feedback', icon: MessageCircle, href: '/app/feedback' },
  ];
  return (
    <>
      <PageHeader
        eyebrow="YOUR OPERATIONS WORKSPACE"
        title={`Welcome, ${profile.display_name.split(' ')[0]}`}
        description="Fresh operations, beautifully organized. Start with the ingredients and partners behind your food."
      />
      <div className="stats">
        {cards.map((c, i) => (
          <Link href={c.href} className="stat" key={c.name}>
            <c.icon />
            <div>
              <span>{c.name}</span>
              <strong>{counts[i]}</strong>
            </div>
            <ArrowRight size={18} />
          </Link>
        ))}
      </div>
      <section className="panel">
        <p className="eyebrow">LET’S GET THE FOUNDATIONS RIGHT</p>
        <h2>A good place to begin</h2>
        <div className="steps">
          <Link href="/app/ingredients">
            <span className="step-number">1</span>
            <div>
              <h3>Build your ingredient library</h3>
              <p>Set the base unit, reviewed Spanish name, storage notes and allergens.</p>
            </div>
            <ArrowRight />
          </Link>
          <Link href="/app/suppliers">
            <span className="step-number">2</span>
            <div>
              <h3>Add your suppliers</h3>
              <p>Record contacts and connect purchasing packs from each ingredient’s page.</p>
            </div>
            <ArrowRight />
          </Link>
          <Link href="/app/inventory">
            <span className="step-number">3</span>
            <div>
              <h3>Record starting inventory</h3>
              <p>
                Enter reviewed opening quantities for your facility, with a reason for every
                adjustment.
              </p>
            </div>
            <ArrowRight />
          </Link>
        </div>
      </section>
      <section className="panel soft">
        <h2>What comes next</h2>
        <p>
          After the engineering refactor, the next phases cover materials and purchasing,
          receiving, customer orders and planning, then scheduling. Every standard 40-gallon
          mixer batch will require one spice bucket.
        </p>
        <p>
          The Spanish worker workspace is reserved for simple phone use. Assignments and batch work
          become available after their review gates.
        </p>
      </section>
    </>
  );
}
