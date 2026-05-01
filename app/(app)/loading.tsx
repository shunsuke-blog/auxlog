export default function Loading() {
  return (
    <div className="min-h-screen bg-white dark:bg-black px-6">
      <div className="pt-14 pb-4">
        <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-900 rounded-full mb-2 animate-pulse" />
        <div className="h-7 w-40 bg-zinc-100 dark:bg-zinc-900 rounded-full animate-pulse" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="px-6 py-5 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-900 animate-pulse">
            <div className="flex justify-between mb-3">
              <div>
                <div className="h-4 w-28 bg-zinc-100 dark:bg-zinc-900 rounded-full mb-1.5" />
                <div className="h-3 w-12 bg-zinc-100 dark:bg-zinc-900 rounded-full" />
              </div>
              <div className="h-6 w-16 bg-zinc-100 dark:bg-zinc-900 rounded-full" />
            </div>
            <div className="h-7 w-48 bg-zinc-100 dark:bg-zinc-900 rounded-full mb-2" />
            <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
