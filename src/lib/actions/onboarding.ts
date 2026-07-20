"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/roles";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
import { isMissingSalesProfilesTable } from "@/lib/db/queries";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore, touch } from "@/lib/demo/store";
import type { SalesProfile } from "@/lib/types";

function requireDb() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Add credentials to .env.local");
  }
  return getSupabaseAdmin();
}

function splitName(fullName: string): { first: string | null; last: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function completeSalesOnboarding(formData: FormData) {
  const user = await requireStaff();
  if (user.role !== "sales") {
    throw new Error("Only sales reps complete this onboarding");
  }

  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim() || null;
  const callingFrom = String(formData.get("calling_from") || "").trim() || null;
  const callingSchedule = String(formData.get("calling_schedule") || "").trim() || null;
  let targetRegion = String(formData.get("target_region") || "").trim() || null;
  const customRegion = String(formData.get("custom_region") || "").trim();
  if (targetRegion === "Other" && customRegion) {
    targetRegion = customRegion;
  }
  const dailyCallGoalRaw = String(formData.get("daily_call_goal") || "").trim();
  const weeklyMeetingGoalRaw = String(formData.get("weekly_meeting_goal") || "").trim();
  const dailyCallGoal = dailyCallGoalRaw ? Number(dailyCallGoalRaw) : null;
  const weeklyMeetingGoal = weeklyMeetingGoalRaw ? Number(weeklyMeetingGoalRaw) : null;

  if (!fullName) throw new Error("Name is required");
  if (!email) throw new Error("Email is required");
  if (!phone) throw new Error("Phone number is required");
  if (!callingFrom) throw new Error("Where you call from is required");
  if (!callingSchedule) throw new Error("When you call is required");
  if (!targetRegion) throw new Error("Target region is required");
  if (dailyCallGoal === null || Number.isNaN(dailyCallGoal) || dailyCallGoal < 0) {
    throw new Error("Enter a valid daily call goal");
  }
  if (weeklyMeetingGoal === null || Number.isNaN(weeklyMeetingGoal) || weeklyMeetingGoal < 0) {
    throw new Error("Enter a valid meetings goal");
  }

  const { first, last } = splitName(fullName);
  const now = touch();

  if (isDemoMode()) {
    mutateStore((store) => {
      const existing = store.users.find((u) => u.id === user.id);
      if (existing) {
        existing.first_name = first;
        existing.last_name = last;
        existing.email = email;
        existing.phone = phone;
        existing.updated_at = now;
      }

      const profile: SalesProfile = {
        user_id: user.id,
        full_name: fullName,
        email,
        phone,
        calling_from: callingFrom,
        calling_schedule: callingSchedule,
        target_region: targetRegion,
        daily_call_goal: dailyCallGoal,
        weekly_meeting_goal: weeklyMeetingGoal,
        completed_at: now,
        created_at: now,
        updated_at: now,
      };
      const idx = store.sales_profiles.findIndex((p) => p.user_id === user.id);
      if (idx >= 0) store.sales_profiles[idx] = profile;
      else store.sales_profiles.push(profile);
    });
    revalidatePath("/crm");
    revalidatePath("/crm/team");
    revalidatePath("/crm/contacts");
    revalidatePath("/onboarding/sales");
    redirect("/crm/dashboard");
  }

  const supabase = requireDb();

  const { error: userError } = await supabase
    .from("users")
    .update({
      first_name: first,
      last_name: last,
      email,
      phone,
    })
    .eq("id", user.id);
  if (userError) throw new Error(userError.message);

  const { error } = await supabase.from("sales_profiles").upsert(
    {
      user_id: user.id,
      full_name: fullName,
      email,
      phone,
      calling_from: callingFrom,
      calling_schedule: callingSchedule,
      target_region: targetRegion,
      daily_call_goal: dailyCallGoal,
      weekly_meeting_goal: weeklyMeetingGoal,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (isMissingSalesProfilesTable(error)) {
      throw new Error(
        "Database setup incomplete. Run supabase/migrations/004_sales_profiles.sql in the Supabase SQL Editor, then try again."
      );
    }
    throw new Error(error.message);
  }

  revalidatePath("/crm");
  revalidatePath("/crm/team");
  revalidatePath("/crm/contacts");
  revalidatePath("/onboarding/sales");
  redirect("/crm/dashboard");
}
