"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { LiveSnapshot } from "@/lib/live";
import { refreshLiveSnapshot } from "@/app/live-view/actions";
import { Card } from "@/components/ui";

// WebGL — there is nothing to render on the server, and cobe touches `document`
// at import time, so keep it out of the SSR pass entirely.
const Globe = dynamic(() => import("@/components/Globe"), {
  ssr: false,
  loading: () => <div className="aspect-square w-full max-w-2xl" />,
});

const POLL_MS = 10_000;

/** Session length as m:ss, or h:mm:ss once it runs past an hour. */
function duration(seconds: number): string {
  const s = Math.max(0, seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

/** "google.com" — the bare host, which is all a referrer needs to say. */
function refHost(referrer: string): string {
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return referrer;
  }
}

/** "now" / "12s ago" / "3m ago" — how long since a visitor's last page view. */
function relTime(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** "Just now" / "12s ago" — how stale the numbers on screen are. */
function useAge(takenAt: string) {
  const [age, setAge] = useState(0);
  useEffect(() => {
    const tick = () =>
      setAge(Math.max(0, Math.round((Date.now() - Date.parse(takenAt)) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [takenAt]);
  return age;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1.5 font-serif text-3xl text-foreground">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted/70">{hint}</p>}
    </Card>
  );
}

/** Sessions per hour across the window. Flat line when there's no traffic yet. */
function Sparkline({ data }: { data: number[] }) {
  const peak = Math.max(1, ...data);
  return (
    <div className="flex h-12 items-end gap-[3px]">
      {data.map((n, i) => (
        <div
          key={i}
          title={`${n} session${n === 1 ? "" : "s"}`}
          style={{ height: `${Math.max(3, (n / peak) * 100)}%` }}
          className={`flex-1 rounded-sm transition-all duration-500 ${n > 0 ? "bg-gold-400" : "bg-border"}`}
        />
      ))}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs uppercase tracking-widest text-muted">{title}</p>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function LiveView({ initial }: { initial: LiveSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [stale, setStale] = useState(false);
  const age = useAge(snap.takenAt);

  // Which session cards have their journey expanded.
  // Held separately from `snap` so an open card stays open across polls.
  const [openSessions, setOpenSessions] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleSession = (id: string) =>
    setOpenSessions((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await refreshLiveSnapshot();
        if (!cancelled) {
          setSnap(next);
          setStale(false);
        }
      } catch {
        if (!cancelled) setStale(true);
      }
    };

    // Skip polls while the tab is hidden — catch up the moment it returns.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Listen for instant local telemetry from storefront tabs via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        bc = new BroadcastChannel("eloris_live_analytics");
        bc.onmessage = (event) => {
          if (event.data?.type === "PAGE_VIEW") {
            const data = event.data;
            setSnap((prev) => {
              const existingIdx = prev.liveSessions.findIndex(
                (s) => s.id === data.session.id,
              );
              let updatedSessions = [...prev.liveSessions];
              if (existingIdx >= 0) {
                const existing = updatedSessions[existingIdx];
                const newJourney = [
                  ...existing.journey,
                  { path: data.path, at: data.viewedAt },
                ].slice(-20);
                updatedSessions[existingIdx] = {
                  ...existing,
                  lastAt: data.viewedAt,
                  exitPath: data.path,
                  views: existing.views + 1,
                  live: true,
                  journey: newJourney,
                };
              } else {
                updatedSessions.unshift({
                  id: data.session.id,
                  live: true,
                  isNew: data.session.is_new,
                  location: `${data.session.city}, ${data.session.country}`,
                  entryPath: data.session.entry_path,
                  exitPath: data.path,
                  durationSeconds: data.session.duration_seconds || 1,
                  views: 1,
                  referrer: data.session.referrer || null,
                  device: data.session.device_type,
                  browser: data.session.browser,
                  os: data.session.os,
                  utmSource: null,
                  utmMedium: null,
                  utmCampaign: null,
                  lastAt: data.viewedAt,
                  journey: [{ path: data.path, at: data.viewedAt }],
                  identity: null,
                });
              }
              return {
                ...prev,
                takenAt: new Date().toISOString(),
                visitorsNow: Math.max(
                  prev.visitorsNow,
                  updatedSessions.filter((s) => s.live).length,
                ),
                liveSessions: updatedSessions,
              };
            });
          }
        };
      }
    } catch {
      // BroadcastChannel optional
    }

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      if (bc) bc.close();
    };
  }, []);

  const totalVisitors = snap.newVisitors + snap.returningVisitors;
  const newPct = totalVisitors
    ? Math.round((snap.newVisitors / totalVisitors) * 100)
    : 0;
  const peakLocation = snap.byLocation[0]?.sessions || 1;

  return (
    // Desktop: fixed-height two-pane, only the left column scrolls.
    // Mobile: normal stacked page with the globe on top.
    <div className="flex flex-col lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">

      {/* ── Left pane — metrics ─────────────────────────────────────────── */}
      <aside className="w-full shrink-0 space-y-4 px-5 py-6 lg:w-[430px] lg:overflow-y-auto lg:border-r lg:border-border">

        {/* Header */}
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-serif text-3xl text-foreground">Live View</h1>
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted">
              <span
                className={`h-2 w-2 rounded-full ${
                  stale ? "bg-neutral-300" : "animate-pulse bg-gold-500"
                }`}
              />
              {stale ? "Reconnecting…" : age < 5 ? "Just now" : `${age}s ago`}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Who is on the storefront right now.
          </p>
        </div>

        {/* Migration notice */}
        {!snap.eventsReady && (
          <Card className="border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm text-amber-800">
              Visitor tracking isn&apos;t live yet — the{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs">
                page_views
              </code>{" "}
              table is missing. Run the analytics migrations in Supabase and
              deploy the storefront. Orders, sales and bags below are already
              real.
            </p>
          </Card>
        )}

        {/* Headline stats */}
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Visitors now"  value={snap.visitorsNow}  hint="Active in last 5m" />
          <Stat label="Total revenue" value={snap.totalSales}   hint="Invoices & Subscriptions (24h)" />
          <Stat label="Live Sessions" value={snap.sessions}     hint="Last 24h" />
          <Stat label="Invoices (24h)" value={snap.orders}      hint="Total invoices created" />
        </div>

        {/* Invoice breakdown */}
        <Panel title="Invoice activity & status (24h)">
          <div className="grid grid-cols-3 divide-x divide-border">
            {[
              { label: "Draft invoices", value: snap.activeBags  },
              { label: "Sent / Pending", value: snap.checkingOut },
              { label: "Paid & Settled", value: snap.purchased   },
            ].map((s, i) => (
              <div key={s.label} className={i === 0 ? "pr-3" : "px-3"}>
                <p className="text-[11px] text-muted">{s.label}</p>
                <p className="mt-1 font-serif text-2xl text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* Sessions by hour */}
        <Panel title="Sessions by hour">
          <Sparkline data={snap.sessionsByHour} />
          <p className="mt-2 text-[11px] text-muted/70">24 hours ago → now</p>
        </Panel>

        {/* Sessions by location */}
        <Panel title="Sessions by location">
          <ul className="space-y-3">
            {snap.byLocation.map((l) => (
              <li key={l.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-foreground">{l.label}</span>
                  <span className="ml-3 shrink-0 text-muted">{l.sessions}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-border">
                  <div
                    className="h-1 rounded-full bg-gold-400 transition-all duration-700"
                    style={{ width: `${(l.sessions / peakLocation) * 100}%` }}
                  />
                </div>
              </li>
            ))}
            {snap.byLocation.length === 0 && (
              <li className="text-sm text-muted">No sessions yet.</li>
            )}
          </ul>
        </Panel>

        {/* New vs returning */}
        <Panel title="New vs returning">
          {totalVisitors > 0 ? (
            <>
              <div className="flex h-2 overflow-hidden rounded-full bg-border">
                <div
                  className="bg-gold-500 transition-all duration-700"
                  style={{ width: `${newPct}%` }}
                  aria-hidden
                />
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span className="text-foreground">
                  New <span className="text-muted">· {snap.newVisitors}</span>
                </span>
                <span className="text-foreground">
                  Returning <span className="text-muted">· {snap.returningVisitors}</span>
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No visitors yet.</p>
          )}
        </Panel>

        {/* Live activity feed */}
        <Panel title="Live activity">
          <ul className="space-y-3">
            {snap.liveSessions.map((s) => {
              const isOpen = openSessions.has(s.id);
              const device   = [s.device, s.browser, s.os].filter(Boolean).join(" · ");
              const campaign = [
                [s.utmSource, s.utmMedium].filter(Boolean).join(" / "),
                s.utmCampaign,
              ].filter(Boolean).join(" · ");

              return (
                <li
                  key={s.id}
                  className="rounded-lg border border-border bg-surface/40 px-4 py-3"
                >
                  {/* Session header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            s.live ? "animate-pulse bg-gold-500" : "bg-neutral-300"
                          }`}
                        />
                        <span className="truncate text-sm text-foreground">
                          {s.identity?.name ||
                            s.identity?.email ||
                            s.location ||
                            "Unknown location"}
                        </span>
                        {s.identity && (
                          <span className="shrink-0 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold-600">
                            Customer
                          </span>
                        )}
                      </div>

                      {/* Identity details — only for signed-in customers */}
                      {s.identity && (
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted">
                          {s.identity.email && s.identity.name && (
                            <p className="truncate">{s.identity.email}</p>
                          )}
                          {s.identity.phone   && <p>{s.identity.phone}</p>}
                          {s.identity.address && <p className="truncate">{s.identity.address}</p>}
                        </div>
                      )}

                      <p className="mt-1 text-[11px] text-muted">
                        {s.isNew ? "New visitor" : "Returning visitor"}
                        {s.identity && s.location ? ` · ${s.location}` : ""}
                      </p>
                    </div>

                    <span className="shrink-0 text-[11px] text-muted">
                      {relTime(s.lastAt)}
                    </span>
                  </div>

                  {/* Session metadata grid */}
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                    <dt className="text-muted">Entry</dt>
                    <dd className="truncate text-foreground">{s.entryPath}</dd>
                    <dt className="text-muted">Exit</dt>
                    <dd className="truncate text-foreground">{s.exitPath}</dd>
                    <dt className="text-muted">Duration</dt>
                    <dd className="text-foreground">
                      {duration(s.durationSeconds)} · {s.views}{" "}
                      {s.views === 1 ? "page" : "pages"}
                    </dd>
                    {s.referrer && (
                      <>
                        <dt className="text-muted">Referrer</dt>
                        <dd className="truncate text-foreground">{refHost(s.referrer)}</dd>
                      </>
                    )}
                    {device && (
                      <>
                        <dt className="text-muted">Device</dt>
                        <dd className="truncate text-foreground">{device}</dd>
                      </>
                    )}
                    {campaign && (
                      <>
                        <dt className="text-muted">Campaign</dt>
                        <dd className="truncate text-foreground">{campaign}</dd>
                      </>
                    )}
                  </dl>

                  {/* Expandable journey */}
                  {isOpen && (
                    <>
                      <ol className="mt-3 space-y-1.5 border-l border-border pl-3">
                        {s.journey.map((v, i) => (
                          <li
                            key={`${v.at}-${i}`}
                            className="flex items-center justify-between gap-3 text-[13px]"
                          >
                            <span className="truncate text-foreground">{v.path}</span>
                            <span
                              suppressHydrationWarning
                              className="shrink-0 text-[11px] text-muted"
                            >
                              {new Date(v.at).toLocaleTimeString()}
                            </span>
                          </li>
                        ))}
                      </ol>
                      {s.views > s.journey.length && (
                        <p className="mt-2 text-[10px] text-muted/70">
                          Showing the last {s.journey.length} of {s.views} pages.
                        </p>
                      )}
                    </>
                  )}

                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => toggleSession(s.id)}
                      aria-expanded={isOpen}
                      className="text-[11px] text-gold-600 transition-colors hover:text-gold-500"
                    >
                      {isOpen ? "Hide details" : "More details"}
                    </button>
                  </div>
                </li>
              );
            })}

            {snap.liveSessions.length === 0 && (
              <li className="py-2 text-sm text-muted">No page views yet.</li>
            )}
          </ul>
        </Panel>
      </aside>

      {/* ── Right pane — globe ──────────────────────────────────────────── */}
      <div className="relative flex min-h-[450px] flex-1 items-center justify-center bg-white p-4 lg:min-h-0 lg:p-8">
        <div className="flex aspect-square w-full h-full max-w-[800px] max-h-[800px] items-center justify-center">
          <Globe points={snap.points} />
        </div>

        {/* Legend */}
        <div className="absolute bottom-5 right-5 flex flex-wrap justify-end gap-2">
          {[
            { label: "Visitors right now", dot: "bg-gold-500" },
            { label: "Sessions · 24h",     dot: "bg-neutral-400" },
          ].map((l) => (
            <span
              key={l.label}
              className="flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 text-[11px] text-muted backdrop-blur"
            >
              <span className={`h-2 w-2 rounded-full ${l.dot}`} />
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
