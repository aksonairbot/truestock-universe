// apps/web/app/projects/loading.tsx
//
// Route-level skeleton for /projects — card ghosts in the real grid shape.

export default function LoadingProjects() {
  return (
    <div className="page-content" aria-busy="true" aria-label="Loading projects">
      <div className="skel skel-title" />
      <div className="skel skel-sub" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skel skel-card" />
        ))}
      </div>
    </div>
  );
}
