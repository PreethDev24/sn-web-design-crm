"use client";

import { useMemo, useState } from "react";
import type { DbUser, SalesProfile, UserRole } from "@/lib/types";
import { fullName, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RemoveMemberButton } from "@/components/crm/remove-member-button";
import { cn } from "@/lib/utils";

export function ContactsDirectory({
  users,
  salesProfiles,
  currentUserId,
  isOwner = true,
}: {
  users: DbUser[];
  salesProfiles: SalesProfile[];
  currentUserId: string;
  isOwner?: boolean;
}) {
  const roleFilters: Array<{ id: "all" | UserRole; label: string }> = isOwner
    ? [
        { id: "all", label: "All" },
        { id: "owner", label: "Owners" },
        { id: "sales", label: "Sales" },
        { id: "client", label: "Clients" },
      ]
    : [
        { id: "all", label: "All" },
        { id: "owner", label: "Owners" },
        { id: "client", label: "Clients" },
      ];

  const [role, setRole] = useState<"all" | UserRole>("all");
  const [query, setQuery] = useState("");

  const profileByUser = useMemo(() => {
    const map = new Map<string, SalesProfile>();
    for (const profile of salesProfiles) map.set(profile.user_id, profile);
    return map;
  }, [salesProfiles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => {
        // Defense in depth: sales viewers never see sales contacts
        if (!isOwner && u.role === "sales") return false;
        return role === "all" ? true : u.role === role;
      })
      .filter((u) => {
        if (!q) return true;
        const profile = isOwner ? profileByUser.get(u.id) : undefined;
        const haystack = [
          fullName(u.first_name, u.last_name),
          u.email,
          u.phone,
          u.company_name,
          profile?.full_name,
          profile?.phone,
          profile?.calling_from,
          profile?.calling_schedule,
          profile?.target_region,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (a.role !== b.role) return a.role.localeCompare(b.role);
        return fullName(a.first_name, a.last_name).localeCompare(
          fullName(b.first_name, b.last_name)
        );
      });
  }, [users, role, query, profileByUser, isOwner]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {roleFilters.map((filter) => (
          <Button
            key={filter.id}
            type="button"
            size="sm"
            variant={role === filter.id ? "default" : "outline"}
            onClick={() => setRole(filter.id)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, email, phone…"
        className="max-w-md"
      />

      <div className="grid gap-4">
        {filtered.map((user) => {
          const profile = isOwner ? profileByUser.get(user.id) : undefined;
          return (
            <Card key={user.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">
                    {profile?.full_name || fullName(user.first_name, user.last_name)}
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    {profile?.email || user.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {user.role}
                  </Badge>
                  {isOwner && user.role === "sales" && (
                    <Badge variant={profile ? "success" : "warning"}>
                      {profile ? "Onboarded" : "Pending onboarding"}
                    </Badge>
                  )}
                  {isOwner && (
                    <RemoveMemberButton member={user} currentUserId={currentUserId} />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Info label="Phone" value={profile?.phone || user.phone || "—"} />
                  <Info label="Company" value={user.company_name || "—"} />
                  <Info label="Joined" value={formatDate(user.created_at)} />
                  {isOwner && user.role === "sales" && (
                    <Info label="Onboarded" value={formatDate(profile?.completed_at)} />
                  )}
                </div>

                {isOwner && user.role === "sales" && profile && (
                  <div
                    className={cn(
                      "rounded-lg border border-slate-100 bg-slate-50/80 p-3",
                      "grid gap-2 sm:grid-cols-2"
                    )}
                  >
                    <Info label="Calling from" value={profile.calling_from || "—"} />
                    <Info label="Schedule" value={profile.calling_schedule || "—"} />
                    <Info label="Target region" value={profile.target_region || "—"} />
                    <Info
                      label="Daily call goal"
                      value={
                        profile.daily_call_goal != null
                          ? String(profile.daily_call_goal)
                          : "—"
                      }
                    />
                    <Info
                      label="Weekly meeting goal"
                      value={
                        profile.weekly_meeting_goal != null
                          ? String(profile.weekly_meeting_goal)
                          : "—"
                      }
                    />
                  </div>
                )}

                {isOwner && user.role === "sales" && !profile && (
                  <p className="text-slate-500">
                    This sales rep has not completed onboarding yet.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-slate-500">No contacts match this filter.</p>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
