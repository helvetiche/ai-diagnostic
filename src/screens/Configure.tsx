import { useEffect, useMemo, useState } from "react";

import {
  ArrowsClockwiseIcon,
  BatteryLowIcon,
  GameControllerIcon,
  GraphicsCardIcon,
  LightningIcon,
  ListBulletsIcon,
  ProhibitIcon,
  RocketIcon,
  ScalesIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { Screen } from "@/components/layout/Screen";
import { Button } from "@/components/primitives/Button";
import { Meter } from "@/components/primitives/Meter";
import { StateView } from "@/components/primitives/StateView";
import { invoke } from "@tauri-apps/api/core";
import { usePowerPlans } from "@/hooks/usePowerPlans";
import type { PowerPlan, StartupApp } from "@/types/configure";
import { cn } from "@/lib/utils";

type PlanTone = "success" | "blue" | "warning" | "critical";

const PLAN_ACTIVE_CLASS: Record<PlanTone, string> = {
  success: "bg-gradient-to-bl from-success/20 to-success/5 text-success",
  blue: "bg-gradient-to-bl from-blue-700/20 to-blue-700/5 text-blue-700 dark:from-blue-300/20 dark:to-blue-300/5 dark:text-blue-300",
  warning: "bg-gradient-to-bl from-warning/20 to-warning/5 text-warning",
  critical: "bg-gradient-to-bl from-critical/20 to-critical/5 text-critical",
};

function planIcon(level: number) {
  if (level === 0) {
    return BatteryLowIcon;
  }

  if (level === 1) {
    return ScalesIcon;
  }

  if (level === 3) {
    return RocketIcon;
  }

  return LightningIcon;
}

function planLevel(name: string): number {
  const value = name.toLowerCase();

  if (value.includes("saver") || value.includes("battery") || value.includes("low")) {
    return 0;
  }

  if (value.includes("balanced")) {
    return 1;
  }

  if (value.includes("ultimate")) {
    return 3;
  }

  if (value.includes("performance") || value.includes("high")) {
    return 2;
  }

  return 2;
}

function planTone(level: number): PlanTone {
  if (level === 0) {
    return "success";
  }

  if (level === 1) {
    return "blue";
  }

  if (level === 2) {
    return "warning";
  }

  return "critical";
}

function ConfigureSkeleton() {
  return (
    <Screen>
      <div aria-busy="true" className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="border border-border p-4">
            <div className="h-4 w-28 bg-surface-muted" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading power plans</span>
    </Screen>
  );
}

function useConfigureState() {
  const [brightness, setBrightness] = useState<number | null>(null);
  const [brightnessError, setBrightnessError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<boolean | null>(null);
  const [hags, setHags] = useState<boolean | null>(null);
  const [updatesPaused, setUpdatesPaused] = useState<boolean | null>(null);
  const [startupApps, setStartupApps] = useState<StartupApp[]>([]);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    invoke<number | null>("get_display_brightness")
      .then((value) => {
        if (!cancelled) {
          setBrightness(value);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setBrightnessError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    invoke<boolean | null>("get_game_mode")
      .then((value) => {
        if (!cancelled) {
          setGameMode(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGameMode(null);
        }
      });

    invoke<boolean | null>("get_hags")
      .then((value) => {
        if (!cancelled) {
          setHags(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHags(null);
        }
      });

    invoke<boolean>("get_windows_updates_paused")
      .then((value) => {
        if (!cancelled) {
          setUpdatesPaused(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUpdatesPaused(null);
        }
      });

    invoke<StartupApp[]>("get_startup_apps")
      .then((value) => {
        if (!cancelled) {
          setStartupApps(value);
          setStartupError(null);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setStartupApps([]);
          setStartupError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateBrightness(value: number) {
    setBrightness(value);
    void invoke("set_display_brightness", { value });
  }

  function toggleGameMode() {
    if (gameMode !== null) {
      const next = !gameMode;
      setGameMode(next);
      void invoke("set_game_mode", { enabled: next });
    }
  }

  function toggleHags() {
    if (hags !== null) {
      const next = !hags;
      setHags(next);
      void invoke("set_hags", { enabled: next });
    }
  }

  function toggleUpdates() {
    if (updatesPaused !== null) {
      const next = !updatesPaused;
      setUpdatesPaused(next);
      void invoke("set_windows_updates_paused", { paused: next });
    }
  }

  function toggleStartupApp(app: StartupApp) {
    const next = !app.enabled;
    setStartupApps((current) =>
      current.map((item) =>
        item.scope === app.scope && item.name === app.name ? { ...item, enabled: next } : item,
      ),
    );

    if (app.kind === "registry") {
      if (next) {
        void invoke("enable_startup_app", {
          scope: app.scope,
          name: app.name,
          command: app.command,
        });
      } else {
        void invoke("disable_startup_app", {
          scope: app.scope,
          name: app.name,
        });
      }
    } else {
      void invoke("toggle_startup_file", {
        path: app.path,
        enabled: next,
      });
    }
  }

  return {
    brightness,
    brightnessError,
    gameMode,
    hags,
    updatesPaused,
    startupApps,
    startupError,
    updateBrightness,
    toggleGameMode,
    toggleHags,
    toggleUpdates,
    toggleStartupApp,
  };
}

function ToggleSwitch({
  label,
  checked,
  disabled = false,
  tone = "primary",
  showState = false,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  tone?: "primary" | "critical";
  showState?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center border border-border transition-colors duration-[120ms] ease-soft",
        disabled && "disabled:cursor-not-allowed disabled:opacity-45",
        checked ? (tone === "critical" ? "bg-critical" : "bg-primary") : "bg-surface-muted",
      )}
    >
      {showState ? (
        <>
          <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-mono font-medium text-primary-foreground/80">
            {checked ? "ON" : ""}
          </span>
          <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-mono font-medium text-muted-foreground">
            {checked ? "" : "OFF"}
          </span>
        </>
      ) : null}
      <span
        className={cn(
          "inline-block h-4 w-4 bg-primary-foreground transition-transform duration-[120ms] ease-soft",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

function PowerPlansSection({
  plans,
  pendingGuid,
  onSelect,
}: {
  plans: PowerPlan[];
  pendingGuid: string | null;
  onSelect: (guid: string) => void;
}) {
  const sortedPlans = useMemo(() => {
    return [...plans].sort((left, right) => {
      const levelDifference = planLevel(left.name) - planLevel(right.name);
      if (levelDifference === 0) {
        return left.name.localeCompare(right.name);
      }
      return levelDifference;
    });
  }, [plans]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] font-medium text-foreground">
          {plans.find((plan) => plan.active)?.name ?? "No active plan"}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Power plan"
        className="grid divide-x divide-border border border-border"
        style={{
          gridTemplateColumns: `repeat(${Math.max(sortedPlans.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {sortedPlans.map((plan, index) => {
          const tone = planTone(planLevel(plan.name));
          const Icon = planIcon(planLevel(plan.name));

          return (
            <button
              key={plan.guid}
              type="button"
              role="radio"
              aria-checked={plan.active}
              onClick={() => {
                if (pendingGuid === null && !plan.active) {
                  onSelect(plan.guid);
                }
              }}
              className={cn(
                "relative flex min-h-12 flex-col items-start justify-center gap-1.5 px-3 text-[11px] font-medium transition-colors duration-[120ms] ease-soft",
                plan.active
                  ? cn("backdrop-blur-md", PLAN_ACTIVE_CLASS[tone])
                  : "bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon size={12} weight={plan.active ? "fill" : "regular"} aria-hidden="true" />
                {plan.name}
              </span>
              <Meter
                value={((index + 1) / Math.max(sortedPlans.length, 1)) * 100}
                tone={tone}
                segments={Math.max(sortedPlans.length, 1)}
                label={`${plan.name} performance`}
                className="w-full"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BrightnessSection({
  brightness,
  error,
  onChange,
}: {
  brightness: number | null;
  error: string | null;
  onChange: (value: number) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SunIcon size={14} aria-hidden="true" />
        <h2 className="text-[13px] font-medium text-foreground">Display brightness</h2>
      </div>

      {error ? (
        <p className="text-[11px] leading-4 text-critical">{error}</p>
      ) : (
        <div className={cn("border border-border p-4", brightness === null && "opacity-45")}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 text-[12px] font-medium text-foreground">
              {brightness === null ? (
                <>
                  <ProhibitIcon size={12} aria-hidden="true" />
                  Brightness Settings Unavailable
                </>
              ) : (
                `${brightness}%`
              )}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={brightness ?? 50}
            disabled={brightness === null}
            onChange={(event) => {
              if (brightness === null) {
                return;
              }

              onChange(Number(event.target.value));
            }}
            className="mt-3 h-2 w-full cursor-pointer appearance-none bg-surface-muted accent-primary disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Display brightness"
          />
        </div>
      )}
    </section>
  );
}

function PerformanceSection({
  gameMode,
  hags,
  onToggleGameMode,
  onToggleHags,
}: {
  gameMode: boolean | null;
  hags: boolean | null;
  onToggleGameMode: () => void;
  onToggleHags: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <GameControllerIcon size={14} aria-hidden="true" />
        <h2 className="text-[13px] font-medium text-foreground">Performance</h2>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border p-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-foreground">Game Mode</p>
            <p className="mt-1 max-w-xl text-[11px] leading-4 text-muted-foreground">
              Optimizes the system for gaming.
            </p>
          </div>
          <ToggleSwitch
            label="Game Mode"
            checked={gameMode === true}
            disabled={gameMode === null}
            showState
            onToggle={onToggleGameMode}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GraphicsCardIcon size={12} aria-hidden="true" />
              <p className="text-[12px] font-medium text-foreground">
                Hardware-accelerated GPU scheduling
              </p>
            </div>
            <p className="mt-1 max-w-xl text-[11px] leading-4 text-muted-foreground">
              May reduce latency. Requires a restart to apply.
            </p>
          </div>
          <ToggleSwitch
            label="Hardware-accelerated GPU scheduling"
            checked={hags === true}
            disabled={hags === null}
            showState
            onToggle={onToggleHags}
          />
        </div>
      </div>
    </section>
  );
}

function UpdatesSection({ paused, onToggle }: { paused: boolean | null; onToggle: () => void }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ArrowsClockwiseIcon size={14} aria-hidden="true" />
        <h2 className="text-[13px] font-medium text-foreground">Windows Update</h2>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border border-border p-4">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-foreground">
            {paused === null ? "Unknown" : paused ? "Paused" : "Active"}
          </p>
          <p className="mt-1 max-w-xl text-[11px] leading-4 text-muted-foreground">
            Pauses updates for 35 days.
          </p>
        </div>
        <ToggleSwitch
          label="Pause Windows updates"
          checked={paused === true}
          disabled={paused === null}
          tone="critical"
          showState
          onToggle={onToggle}
        />
      </div>
    </section>
  );
}

function StartupAppsSection({
  apps,
  error,
  onToggle,
}: {
  apps: StartupApp[];
  error: string | null;
  onToggle: (app: StartupApp) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ListBulletsIcon size={14} aria-hidden="true" />
        <h2 className="text-[13px] font-medium text-foreground">Startup apps</h2>
      </div>

      {error ? (
        <p className="text-[11px] leading-4 text-critical">{error}</p>
      ) : apps.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No startup entries found.</p>
      ) : (
        <div className="border border-border">
          {apps.map((app) => (
            <div
              key={`${app.scope}-${app.name}`}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                {app.icon ? (
                  <img
                    src={`data:image/png;base64,${app.icon}`}
                    alt=""
                    className="size-5 shrink-0"
                  />
                ) : null}
                <p className="truncate font-mono text-[12px] text-foreground">
                  {app.displayName || app.name}
                </p>
              </div>
              <ToggleSwitch
                label={`Toggle ${app.displayName || app.name}`}
                checked={app.enabled}
                onToggle={() => onToggle(app)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Configure() {
  const { plans, status, error, refresh, setActive, pendingGuid } = usePowerPlans();
  const {
    brightness,
    brightnessError,
    gameMode,
    hags,
    updatesPaused,
    startupApps,
    startupError,
    updateBrightness,
    toggleGameMode,
    toggleHags,
    toggleUpdates,
    toggleStartupApp,
  } = useConfigureState();

  useEffect(() => {
    document.title = "Windog - Configure";
  }, []);

  if (status === "loading" && plans.length === 0) {
    return <ConfigureSkeleton />;
  }

  if (status === "error" && plans.length === 0) {
    return (
      <Screen>
        <StateView
          title="Power plans unavailable"
          code={error ?? "Unknown error"}
          action={
            <Button variant="primary" onClick={refresh}>
              Try again
            </Button>
          }
        />
      </Screen>
    );
  }

  if (plans.length === 0) {
    return (
      <Screen>
        <StateView title="No power plans found" />
      </Screen>
    );
  }

  return (
    <Screen>
      <h1 className="sr-only">Configure</h1>

      <PowerPlansSection plans={plans} pendingGuid={pendingGuid} onSelect={setActive} />
      <BrightnessSection
        brightness={brightness}
        error={brightnessError}
        onChange={updateBrightness}
      />
      <PerformanceSection
        gameMode={gameMode}
        hags={hags}
        onToggleGameMode={toggleGameMode}
        onToggleHags={toggleHags}
      />
      <UpdatesSection paused={updatesPaused} onToggle={toggleUpdates} />
      <StartupAppsSection apps={startupApps} error={startupError} onToggle={toggleStartupApp} />
    </Screen>
  );
}
