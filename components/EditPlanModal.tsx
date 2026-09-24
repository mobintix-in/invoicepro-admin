"use client";

import { useState, useMemo } from "react";
import { formatDuration, type Package } from "@/lib/packages";
import type { UserRow, UpdateSubscriptionParams } from "@/lib/account";

interface EditPlanModalProps {
  user: UserRow;
  packages: Package[];
  onClose: () => void;
  onSave: (params: UpdateSubscriptionParams) => Promise<void>;
}

// Fallback packages if database fetch is empty
const DEFAULT_PACKAGES: Partial<Package>[] = [
  {
    id: "1",
    key: "monthly",
    name: "1 Month Plan",
    durationMonths: 1,
    priceInr: 299,
    active: true,
  },
  {
    id: "2",
    key: "half-yearly",
    name: "6 Months Plan",
    durationMonths: 6,
    priceInr: 1499,
    active: true,
  },
  {
    id: "3",
    key: "yearly",
    name: "1 Year Plan",
    durationMonths: 12,
    priceInr: 2699,
    active: true,
  },
];

function addMonthsClamped(base: Date, months: number): Date {
  const result = new Date(base);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

function formatDateDisplay(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(d);
}

function toDateInputFormat(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function EditPlanModal({
  user,
  packages,
  onClose,
  onSave,
}: EditPlanModalProps) {
  // Use packages fetched directly from the database
  const activePackages = useMemo(() => {
    const list =
      packages && packages.length > 0
        ? packages.filter((p) => p.active)
        : DEFAULT_PACKAGES;
    return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [packages]);

  const hasFutureExpiry = useMemo(() => {
    if (!user.expiresAt) return false;
    return new Date(user.expiresAt).getTime() > Date.now();
  }, [user.expiresAt]);

  // Determine initial selected package
  const initialPackage = useMemo(() => {
    if (user.planKey) {
      const match = activePackages.find((p) => p.key === user.planKey);
      if (match) return match;
    }
    if (user.planMonths) {
      const match = activePackages.find(
        (p) => p.durationMonths === user.planMonths,
      );
      if (match) return match;
    }
    return activePackages[0] || null;
  }, [user.planKey, user.planMonths, activePackages]);

  const [isManualMode, setIsManualMode] = useState(false);
  const [selectedPackageKey, setSelectedPackageKey] = useState<string>(
    initialPackage?.key || "monthly",
  );
  const [manualMonths, setManualMonths] = useState<number>(
    user.planMonths && user.planMonths > 0 ? user.planMonths : 1,
  );
  const [manualMonthsText, setManualMonthsText] = useState<string>(
    user.planMonths ? String(user.planMonths) : "1",
  );

  const selectedPackage = useMemo(() => {
    return activePackages.find((p) => p.key === selectedPackageKey) || null;
  }, [activePackages, selectedPackageKey]);

  const effectiveMonths = isManualMode
    ? manualMonths
    : selectedPackage?.durationMonths || 1;
  const effectivePlanKey = isManualMode
    ? selectedPackageKey || "monthly"
    : selectedPackage?.key || "monthly";

  const [calcMode, setCalcMode] = useState<"today" | "extend" | "custom">(
    hasFutureExpiry ? "extend" : "today",
  );
  const [customDate, setCustomDate] = useState<string>(() => {
    const d = addMonthsClamped(new Date(), effectiveMonths);
    return toDateInputFormat(d);
  });
  const [status, setStatus] = useState<"active" | "expired">("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSelectPackage(pkg: Partial<Package>) {
    setIsManualMode(false);
    if (pkg.key) setSelectedPackageKey(pkg.key);
    if (pkg.durationMonths) {
      setManualMonths(pkg.durationMonths);
      setManualMonthsText(String(pkg.durationMonths));
    }
  }

  function handleSelectManual() {
    setIsManualMode(true);
  }

  function handleManualMonthsChange(val: string) {
    setManualMonthsText(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setManualMonths(num);
    }
  }

  function handleQuickManualPreset(months: number) {
    setIsManualMode(true);
    setManualMonths(months);
    setManualMonthsText(String(months));
  }

  const previewExpiry = useMemo<Date>(() => {
    if (calcMode === "custom" && customDate) {
      const parts = customDate.split("-").map(Number);
      if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
      }
    }

    const now = new Date();
    if (calcMode === "extend" && user.expiresAt && hasFutureExpiry) {
      const base = new Date(user.expiresAt);
      return addMonthsClamped(base, effectiveMonths);
    }

    return addMonthsClamped(now, effectiveMonths);
  }, [calcMode, customDate, effectiveMonths, user.expiresAt, hasFutureExpiry]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      let finalExpiresAt: string | null = null;
      let extendFromCurrent = false;

      if (status === "expired") {
        finalExpiresAt = new Date().toISOString();
      } else if (calcMode === "custom") {
        finalExpiresAt = previewExpiry.toISOString();
      } else if (calcMode === "extend") {
        extendFromCurrent = true;
      }

      await onSave({
        userId: user.userId,
        planMonths: effectiveMonths,
        planKey: effectivePlanKey,
        status,
        expiresAt: finalExpiresAt,
        extendFromCurrent,
        currentExpiresAt: user.expiresAt,
      });

      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update subscription",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Manage User Plan
              </h2>
              <p className="text-xs text-gray-500">
                {user.fullName || "User"} &bull;{" "}
                <span className="font-mono text-gray-600">{user.email}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* User Current Plan Pill Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2 text-xs">
            <div>
              <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">
                Current:{" "}
              </span>
              <span className="font-medium text-gray-900 capitalize">
                {user.planKey || "None"}{" "}
                {user.planMonths ? `(${formatDuration(user.planMonths)})` : ""}
              </span>
            </div>
            <div>
              <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">
                Expires:{" "}
              </span>
              <span className="font-medium text-gray-900">
                {formatDateDisplay(user.expiresAt)}
              </span>
            </div>
          </div>

          {/* Section: Dynamic Database Packages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                Select Package
              </label>
              <span className="text-[11px] text-gray-400">
                {activePackages.length} package
                {activePackages.length === 1 ? "" : "s"} loaded
              </span>
            </div>

            {/* Grid of Dynamic Packages fetched from Database */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activePackages.map((pkg) => {
                const isSelected =
                  !isManualMode && selectedPackageKey === pkg.key;
                return (
                  <button
                    key={pkg.key}
                    type="button"
                    onClick={() => handleSelectPackage(pkg)}
                    className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-600/30"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5 w-full">
                      <span className="font-bold text-gray-900 text-xs">
                        {pkg.name}
                      </span>
                      <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 shrink-0">
                        {pkg.durationMonths
                          ? formatDuration(pkg.durationMonths)
                          : "Custom"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-600 w-full">
                      <span className="font-semibold text-indigo-600">
                        ₹{(pkg.priceInr ?? 0).toLocaleString("en-IN")}
                      </span>
                      <span className="text-[10px] text-gray-400 capitalize font-mono">
                        {pkg.key}
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* Direct Manual / Custom Creation Option */}
              <button
                type="button"
                onClick={handleSelectManual}
                className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                  isManualMode
                    ? "border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-600/30"
                    : "border-dashed border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start justify-between gap-1.5 w-full">
                  <span className="font-bold text-gray-900 text-xs">
                    Custom / Manual
                  </span>
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700 shrink-0">
                    Manual
                  </span>
                </div>
                <div className="mt-2 text-xs text-indigo-600 font-semibold">
                  Custom months &rarr;
                </div>
              </button>
            </div>

            {/* Manual Duration Controls (Expanded when Custom / Manual is selected) */}
            {isManualMode && (
              <div className="mt-2.5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-800">
                    Manual Duration in Months:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={manualMonthsText}
                      onChange={(e) => handleManualMonthsChange(e.target.value)}
                      className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-bold text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-gray-600">
                      months
                    </span>
                  </div>
                </div>

                {/* Quick Month Chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-gray-500">Quick set:</span>
                  {[1, 2, 3, 6, 12, 24].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleQuickManualPreset(m)}
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition ${
                        manualMonths === m
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {m} {m === 1 ? "mo" : "mos"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-indigo-100">
                  <label
                    htmlFor="custom-plan-key"
                    className="text-[11px] text-gray-500 shrink-0"
                  >
                    Package Key:
                  </label>
                  <select
                    id="custom-plan-key"
                    value={selectedPackageKey}
                    onChange={(e) => setSelectedPackageKey(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 outline-none focus:border-indigo-500"
                  >
                    {activePackages.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name} ({p.key})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Section: Calculation Mode */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Expiration Calculation
            </label>
            <div className="space-y-1.5">
              <label
                className={`flex items-start gap-2.5 rounded-xl border p-2 text-xs transition cursor-pointer ${
                  calcMode === "extend"
                    ? "border-indigo-500 bg-indigo-50/50"
                    : "border-gray-200 hover:bg-gray-50"
                } ${!hasFutureExpiry ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name="calcMode"
                  value="extend"
                  checked={calcMode === "extend"}
                  disabled={!hasFutureExpiry}
                  onChange={() => setCalcMode("extend")}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-semibold text-gray-900">
                    Extend current expiration
                  </span>
                  <p className="text-[11px] text-gray-500">
                    {hasFutureExpiry
                      ? `Add ${effectiveMonths} month(s) onto existing date (${formatDateDisplay(user.expiresAt)})`
                      : "No future date to extend"}
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-xl border p-2 text-xs transition cursor-pointer ${
                  calcMode === "today"
                    ? "border-indigo-500 bg-indigo-50/50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="calcMode"
                  value="today"
                  checked={calcMode === "today"}
                  onChange={() => setCalcMode("today")}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-semibold text-gray-900">
                    Start from today
                  </span>
                  <p className="text-[11px] text-gray-500">
                    Activate for {effectiveMonths} month(s) starting today.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-xl border p-2 text-xs transition cursor-pointer ${
                  calcMode === "custom"
                    ? "border-indigo-500 bg-indigo-50/50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="calcMode"
                  value="custom"
                  checked={calcMode === "custom"}
                  onChange={() => setCalcMode("custom")}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <span className="font-semibold text-gray-900">
                    Pick exact date
                  </span>
                  {calcMode === "custom" && (
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-900 outline-none focus:border-indigo-500"
                    />
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Section: Status */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
              Access Status
            </span>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="active"
                  checked={status === "active"}
                  onChange={() => setStatus("active")}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                  Active
                </span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="expired"
                  checked={status === "expired"}
                  onChange={() => setStatus("expired")}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                  Expired
                </span>
              </label>
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-purple-50/30 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-indigo-900 uppercase tracking-wider text-[10px]">
                Plan Preview:{" "}
                {isManualMode
                  ? `Manual (${effectiveMonths} mos)`
                  : selectedPackage?.name || "Standard"}
              </span>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  status === "active"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {status === "active" ? "Active" : "Expired"}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-extrabold text-indigo-950">
                New Expiry: {formatDateDisplay(previewExpiry)}
              </span>
              <span className="text-[11px] text-indigo-700">
                ({effectiveMonths} {effectiveMonths === 1 ? "month" : "months"})
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-indigo-700/80">
              {calcMode === "extend" && hasFutureExpiry
                ? `Adds ${effectiveMonths} month(s) onto existing expiration.`
                : calcMode === "custom"
                  ? "Manual date specified."
                  : `Calculated as today + ${effectiveMonths} month(s).`}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg
                    className="h-3.5 w-3.5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Saving…
                </>
              ) : (
                "Save & Update Plan"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
