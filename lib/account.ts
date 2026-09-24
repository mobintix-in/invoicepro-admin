import { createClient } from "@/lib/supabase/client";
import { SUBSCRIPTION, type SubscriptionStatus } from "@/lib/subscription";

type SubRow = {
  status: string;
  utr: string | null;
  amount: number | null;
  plan_key?: string | null;
  plan_months?: number | null;
  submitted_at: string | null;
  expires_at: string | null;
};

/** Access flags for the current user, computed server-side via the my_access() RPC or email fallback. */
export async function getMyAccess(): Promise<{
  isAdmin: boolean;
  isActive: boolean;
}> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  try {
    const { data, error } = await supabase
      .rpc("my_access")
      .single<{ is_admin: boolean; is_active: boolean }>();
    if (!error && data?.is_admin) {
      return { isAdmin: true, isActive: !!data.is_active };
    }
  } catch {
    // Fallthrough to email check
  }

  if (user?.email) {
    const adminEmails = (
      process.env.ADMIN_EMAILS ||
      process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
      "aryanbhimani0011@gmail.com"
    )
      .split(",")
      .map((e) => e.trim().toLowerCase());
    if (
      adminEmails.includes(user.email.toLowerCase()) ||
      process.env.NODE_ENV === "development"
    ) {
      return { isAdmin: true, isActive: true };
    }
  }

  return { isAdmin: false, isActive: false };
}

function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
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

export async function rejectSubscription(userId: string): Promise<void> {
  const { error } = await createClient()
    .from("subscriptions")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

// ── All users (admin roster) ─────────────────────────────────────────────────

export interface UserRow {
  userId: string;
  fullName: string;
  companyName: string;
  email: string;
  phone: string;
  authProviders: string[];
  createdAt: string | null;
  status: SubscriptionStatus | "none";
  utr: string | null;
  amount: number | null;
  planKey: string | null;
  planMonths: number | null;
  submittedAt: string | null;
  expiresAt: string | null;
}

type ProfileWithSub = {
  id: string;
  full_name: string;
  company_name: string;
  email: string;
  phone: string;
  created_at: string | null;
  subscriptions: SubRow | SubRow[] | null;
};

type AuthProviderRow = {
  user_id: string;
  providers: string[] | null;
};

/** Every registered user with their subscription and linked sign-in methods. */
export async function listAllUsers(): Promise<UserRow[]> {
  const supabase = createClient();

  const profilesPromise = supabase
    .from("profiles")
    .select(
      "id, full_name, company_name, email, phone, created_at, subscriptions(status, utr, amount, plan_key, plan_months, submitted_at, expires_at)",
    )
    .order("created_at", { ascending: false });

  const providersPromise = (async () => {
    try {
      return await supabase.rpc("list_user_auth_providers");
    } catch (err) {
      return { data: null, error: err };
    }
  })();

  const [profilesResult, providersResult] = await Promise.all([
    profilesPromise,
    providersPromise,
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (providersResult.error)
    console.warn("Could not load auth providers:", providersResult.error);
  if (!profilesResult.data) return [];

  const providerMap = new Map(
    (
      (Array.isArray(providersResult?.data)
        ? providersResult.data
        : []) as AuthProviderRow[]
    ).map((row) => [row.user_id, row.providers ?? []]),
  );

  return (profilesResult.data as ProfileWithSub[]).map((row) => {
    const sub = Array.isArray(row.subscriptions)
      ? row.subscriptions[0]
      : row.subscriptions;
    return {
      userId: row.id,
      fullName: row.full_name,
      companyName: row.company_name,
      email: row.email,
      phone: row.phone,
      authProviders: providerMap.get(row.id) ?? [],
      createdAt: row.created_at,
      status: (sub?.status as SubscriptionStatus | undefined) ?? "none",
      utr: sub?.utr ?? null,
      amount: sub?.amount != null ? Number(sub.amount) : null,
      planKey: sub?.plan_key ?? null,
      planMonths: sub?.plan_months != null ? Number(sub.plan_months) : null,
      submittedAt: sub?.submitted_at ?? null,
      expiresAt: sub?.expires_at ?? null,
    };
  });
}

export interface UpdateSubscriptionParams {
  userId: string;
  planMonths: number;
  planKey?: string;
  status?: SubscriptionStatus;
  expiresAt?: string | null;
  extendFromCurrent?: boolean;
  currentExpiresAt?: string | null;
}

/** Update or assign a user's subscription with customizable duration, package, and expiry. */
export async function updateUserSubscription(
  params: UpdateSubscriptionParams,
): Promise<void> {
  const supabase = createClient();
  const now = new Date();

  let finalExpiresAt: Date;
  if (params.expiresAt) {
    finalExpiresAt = new Date(params.expiresAt);
  } else if (params.extendFromCurrent && params.currentExpiresAt) {
    const curr = new Date(params.currentExpiresAt);
    const base = curr.getTime() > now.getTime() ? curr : now;
    finalExpiresAt = addMonthsClamped(base, Math.max(1, params.planMonths));
  } else {
    finalExpiresAt = addMonthsClamped(now, Math.max(1, params.planMonths));
  }

  // Resolve plan key to an existing package in public.packages to avoid foreign key errors
  let resolvedPlanKey = (params.planKey || "").trim().toLowerCase();
  if (!resolvedPlanKey) {
    if (params.planMonths === 6) resolvedPlanKey = "half-yearly";
    else if (params.planMonths === 12) resolvedPlanKey = "yearly";
    else resolvedPlanKey = "monthly";
  }

  const { data: pkg } = await supabase
    .from("packages")
    .select("key")
    .eq("key", resolvedPlanKey)
    .maybeSingle();

  if (!pkg) {
    const { data: durationPkg } = await supabase
      .from("packages")
      .select("key")
      .eq("duration_months", params.planMonths)
      .limit(1)
      .maybeSingle();

    if (durationPkg) {
      resolvedPlanKey = durationPkg.key;
    } else {
      const { data: fallbackPkg } = await supabase
        .from("packages")
        .select("key")
        .limit(1)
        .maybeSingle();
      resolvedPlanKey = fallbackPkg?.key || "monthly";
    }
  }

  const targetStatus = params.status || "active";
  const record: Record<string, unknown> = {
    user_id: params.userId,
    status: targetStatus,
    plan_months: Math.max(1, params.planMonths),
    plan_key: resolvedPlanKey,
    updated_at: now.toISOString(),
  };

  if (targetStatus === "active") {
    record.activated_at = now.toISOString();
    record.expires_at = finalExpiresAt.toISOString();
  } else if (targetStatus === "expired") {
    record.expires_at = now.toISOString();
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(record, { onConflict: "user_id" })
    .select("user_id")
    .single<{ user_id: string }>();

  if (error) throw error;
  if (!data?.user_id) throw new Error("Subscription update was not confirmed");
}

/** Grant/renew an active subscription for a user (works even if they have no row yet). */
export async function grantSubscription(
  userId: string,
  planMonths: number = SUBSCRIPTION.planMonths,
  planKey = "monthly",
): Promise<void> {
  return updateUserSubscription({
    userId,
    planMonths,
    planKey,
    status: "active",
  });
}

/** Immediately end a user's access. */
export async function revokeSubscription(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await createClient()
    .from("subscriptions")
    .update({ status: "expired", expires_at: now, updated_at: now })
    .eq("user_id", userId);
  if (error) throw error;
}
