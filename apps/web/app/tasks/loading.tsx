// apps/web/app/tasks/loading.tsx
//
// Route-level skeleton for /tasks — shimmer rows in the shape of the real
// list, so navigation feels instant instead of showing a generic spinner.

export default function LoadingTasks() {
  return (
    <div className="page-content" aria-busy="true" aria-label="Loading tasks">
      <div className="skel skel-title" />
      <div className="skel skel-sub" />
      <div className="card mt-4 p-0 overflow-hidden">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skel-row">
            <span className="skel skel-dot" />
            <span className="skel skel-bar" style={{ width: `${34 + ((i * 17) % 38)}%` }} />
            <span className="skel skel-chip" />
            <span className="skel skel-chip sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
