"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { createCheckoutSession } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";

export function PayInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const url = await createCheckoutSession(invoiceId);
            if (url) window.location.href = url;
            else toast.error("No checkout URL returned");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        });
      }}
    >
      {pending ? "Redirecting…" : "Pay with Stripe"}
    </Button>
  );
}
