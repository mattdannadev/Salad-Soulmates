'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { customerCreateHref, customerReturnContext } from './return-context';

function subscribeToLocation(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}

/** Include the current fragment, which server searchParams cannot observe. */
export default function CustomerCreateLink({ label, directoryHref }: {
  label: string;
  directoryHref: string;
}) {
  const origin = useSyncExternalStore(
    subscribeToLocation,
    () => `${window.location.pathname}${window.location.search}${window.location.hash}`,
    () => directoryHref,
  );
  const href = customerCreateHref(customerReturnContext(origin, undefined));
  return <Link className="button" href={href}>{label}</Link>;
}
