export function Sidebar() {
  return (
    <aside className="flex h-full flex-col gap-4 overflow-auto p-3 text-sm">
      <section>
        <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Collections
        </h2>
        <p className="text-muted-foreground">No workspace open.</p>
      </section>
      <section>
        <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          History
        </h2>
        <p className="text-muted-foreground">Nothing yet.</p>
      </section>
    </aside>
  );
}
