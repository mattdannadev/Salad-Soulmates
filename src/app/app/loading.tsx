export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-label="Loading page">
      <span className="route-progress" />
      <span className="skeleton skeleton-label" />
      <span className="skeleton skeleton-title" />
      <span className="skeleton skeleton-copy" />
      <span className="skeleton skeleton-panel" />
    </div>
  );
}
