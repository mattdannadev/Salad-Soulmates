'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { getVisibleNavigationDestinations, navigationLabel } from './navigation-registry';

/** Keyboard-first destination search; it never searches or reveals business records. */
export default function CommandPalette({
  locale,
  permissions,
}: {
  locale: 'en' | 'es';
  permissions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const es = locale === 'es';
  const destinations = getVisibleNavigationDestinations(permissions).filter((destination) => {
    const terms = [navigationLabel(destination, locale), ...destination.searchKeywords]
      .join(' ')
      .toLocaleLowerCase(locale);
    return terms.includes(query.trim().toLocaleLowerCase(locale));
  });
  const close = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape' && open) close();
      if (open && event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(destinations.length - 1, 0)));
      }
      if (open && event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
      if (open && event.key === 'Enter' && destinations[activeIndex]) {
        event.preventDefault();
        router.push(destinations[activeIndex].href);
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, destinations, open, router]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="command-palette-trigger"
        onClick={() => setOpen(true)}
        aria-label={es ? 'Abrir comandos' : 'Open commands'}
      >
        <Search size={17} aria-hidden />
        <span>{es ? 'Buscar una página' : 'Find a page'}</span>
        <kbd>⌘K</kbd>
      </button>
      {open && (
        <div className="command-palette-backdrop" role="presentation" onMouseDown={close}>
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label={es ? 'Comandos' : 'Commands'}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-palette-search">
              <Search size={18} aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={es ? 'Buscar destinos…' : 'Search destinations…'}
                aria-label={es ? 'Buscar destinos' : 'Search destinations'}
              />
              <button
                type="button"
                onClick={close}
                aria-label={es ? 'Cerrar comandos' : 'Close commands'}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <p>{es ? 'DESTINOS DISPONIBLES' : 'AVAILABLE DESTINATIONS'} <span>{destinations.length}</span></p>
            <ul>
              {destinations.map((destination, index) => {
                const Icon = destination.icon;
                return (
                <li key={destination.id}>
                  <button
                    type="button"
                    className={index === activeIndex ? 'is-active' : undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => {
                        router.push(destination.href);
                        close();
                      }}
                    >
                      <Icon size={18} aria-hidden />
                      <span>{navigationLabel(destination, locale)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!destinations.length && (
              <div className="command-palette-empty">
                {es ? 'No hay destinos disponibles.' : 'No destinations available.'}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
