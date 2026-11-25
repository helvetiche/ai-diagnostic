import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { AskAiDrawer } from "./components/AskAiDrawer";
import { OpenRouterDrawer } from "./components/OpenRouterDrawer";
import { PreparingDiagnostic } from "./components/PreparingDiagnostic";
import { TopBar } from "./components/layout/TopBar";
import { usePreload } from "./hooks/usePreload";
import { useSamplerStreaming } from "./hooks/useSamplerStreaming";
import type { ScreenId } from "./lib/navigation";

const Configure = lazy(() =>
  import("./screens/Configure").then((module) => ({ default: module.Configure })),
);
const Logs = lazy(() => import("./screens/Logs").then((module) => ({ default: module.Logs })));
const Power = lazy(() => import("./screens/Power").then((module) => ({ default: module.Power })));
const Processes = lazy(() =>
  import("./screens/Processes").then((module) => ({ default: module.Processes })),
);
const ResourceGraph = lazy(() =>
  import("./screens/ResourceGraph").then((module) => ({ default: module.ResourceGraph })),
);

const LOG_VIEWS: Partial<Record<ScreenId, "reliability" | "events" | "devices">> = {
  reliability: "reliability",
  events: "events",
  devices: "devices",
};

function ScreenContent({ screen }: { screen: ScreenId }) {
  const logView = LOG_VIEWS[screen];
  if (logView) {
    return <Logs view={logView} />;
  }
  if (screen === "overview") {
    return <ResourceGraph />;
  }
  if (screen === "power") {
    return <Power />;
  }
  if (screen === "processes") {
    return <Processes />;
  }
  return <Configure />;
}

function App() {
  const { ready, tasks, progress } = usePreload();
  const [screen, setScreen] = useState<ScreenId>("overview");
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [askAiSession, setAskAiSession] = useState(0);
  const [openRouterOpen, setOpenRouterOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  useSamplerStreaming();

  useEffect(() => {
    scrollerRef.current?.scrollTo(0, 0);
  }, [screen]);

  function handleSelect(next: ScreenId) {
    setScreen(next);
    setAskAiOpen(false);
    setOpenRouterOpen(false);
  }

  function handleAskAi() {
    if (!askAiOpen) {
      setAskAiSession((value) => value + 1);
    }
    setAskAiOpen((value) => !value);
  }

  if (!ready) {
    return <PreparingDiagnostic tasks={tasks} progress={progress} />;
  }

  return (
    <>
      <div ref={scrollerRef} className="app-canvas h-full overflow-y-auto overscroll-y-none">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-[12px] focus:font-medium focus:text-foreground focus:shadow-soft"
        >
          Skip to content
        </a>

        <TopBar
          active={screen}
          onSelect={handleSelect}
          onAskAi={handleAskAi}
          askAiOpen={askAiOpen}
        />

        <main id="main">
          <div key={screen} className="screen-enter">
            <Suspense fallback={null}>
              <ScreenContent screen={screen} />
            </Suspense>
          </div>
        </main>
      </div>

      {askAiSession > 0 ? (
        <AskAiDrawer
          open={askAiOpen}
          onClose={() => setAskAiOpen(false)}
          onOpenSettings={() => setOpenRouterOpen(true)}
          keyboardActive={!openRouterOpen}
        />
      ) : null}

      <OpenRouterDrawer open={openRouterOpen} onClose={() => setOpenRouterOpen(false)} />
    </>
  );
}

export default App;
