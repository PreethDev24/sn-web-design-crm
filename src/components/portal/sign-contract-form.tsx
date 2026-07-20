"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { signContract } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";

export function SignContractForm({ contractId }: { contractId: string }) {
  const canvasRef = useRef<SignatureCanvas>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Sign below to accept this contract</p>
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <SignatureCanvas
          ref={canvasRef}
          canvasProps={{ className: "w-full h-40", width: 500, height: 160 }}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => canvasRef.current?.clear()}
        >
          Clear
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!canvasRef.current || canvasRef.current.isEmpty()) {
              toast.error("Please provide a signature");
              return;
            }
            const data = canvasRef.current.toDataURL();
            startTransition(async () => {
              try {
                await signContract(contractId, data);
                toast.success("Contract signed");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            });
          }}
        >
          {pending ? "Signing…" : "Sign contract"}
        </Button>
      </div>
    </div>
  );
}
