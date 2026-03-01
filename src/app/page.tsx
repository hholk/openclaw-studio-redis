import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="max-w-3xl w-full">
        <h1 className="text-4xl font-bold mb-3">OpenClaw Studio Redis Deploy</h1>
        <p className="text-zinc-400 mb-8">
          Landing Page. Projekte laufen auf Unterseiten. Verbindung läuft über Redis-Bridge.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/projects/sidecar" className="rounded-xl border border-zinc-800 p-5 hover:border-zinc-600 transition">
            <div className="text-lg font-semibold mb-1">Sidecar Projekt</div>
            <div className="text-sm text-zinc-400">Subpage für das Sidecar-Projekt</div>
          </Link>

          <Link href="/studio" className="rounded-xl border border-zinc-800 p-5 hover:border-zinc-600 transition">
            <div className="text-lg font-semibold mb-1">Studio UI</div>
            <div className="text-sm text-zinc-400">Originales Studio Frontend (nah am Original)</div>
          </Link>
        </div>
      </div>
    </main>
  );
}
