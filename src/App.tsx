import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { useSamplerStreaming } from "./hooks/useSamplerStreaming";
import { Processes } from "./screens/Processes";
import { ResourceGraph } from "./screens/ResourceGraph";
import { Thermals } from "./screens/Thermals";

function PendingScreen({ label }: { label: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-8">
      <header>
        <p className="text-[11px] leading-4 font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Workspace
        </p>
        <h1 className="mt-1 text-2xl leading-8 font-semibold tracking-[-0.02em] text-foreground">
          {label}
        </h1>
      </header>

      <section className="bg-surface p-5">
        <p className="max-w-lg text-xs leading-5 text-muted-foreground">
          This screen is not built yet. Resource Graph, Thermals, and Processes have live data in
          this pass.
        </p>
      </section>
    </div>
  );
}

function App() {
  const [activeLabel, setActiveLabel] = useState("Resource Graph");
  useSamplerStreaming();

  return (
    <div className="relative flex h-full bg-background">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full text-muted-foreground opacity-20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="windog-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#windog-grid)" />
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, color-mix(in srgb, var(--foreground) 18%, transparent) 100%)",
        }}
      />
      <Sidebar activeLabel={activeLabel} onSelect={setActiveLabel} />
      <main className="relative z-10 min-w-0 flex-1 overflow-y-auto">
        {activeLabel === "Resource Graph" ? (
          <ResourceGraph onOpenThermals={() => setActiveLabel("Thermals")} />
        ) : activeLabel === "Thermals" ? (
          <Thermals />
        ) : activeLabel === "Processes" ? (
          <Processes />
        ) : (
          <PendingScreen label={activeLabel} />
        )}
      </main>
    </div>
  );
}

export default App;
