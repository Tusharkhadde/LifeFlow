export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">You&apos;re offline</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          LifeFlow can still capture notes, tasks, and expenses. They remain on this device and sync when your connection returns.
        </p>
      </div>
    </main>
  );
}
