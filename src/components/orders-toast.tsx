'use client';

import { useEffect, useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

function readToast() {
  return window.sessionStorage.getItem('orders-toast') ?? '';
}

/** Shows the one-time confirmation left by the detail page after navigating back. */
export default function OrdersToast() {
  const message = useSyncExternalStore(emptySubscribe, readToast, () => '');

  useEffect(() => {
    if (message) window.sessionStorage.removeItem('orders-toast');
  }, [message]);

  return message ? <p className="order-toast" role="status">{message}</p> : null;
}
