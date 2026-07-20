"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { completeSalesOnboarding } from "@/lib/actions/onboarding";
import { SALES_TARGET_REGIONS } from "@/lib/types";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "basics", title: "About you", subtitle: "Confirm how we should reach you" },
  { id: "calling", title: "Calling setup", subtitle: "When and where you’ll be dialing from" },
  { id: "region", title: "Target region", subtitle: "Where you’ll focus your outreach" },
  { id: "goals", title: "Daily goals", subtitle: "Calls and meetings you can commit to" },
  { id: "review", title: "You’re set", subtitle: "Review and jump into the CRM" },
] as const;

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  calling_from: string;
  calling_schedule: string;
  target_region: string;
  custom_region: string;
  daily_call_goal: string;
  weekly_meeting_goal: string;
};

export function SalesOnboardingWizard({
  initial,
}: {
  initial: {
    full_name: string;
    email: string;
    phone: string;
  };
}) {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<FormState>({
    full_name: initial.full_name,
    email: initial.email,
    phone: initial.phone,
    calling_from: "",
    calling_schedule: "",
    target_region: "",
    custom_region: "",
    daily_call_goal: "40",
    weekly_meeting_goal: "5",
  });

  const progress = ((step + 1) / STEPS.length) * 100;
  const current = STEPS[step];

  const regionLabel = useMemo(() => {
    if (form.target_region === "Other" && form.custom_region.trim()) {
      return form.custom_region.trim();
    }
    return form.target_region || "—";
  }, [form.target_region, form.custom_region]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(index: number): string | null {
    if (index === 0) {
      if (!form.full_name.trim()) return "Name is required";
      if (!form.email.trim()) return "Email is required";
      if (!form.phone.trim()) return "Phone number is required";
    }
    if (index === 1) {
      if (!form.calling_from.trim()) return "Tell us where you call from";
      if (!form.calling_schedule.trim()) return "Tell us when you call";
    }
    if (index === 2) {
      if (!form.target_region) return "Pick a target region";
      if (form.target_region === "Other" && !form.custom_region.trim()) {
        return "Enter your custom region";
      }
    }
    if (index === 3) {
      const calls = Number(form.daily_call_goal);
      const meetings = Number(form.weekly_meeting_goal);
      if (!form.daily_call_goal || Number.isNaN(calls) || calls < 0) {
        return "Enter a valid daily call goal";
      }
      if (!form.weekly_meeting_goal || Number.isNaN(meetings) || meetings < 0) {
        return "Enter a valid meetings goal";
      }
    }
    return null;
  }

  function goNext() {
    const error = validateStep(step);
    if (error) {
      toast.error(error);
      return;
    }
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    const error = validateStep(3);
    if (error) {
      toast.error(error);
      return;
    }
    const fd = new FormData();
    Object.entries(form).forEach(([key, value]) => fd.set(key, value));
    startTransition(async () => {
      try {
        await completeSalesOnboarding(fd);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-[0.18em] text-teal-700">
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <motion.div
            className="h-full rounded-full bg-teal-700"
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={current.id}
          custom={direction}
          initial={{ opacity: 0, x: direction > 0 ? 40 : -40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction > 0 ? -40 : 40 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="space-y-6"
        >
          <div>
            <h1 className="font-display text-3xl tracking-tight text-slate-900 md:text-4xl">
              {current.title}
            </h1>
            <p className="mt-2 text-slate-500">{current.subtitle}</p>
          </div>

          {step === 0 && (
            <div className="space-y-4">
              <Field label="Full name" htmlFor="full_name">
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)}
                  placeholder="Jordan Lee"
                />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="jordan@example.com"
                />
              </Field>
              <Field label="Phone number" htmlFor="phone">
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Field label="Where are you calling from?" htmlFor="calling_from">
                <Input
                  id="calling_from"
                  value={form.calling_from}
                  onChange={(e) => update("calling_from", e.target.value)}
                  placeholder="Home office in Austin, TX"
                />
              </Field>
              <Field label="When do you usually call?" htmlFor="calling_schedule">
                <Textarea
                  id="calling_schedule"
                  rows={4}
                  value={form.calling_schedule}
                  onChange={(e) => update("calling_schedule", e.target.value)}
                  placeholder="Mon–Fri, 9am–5pm CST"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field label="Target region">
                <Select
                  value={form.target_region}
                  onValueChange={(value) => update("target_region", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {SALES_TARGET_REGIONS.map((region) => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {form.target_region === "Other" && (
                <Field label="Custom region" htmlFor="custom_region">
                  <Input
                    id="custom_region"
                    value={form.custom_region}
                    onChange={(e) => update("custom_region", e.target.value)}
                    placeholder="e.g. Bay Area restaurants"
                  />
                </Field>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Field label="Calls you aim to make per day" htmlFor="daily_call_goal">
                <Input
                  id="daily_call_goal"
                  type="number"
                  min={0}
                  value={form.daily_call_goal}
                  onChange={(e) => update("daily_call_goal", e.target.value)}
                />
              </Field>
              <Field
                label="Meetings you may be able to schedule per week"
                htmlFor="weekly_meeting_goal"
              >
                <Input
                  id="weekly_meeting_goal"
                  type="number"
                  min={0}
                  value={form.weekly_meeting_goal}
                  onChange={(e) => update("weekly_meeting_goal", e.target.value)}
                />
              </Field>
            </div>
          )}

          {step === 4 && (
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-4 rounded-2xl border border-teal-100 bg-teal-50/60 p-5"
            >
              <SummaryRow label="Name" value={form.full_name} />
              <SummaryRow label="Email" value={form.email} />
              <SummaryRow label="Phone" value={form.phone} />
              <SummaryRow label="Calling from" value={form.calling_from} />
              <SummaryRow label="Schedule" value={form.calling_schedule} />
              <SummaryRow label="Region" value={regionLabel} />
              <SummaryRow label="Daily calls" value={form.daily_call_goal} />
              <SummaryRow label="Weekly meetings" value={form.weekly_meeting_goal} />
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={goBack}
          disabled={step === 0 || pending}
          className={cn(step === 0 && "invisible")}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Enter the CRM"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-teal-100/80 py-2 last:border-0">
      <span className="text-sm text-teal-900/70">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
