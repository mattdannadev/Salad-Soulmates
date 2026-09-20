'use client';

export default function PrintLabels() {
  return <button className="no-print" type="button" onClick={() => window.print()}>Print labels</button>;
}
