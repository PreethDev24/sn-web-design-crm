"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Lead, LeadStatus } from "@/lib/types";
import { LEAD_STATUSES } from "@/lib/types";
import { formatCurrency, fullName, cn } from "@/lib/utils";
import { updateLeadStatus } from "@/lib/actions/crm";
import { ChevronLeft, ChevronRight, GripVertical, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateLeadDialog } from "@/components/crm/create-lead-dialog";
import { DeleteLeadButton, EditLeadDialog } from "@/components/crm/edit-lead-dialog";

const columns: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

function stageIndex(status: LeadStatus) {
  return columns.indexOf(status);
}

export function LeadsKanban({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<LeadStatus | null>(null);

  function moveTo(status: LeadStatus, leadId: string) {
    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, status);
        toast.success(`Moved to ${status}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      }
    });
  }

  function moveBy(lead: Lead, delta: number) {
    const next = columns[stageIndex(lead.status) + delta];
    if (!next) return;
    moveTo(next, lead.id);
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 xl:gap-3">
      {columns.map((status) => {
        const items = leads.filter((l) => l.status === status);
        const isOver = overStatus === status && draggingId !== null;

        return (
          <div
            key={status}
            className={cn(
              "flex min-h-[220px] min-w-0 flex-col rounded-lg border bg-slate-100/80 transition-colors",
              isOver
                ? "border-teal-500 bg-teal-50 ring-2 ring-teal-400/60"
                : "border-slate-200"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverStatus(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverStatus((current) => (current === status ? null : current));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/lead-id");
              setOverStatus(null);
              setDraggingId(null);
              if (id) moveTo(status, id);
            }}
          >
            <div className="flex items-center justify-between gap-1 border-b border-slate-200 px-2 py-2">
              <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">
                {status.replace("_", " ")}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <Badge variant="secondary" className="px-1.5 text-[10px]">
                  {items.length}
                </Badge>
                {status === "new" && (
                  <CreateLeadDialog
                    label=""
                    size="icon"
                    variant="ghost"
                    showIcon
                    className="h-6 w-6 text-slate-600"
                  />
                )}
              </div>
            </div>

            {isOver && (
              <div className="mx-1.5 mt-1.5 rounded border border-dashed border-teal-400 bg-teal-100/80 px-2 py-3 text-center text-[10px] font-medium text-teal-800">
                Drop here
              </div>
            )}

            <div className="min-h-[140px] flex-1 space-y-2 p-1.5 sm:p-2">
              {items.map((lead) => {
                const idx = stageIndex(lead.status);
                const canBack = idx > 0;
                const canForward = idx < columns.length - 1 && idx >= 0;

                return (
                  <div
                    key={lead.id}
                    draggable={!pending}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/lead-id", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(lead.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStatus(null);
                    }}
                    className={cn(
                      "min-w-0 rounded-md border border-slate-200 bg-white p-2 shadow-sm transition-opacity",
                      draggingId === lead.id && "opacity-40"
                    )}
                  >
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        className="mt-0.5 cursor-grab touch-none text-slate-400 hover:text-slate-600 active:cursor-grabbing"
                        aria-label="Drag to move"
                        title="Drag to another stage"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/crm/leads/${lead.id}`}
                          className="block truncate text-xs font-medium hover:text-teal-700 sm:text-sm"
                          onClick={(e) => {
                            if (draggingId) e.preventDefault();
                          }}
                        >
                          {fullName(lead.first_name, lead.last_name)}
                        </Link>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-xs">
                          {lead.company_name || lead.email || "—"}
                        </p>
                        <p className="mt-1 truncate text-[10px] font-medium text-slate-700 sm:text-xs">
                          {formatCurrency(lead.estimated_value)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100 pt-1.5">
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={pending || !canBack}
                          title={canBack ? `Move to ${columns[idx - 1]}` : undefined}
                          onClick={() => moveBy(lead, -1)}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={pending || !canForward}
                          title={canForward ? `Move to ${columns[idx + 1]}` : undefined}
                          onClick={() => moveBy(lead, 1)}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <EditLeadDialog
                          lead={lead}
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-500"
                              aria-label="Edit lead"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                        <DeleteLeadButton leadId={lead.id} compact />
                      </div>
                    </div>
                  </div>
                );
              })}

              {status === "new" && items.length === 0 && !isOver && (
                <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white/70 px-1.5 py-4 text-center">
                  <Plus className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[10px] leading-tight text-slate-500 sm:text-xs">Add a lead</p>
                  <CreateLeadDialog label="Add" size="sm" variant="outline" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function leadStatusLabel(status: string) {
  return LEAD_STATUSES.includes(status as LeadStatus) ? status : status;
}
