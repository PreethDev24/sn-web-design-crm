"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo/mode";
import { setDemoUser } from "@/lib/demo/auth";
import { getUserById, resetDemoStore } from "@/lib/demo/store";
import { isStaffRole } from "@/lib/auth/roles-shared";

export async function switchDemoPersona(userId: string) {
  if (!isDemoMode()) throw new Error("Demo mode is not enabled");
  const user = getUserById(userId);
  if (!user) throw new Error("User not found");
  await setDemoUser(userId);
  revalidatePath("/", "layout");
  if (isStaffRole(user.role)) redirect("/crm/dashboard");
  redirect("/portal/dashboard");
}

export async function resetDemoData() {
  if (!isDemoMode()) throw new Error("Demo mode is not enabled");
  resetDemoStore();
  await setDemoUser("user-owner");
  revalidatePath("/", "layout");
  redirect("/crm/dashboard");
}
