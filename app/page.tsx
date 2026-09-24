"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  getMyAccess,
  listAllUsers,
  grantSubscription,
  rejectSubscription,
  revokeSubscription,
  updateUserSubscription,
  type UserRow,
  type UpdateSubscriptionParams,
} from "@/lib/account";

import { formatDuration, type Package } from "@/lib/packages";
import { listAllPackagesAdmin } from "@/lib/packages-admin";
import EditPlanModal from "@/components/EditPlanModal";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

const STATUS_STYLES: Record<UserRow["status"], string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-200 text-gray-600",
  none: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<UserRow["status"], string> = {
  active: "Active",
  pending: "Pending",
  rejected: "Rejected",
  expired: "Expired",
  none: "No plan",
};

function StatusPill({ status }: { status: UserRow["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function EmailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5v10.5H3.75V6.75z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 7.5 7.5 5.25 7.5-5.25"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-4 w-4">
      <path
        fill="#FFC107"
        d="M43.61 20H42V20H24v8h11.3C33.65 32.66 29.21 36 24 36c-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-4Z"
      />
      <path
        fill="#FF3D00"
        d="m6.31 14.69 6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4c-7.68 0-14.35 4.34-17.69 10.69Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24A11.9 11.9 0 0 1 24 36c-5.19 0-9.61-3.32-11.28-7.95l-6.52 5.02C9.5 39.56 16.23 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.61 20H42V20H24v8h11.3a12.04 12.04 0 0 1-4.09 5.57l.01-.01 6.19 5.24C36.97 39.2 44 34 44 24c0-1.34-.14-2.65-.39-4Z"
      />
    </svg>
  );
}

function AuthProviderBadges({ providers }: { providers: string[] }) {
  const normalizedProviders = [
    ...new Set(providers.map((provider) => provider.toLowerCase())),
  ];
  const hasEmail = normalizedProviders.includes("email");
  const hasGoogle = normalizedProviders.includes("google");
  const otherProviders = normalizedProviders.filter(
    (provider) => provider !== "email" && provider !== "google",
  );

  if (!hasEmail && !hasGoogle && otherProviders.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasEmail && (
        <span
          title="Email sign-in enabled"
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700"
        >
          <EmailIcon />
          Email
        </span>
      )}
      {hasGoogle && (
        <span
          title="Google sign-in enabled"
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700"
        >
          <GoogleIcon />
          Google
        </span>
      )}
      {otherProviders.map((provider) => (
        <span
          key={provider}
          title={provider + " sign-in enabled"}
          className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold capitalize text-gray-600"
        >
          {provider}
        </span>
      ))}
    </div>
  );
}

function actionErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (message.includes("permission denied") || message.includes("42501")) {
      return "Activation is blocked by database permissions. Apply the latest Supabase migration.";
    }
    return message;
  }
  return "Subscription action failed. Please try again.";
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(isSupabaseConfigured());
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [userList, pkgList] = await Promise.all([
      listAllUsers(),
      listAllPackagesAdmin().catch(() => []),
    ]);
    setUsers(userList);
    setPackages(pkgList);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    getMyAccess()
      .then(async ({ isAdmin }) => {
        if (!isAdmin) {
          router.replace("/login");
          return;
        }
        setIsAdmin(true);
        await load();
      })
      .catch((error) => {
        setActionError(actionErrorMessage(error));
        router.replace("/login");
      })
      .finally(() => setChecking(false));
  }, [router, load]);

  async function act(u: UserRow, action: "grant" | "reject" | "revoke") {
    setBusyId(u.userId);
    setActionError(null);
    try {
      if (action === "grant") {
        await grantSubscription(
          u.userId,
          u.planMonths || 1,
          u.planKey || "monthly",
        );
      } else if (action === "reject") {
        await rejectSubscription(u.userId);
      } else {
        await revokeSubscription(u.userId);
      }
      await load();
    } catch (error) {
      setActionError(actionErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdatePlan(params: UpdateSubscriptionParams) {
    setActionError(null);
    setBusyId(params.userId);
    try {
      await updateUserSubscription(params);
      await load();
    } catch (error) {
      setActionError(actionErrorMessage(error));
      throw error;
    } finally {
      setBusyId(null);
    }
  }

  if (checking) {
    return (
      <main className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </main>
    );
  }

  if (!isAdmin) return null;

  const pendingCount = users.filter((u) => u.status === "pending").length;
  const activeCount = users.filter((u) => u.status === "active").length;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        [
          u.fullName,
          u.companyName,
          u.email,
          u.phone,
          u.utr ?? "",
          ...u.authProviders,
        ].some((v) => v.toLowerCase().includes(q)),
      )
    : users;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            {users.length} total · {activeCount} active · {pendingCount} pending
            review
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, email…"
            className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            onClick={() => {
              setActionError(null);
              load().catch((error) =>
                setActionError(actionErrorMessage(error)),
              );
            }}
            className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-500">
          {users.length === 0 ? "No users yet." : "No users match your search."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">UTR / Ref</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr key={u.userId} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {u.fullName || "—"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {u.companyName || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{u.email || "—"}</div>
                    <div className="text-xs text-gray-500">
                      {u.phone || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <AuthProviderBadges providers={u.authProviders} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={u.status} />
                    {u.status === "pending" && u.amount != null && (
                      <div className="mt-1 text-xs text-gray-500">
                        ₹{u.amount}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditingUser(u)}
                      className="group flex flex-col text-left transition hover:opacity-85 focus:outline-none"
                      title="Click to edit plan & duration"
                    >
                      {u.planKey ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold capitalize text-indigo-700 group-hover:bg-indigo-100 group-hover:text-indigo-800 transition">
                            {u.planKey}
                            <svg
                              className="h-3 w-3 text-indigo-400 group-hover:text-indigo-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
                              />
                            </svg>
                          </span>
                          <span className="mt-0.5 text-[11px] text-gray-500 font-medium group-hover:text-indigo-600 transition">
                            {u.planMonths
                              ? formatDuration(u.planMonths)
                              : "1 month"}
                          </span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-400 group-hover:border-indigo-400 group-hover:text-indigo-600 transition">
                          + Set Plan
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {u.utr ? (
                      <>
                        <div className="font-mono text-xs text-gray-800">
                          {u.utr}
                        </div>
                        {u.status === "pending" && u.submittedAt && (
                          <div className="mt-1 text-[11px] text-gray-400">
                            Received {formatDate(u.submittedAt)}
                          </div>
                        )}
                        {u.status !== "pending" && (
                          <div className="mt-1 text-[11px] text-gray-400">
                            Previous payment
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(u.expiresAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-1.5">
                      {u.status === "pending" ? (
                        <>
                          <button
                            onClick={() => act(u, "grant")}
                            disabled={busyId === u.userId}
                            className="rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                          >
                            {busyId === u.userId ? "Approving…" : "Approve"}
                          </button>
                          <button
                            onClick={() => act(u, "reject")}
                            disabled={busyId === u.userId}
                            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      ) : u.status === "active" ? (
                        <button
                          onClick={() => act(u, "revoke")}
                          disabled={busyId === u.userId}
                          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                        >
                          {busyId === u.userId ? "Revoking…" : "Revoke"}
                        </button>
                      ) : (
                        <button
                          onClick={() => act(u, "grant")}
                          disabled={busyId === u.userId}
                          className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {busyId === u.userId ? "Activating…" : "Activate"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Plan Update / Assignment Modal */}
      {editingUser && (
        <EditPlanModal
          user={editingUser}
          packages={packages}
          onClose={() => setEditingUser(null)}
          onSave={handleUpdatePlan}
        />
      )}
    </main>
  );
}
