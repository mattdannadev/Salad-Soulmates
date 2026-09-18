'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Leaf, Home, Package, Truck, MessageCircle, LogOut, ArrowUpRight } from 'lucide-react';
import { signOut } from '@/app/actions';
import { FeedbackDrawer } from './feedback';
const links = [
  { href: '/app', label: 'Home', icon: Home },
  { href: '/app/ingredients', label: 'Ingredients', icon: Leaf },
  { href: '/app/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/app/inventory', label: 'Inventory', icon: Package },
  { href: '/app/feedback', label: 'Feedback', icon: MessageCircle },
];
export function Shell({
  children,
  name,
  role,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
}) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/app" className="brand">
          <Leaf size={42} />
          <strong>Salad Soulmates</strong>
          <small>
            GOOD FOOD BRINGS
            <br />
            PEOPLE TOGETHER
          </small>
        </Link>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (href === '/app' ? path === href : path.startsWith(href)) ? 'page' : undefined
              }
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>
            Better ingredients.
            <br />
            <em>Brighter tomorrows.</em>
          </p>
          <span>FAMILY OWNED · FOOD WITH CARE</span>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="breadcrumb">
            Operations <ArrowUpRight size={14} /> Foundation
          </span>
          <div className="identity">
            <span className="avatar">{name.slice(0, 1)}</span>
            <span>
              {name}
              <small>{role}</small>
            </span>
            <form action={signOut}>
              <button className="icon-button" aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <div className="staging-banner">
          FOUNDATION BUILD <span>Production operations are not enabled</span>
        </div>
        <main>{children}</main>
        <footer>
          Wholesome food. A brighter tomorrow.<span>REAL INGREDIENTS · REAL PARTNERSHIPS</span>
        </footer>
      </div>
      <FeedbackDrawer />
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>
          {title}
          <Leaf aria-hidden size={34} />
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </section>
  );
}
