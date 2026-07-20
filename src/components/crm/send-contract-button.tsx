"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendContract } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";

export function SendContractButton({ contractId, status }: { contractId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status !== "draft") return null;

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            await sendContract(contractId);
            toast.success("Sent to client portal");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        });
      }}
    >
      Send
    </Button>
  );
}
