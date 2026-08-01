"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { importLeadsCsv } from "@/lib/actions/crm";
import {
  LEAD_CSV_TEMPLATE,
  parseLeadCsv,
  type LeadImportParseResult,
} from "@/lib/leads/csv";
import { fullName } from "@/lib/utils";
import type { DbUser } from "@/lib/types";

const SOURCES = ["Referral", "Website", "Google", "Instagram", "Cold outreach", "Other"];

export function ImportLeadsDialog({
  salesReps,
  variant = "outline",
  size = "default",
}: {
  salesReps: DbUser[];
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LeadImportParseResult | null>(null);
  const [defaultSource, setDefaultSource] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const router = useRouter();

  const previewRows = useMemo(() => preview?.rows.slice(0, 5) ?? [], [preview]);

  function reset() {
    setFileName(null);
    setCsvText("");
    setParseError(null);
    setPreview(null);
    setDefaultSource("");
    setSelectedAssignees([]);
  }

  function toggleAssignee(id: string) {
    setSelectedAssignees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function downloadTemplate() {
    const blob = new Blob([LEAD_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lead-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | null) {
    if (!file) {
      reset();
      return;
    }
    if (
      !/\.csv$/i.test(file.name) &&
      file.type &&
      !file.type.includes("csv") &&
      file.type !== "text/plain"
    ) {
      setParseError("Please upload a .csv file");
      setPreview(null);
      setCsvText("");
      setFileName(file.name);
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    try {
      const parsed = parseLeadCsv(text);
      setPreview(parsed);
      setParseError(
        parsed.rows.length === 0 ? "No valid leads found in this file" : null
      );
    } catch (e) {
      setPreview(null);
      setParseError(e instanceof Error ? e.message : "Could not read CSV");
    }
  }

  const canImport =
    Boolean(preview && preview.rows.length > 0) &&
    selectedAssignees.length > 0 &&
    !pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5">
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import lead list</DialogTitle>
          <p className="text-sm text-slate-500">
            Upload a CSV and assign it to specific sales reps — up to 500 rows.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            <p className="font-medium text-slate-800">Any CSV format works</p>
            <p className="mt-1">
              Minimum required columns:{" "}
              <code className="rounded bg-white px-1">business name</code> and{" "}
              <code className="rounded bg-white px-1">phone</code>. Extra columns
              (Maps URL, rating, notes, etc.) are saved automatically.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-2 font-medium text-teal-700 underline-offset-2 hover:underline"
            >
              Download example CSV
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-csv">CSV file</Label>
            <Input
              id="lead-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            {fileName ? (
              <p className="text-xs text-slate-500">Selected: {fileName}</p>
            ) : null}
            {parseError ? (
              <p className="text-sm text-red-600">{parseError}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Default source (optional)</Label>
            <Select
              value={defaultSource || "__none__"}
              onValueChange={(v) => setDefaultSource(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Use CSV source or leave blank" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Use CSV / Cold outreach</SelectItem>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Assign to sales reps</Label>
              {salesReps.length > 0 ? (
                <button
                  type="button"
                  className="text-xs font-medium text-teal-700 hover:underline"
                  onClick={() =>
                    setSelectedAssignees(
                      selectedAssignees.length === salesReps.length
                        ? []
                        : salesReps.map((r) => r.id)
                    )
                  }
                >
                  {selectedAssignees.length === salesReps.length
                    ? "Clear all"
                    : "Select all"}
                </button>
              ) : null}
            </div>
            {salesReps.length === 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No sales reps on the team yet. Invite a sales rep before importing
                a list.
              </p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                {salesReps.map((rep) => {
                  const checked = selectedAssignees.includes(rep.id);
                  const label =
                    fullName(rep.first_name, rep.last_name) || rep.email;
                  return (
                    <li key={rep.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-slate-300"
                          checked={checked}
                          onChange={() => toggleAssignee(rep.id)}
                        />
                        <span className="min-w-0 truncate font-medium text-slate-900">
                          {label}
                        </span>
                        <span className="truncate text-xs text-slate-500">
                          {rep.email}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-slate-500">
              {selectedAssignees.length > 1
                ? "Leads are split evenly across the selected reps. Each rep only sees their assigned leads."
                : "Only the selected rep(s) will see these leads — other sales reps will not."}
            </p>
          </div>

          {preview && preview.rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">
                Preview ({preview.rows.length} lead
                {preview.rows.length === 1 ? "" : "s"})
              </p>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 font-medium">Phone</th>
                      <th className="px-2 py-1.5 font-medium">Company</th>
                      <th className="px-2 py-1.5 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1.5">
                          {[row.first_name, row.last_name]
                            .filter(Boolean)
                            .join(" ")}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">
                          {row.phone || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">
                          {row.company_name || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">
                          {row.source || defaultSource || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 5 && (
                <p className="text-xs text-slate-400">
                  Showing first 5 of {preview.rows.length}
                </p>
              )}
              {preview.skipped.length > 0 && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer">
                    Skipped rows ({preview.skipped.length})
                  </summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {preview.skipped.slice(0, 10).map((s) => (
                      <li key={`${s.line}-${s.reason}`}>
                        Line {s.line}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={!canImport}
            onClick={() => {
              if (selectedAssignees.length === 0) {
                toast.error("Select at least one sales rep");
                return;
              }
              startTransition(async () => {
                try {
                  const result = await importLeadsCsv(
                    csvText,
                    defaultSource || undefined,
                    selectedAssignees
                  );
                  const failNote =
                    result.failed.length > 0
                      ? ` · ${result.failed.length} failed`
                      : "";
                  const skipNote =
                    result.skipped.length > 0
                      ? ` · ${result.skipped.length} skipped`
                      : "";
                  toast.success(
                    `Imported ${result.created} lead${result.created === 1 ? "" : "s"} and assigned to ${selectedAssignees.length} sales rep${selectedAssignees.length === 1 ? "" : "s"}${skipNote}${failNote}`
                  );
                  setOpen(false);
                  reset();
                  router.refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Import failed");
                }
              });
            }}
          >
            {pending
              ? "Importing…"
              : preview?.rows.length
                ? `Import ${preview.rows.length} lead${preview.rows.length === 1 ? "" : "s"}`
                : "Import leads"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
