"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLead } from "@/lib/actions/crm";

const SOURCES = ["Referral", "Website", "Google", "Instagram", "Cold outreach", "Other"];

export function CreateLeadDialog({
  label = "New lead",
  variant = "default",
  size = "default",
  className,
  showIcon = true,
}: {
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState("");
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSource("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className} aria-label="Add new lead">
          {showIcon && <Plus className="h-4 w-4" />}
          {label ? <span>{label}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new lead</DialogTitle>
          <p className="text-sm text-slate-500">
            Available to owners and sales reps. The lead is added to the shared pipeline.
          </p>
        </DialogHeader>
        <form
          className="space-y-4"
          action={(fd) => {
            if (source) fd.set("source", source);
            startTransition(async () => {
              try {
                await createLead(fd);
                toast.success("Lead added to pipeline");
                setOpen(false);
                setSource("");
                router.refresh();
                router.push("/crm/leads");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to create lead");
              }
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" name="first_name" required placeholder="Jordan" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" placeholder="Lee" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="jordan@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" placeholder="555-0100" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company_name">Company</Label>
            <Input id="company_name" name="company_name" placeholder="Acme Coffee" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue placeholder="How did they find you?" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="source" value={source} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimated_value">Est. value ($)</Label>
              <Input
                id="estimated_value"
                name="estimated_value"
                type="number"
                step="0.01"
                min="0"
                placeholder="4500"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" placeholder="What do they need?" />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Add lead"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
