export function Badge({ children, tone }) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
}

export function SkeletonEmpty({ title, body }) {
  return (
    <div className="empty-state skeleton-state">
      <div className="skeleton-mark" />
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  );
}
