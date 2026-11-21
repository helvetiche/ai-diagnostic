import { useEffect, useState } from "react";

import { Screen, PageHeader } from "@/components/layout/Screen";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";
import { StateView } from "@/components/primitives/StateView";
import { StatusMark } from "@/components/primitives/StatusMark";
import { usePowerPlans } from "@/hooks/usePowerPlans";
import { usePowerSettings } from "@/hooks/usePowerSettings";
import type { PowerTimeouts } from "@/types/configure";
import { cn } from "@/lib/utils";

const NUMBER_CLASS =
  "h-10 w-full rounded-control bg-surface-muted px-2.5 font-mono text-[11px] tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function ConfigureSkeleton() {
  return (
    <Screen>
      <div aria-busy="true" className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="mt-4 h-10 w-28" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading power plans</span>
    </Screen>
  );
}

export function Configure() {
  const { plans, status, error, refresh, setActive, pendingGuid } = usePowerPlans();
  const settings = usePowerSettings();
  const [draft, setDraft] = useState<PowerTimeouts | null>(null);

  useEffect(() => {
    document.title = "Windog - Configure";
  }, []);

  useEffect(() => {
    if (settings.timeouts) {
      setDraft(settings.timeouts);
    }
  }, [settings.timeouts]);

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
      {error ? (
        <div className="border border-critical bg-critical-soft p-4">
          <p className="text-[12px] font-medium text-critical">The change failed</p>
          <p className="mt-1 text-[11px] leading-4 text-critical">{error}</p>
        </div>
      ) : null}

      <PageHeader title="Configure">
        <StatusMark tone="muted">Windows power plans</StatusMark>
      </PageHeader>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Power plan</h2>
          <span className="text-[11px] text-muted-foreground">Applies to this PC</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => {
            const busy = pendingGuid === plan.guid;

            return (
              <article
                key={plan.guid}
                className={cn(
                  "flex flex-col gap-4 border p-4",
                  plan.active ? "border-primary bg-accent" : "border-border bg-surface",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-medium text-foreground">{plan.name}</h3>
                    <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {plan.guid}
                    </p>
                  </div>
                  {plan.active ? (
                    <StatusMark tone="success" labelTone>
                      Active
                    </StatusMark>
                  ) : null}
                </div>

                <Button
                  variant={plan.active ? "quiet" : "primary"}
                  size="md"
                  disabled={plan.active || pendingGuid !== null}
                  onClick={() => void setActive(plan.guid)}
                >
                  {busy ? "Applying" : plan.active ? "Active" : "Set active"}
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Power timeouts</h2>
          <span className="text-[11px] text-muted-foreground">Minutes. 0 means never.</span>
        </div>

        {settings.status === "loading" && !settings.timeouts ? (
          <div aria-busy="true" className="border border-border p-4">
            <Skeleton className="h-4 w-40" />
          </div>
        ) : settings.status === "error" && !settings.timeouts ? (
          <div className="border border-critical bg-critical-soft p-4">
            <p className="text-[12px] font-medium text-critical">Timeouts unavailable</p>
            <p className="mt-1 text-[11px] leading-4 text-critical">
              {settings.error ?? "Unknown error"}
            </p>
          </div>
        ) : draft ? (
          <div className="border border-border p-4">
            {settings.error ? (
              <p className="mb-3 text-[11px] leading-4 text-critical">{settings.error}</p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Display off", "monitorAc", "monitorDc"],
                  ["Disk off", "diskAc", "diskDc"],
                  ["Sleep", "standbyAc", "standbyDc"],
                  ["Hibernate", "hibernateAc", "hibernateDc"],
                ] as const
              ).map(([label, acKey, dcKey]) => (
                <div key={label} className="flex flex-col gap-2">
                  <p className="text-[11px] font-medium text-foreground">{label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Plugged in
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={10_000}
                        value={draft[acKey as keyof PowerTimeouts]}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  [acKey]: Number.isNaN(parsed) ? 0 : parsed,
                                }
                              : current,
                          );
                        }}
                        className={cn(NUMBER_CLASS, "mt-1")}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        On battery
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={10_000}
                        value={draft[dcKey as keyof PowerTimeouts]}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  [dcKey]: Number.isNaN(parsed) ? 0 : parsed,
                                }
                              : current,
                          );
                        }}
                        className={cn(NUMBER_CLASS, "mt-1")}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="primary"
                disabled={settings.savingTimeouts || !draft}
                onClick={() => {
                  if (draft) {
                    void settings.saveTimeouts(draft);
                  }
                }}
              >
                {settings.savingTimeouts ? "Applying" : "Apply timeouts"}
              </Button>
              <Button
                variant="quiet"
                disabled={settings.savingTimeouts || !settings.timeouts}
                onClick={() => {
                  if (settings.timeouts) {
                    setDraft(settings.timeouts);
                  }
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-medium text-foreground">Fast Startup</h2>
          <span className="text-[11px] text-muted-foreground">Hybrid shutdown</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-border p-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-foreground">
              {settings.fastStartup === null ? "Unknown" : settings.fastStartup ? "On" : "Off"}
            </p>
            <p className="mt-1 max-w-xl text-[11px] leading-4 text-muted-foreground">
              Fast Startup saves kernel state on shutdown. It can make dual-boot and some driver
              issues harder to clear.
            </p>
          </div>
          <Button
            variant={settings.fastStartup ? "danger" : "primary"}
            disabled={settings.savingFastStartup || settings.fastStartup === null}
            onClick={() => {
              if (settings.fastStartup !== null) {
                void settings.setFastStartup(!settings.fastStartup);
              }
            }}
          >
            {settings.savingFastStartup
              ? "Applying"
              : settings.fastStartup
                ? "Turn off"
                : "Turn on"}
          </Button>
        </div>
      </section>
    </Screen>
  );
}
