'use client';

import { useEffect } from 'react';

function openDetails(targetId: string) {
  const target = document.getElementById(targetId);
  if (target instanceof HTMLDetailsElement) target.open = true;
}

export default function SupplierDetailLink({
  supplierId,
  supplierName,
}: {
  supplierId: string;
  supplierName: string;
}) {
  const targetId = `supplier-${supplierId}`;

  useEffect(() => {
    const openLinkedDetails = () => {
      if (window.location.hash === `#${targetId}`) openDetails(targetId);
    };

    openLinkedDetails();
    window.addEventListener('hashchange', openLinkedDetails);
    return () => window.removeEventListener('hashchange', openLinkedDetails);
  }, [targetId]);

  return (
    <a
      aria-controls={targetId}
      href={`#${targetId}`}
      onClick={() => openDetails(targetId)}
    >
      <strong>{supplierName}</strong>
    </a>
  );
}
