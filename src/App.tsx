import { useEffect, useRef, useState } from "react";

import { AskAiDrawer } from "./components/AskAiDrawer";
import { OpenRouterDrawer } from "./components/OpenRouterDrawer";
import { PreparingDiagnostic } from "./components/PreparingDiagnostic";
import { TopBar } from "./components/layout/TopBar";
import { usePreload } from "./hooks/usePreload";
import { useSamplerStreaming } from "./hooks/useSamplerStreaming";
import type { ScreenId } from "./lib/navigation";
import { Configure } from "./screens/Configure";
import { Logs } from "./screens/Logs";
import { Power } from "./screens/Power";
import { Processes } from "./screens/Processes";
import { ResourceGraph } from "./screens/ResourceGraph";

function App() {
  const { ready, tasks, progress } = usePreload();
  const [screen, setScreen] = useState<ScreenId>("overview");
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [openRouterOpen, setOpenRouterOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  useSamplerStreaming();

  useEffect(() => {
    scrollerRef.current?.scrollTo(0, 0);
  }, [screen]);

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
          onSelect={(next) => {
            setScreen(next);
            setAskAiOpen(false);
            setOpenRouterOpen(false);
          }}
          onAskAi={() => setAskAiOpen((value) => !value)}
          askAiOpen={askAiOpen}
        />

        <main id="main">
          <div key={screen} className="screen-enter">
            {screen === "overview" ? (
              <ResourceGraph />
            ) : screen === "power" ? (
              <Power />
            ) : screen === "processes" ? (
              <Processes />
            ) : screen === "reliability" ? (
              <Logs view="reliability" />
            ) : screen === "events" ? (
              <Logs view="events" />
            ) : screen === "devices" ? (
              <Logs view="devices" />
            ) : (
              <Configure />
            )}
          </div>
        </main>
      </div>

      <AskAiDrawer
        open={askAiOpen}
        onClose={() => setAskAiOpen(false)}
        onOpenSettings={() => setOpenRouterOpen(true)}
        keyboardActive={!openRouterOpen}
      />

      <OpenRouterDrawer open={openRouterOpen} onClose={() => setOpenRouterOpen(false)} />
    </>
  );
}

export default App;
