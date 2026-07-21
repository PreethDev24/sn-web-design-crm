"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { startConversation } from "@/lib/actions/messages";
import type { ChatPartnerOption } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function roleLabel(role: ChatPartnerOption["role"]) {
  if (role === "owner") return "Owner";
  if (role === "sales") return "Sales";
  return "Client";
}

export function NewChatDialog({
  partners,
  basePath,
  variant = "default",
  size = "default",
  className,
}: {
  partners: ChatPartnerOption[];
  basePath: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = partners.find((p) => p.id === partnerId) ?? null;

  function reset() {
    setPartnerId("");
    setError(null);
  }

  function onStart() {
    if (!partnerId) {
      setError("Select who you want to message");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const id = await startConversation(partnerId);
        setOpen(false);
        reset();
        router.push(`${basePath}?c=${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start chat");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a new chat</DialogTitle>
          <p className="text-sm text-slate-500">
            Choose who to message. Project ID and name are shown so you can tell people apart.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chat-partner">Message to</Label>
            {partners.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                No one is available to message yet.
              </p>
            ) : (
              <Select value={partnerId || undefined} onValueChange={setPartnerId}>
                <SelectTrigger id="chat-partner" className="h-auto min-h-10 py-2">
                  <SelectValue placeholder="Select a person…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {partners.map((partner) => {
                    const name = fullName(partner.first_name, partner.last_name);
                    const detail =
                      partner.context_label ||
                      partner.client_name ||
                      partner.company_name ||
                      partner.email;
                    return (
                      <SelectItem key={partner.id} value={partner.id} className="items-start py-2">
                        <span className="flex flex-col gap-0.5 text-left">
                          <span className="font-medium text-slate-900">
                            {name}{" "}
                            <span className="font-normal text-slate-400">
                              ({roleLabel(partner.role)})
                            </span>
                          </span>
                          {detail && (
                            <span className="text-xs text-slate-500">{detail}</span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {selected && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {fullName(selected.first_name, selected.last_name)}
                </span>
                <Badge variant="secondary">{roleLabel(selected.role)}</Badge>
              </div>
              {(selected.project_id || selected.project_name || selected.context_label) && (
                <p className="mt-1 text-xs text-slate-500">
                  {selected.project_id && selected.project_name
                    ? `${selected.project_id} · ${selected.project_name}`
                    : selected.context_label}
                  {selected.client_name ? ` · ${selected.client_name}` : ""}
                </p>
              )}
              {selected.email && (
                <p className="mt-0.5 text-xs text-slate-400">{selected.email}</p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onStart}
              disabled={pending || partners.length === 0 || !partnerId}
            >
              {pending ? "Starting…" : "Start chat"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
