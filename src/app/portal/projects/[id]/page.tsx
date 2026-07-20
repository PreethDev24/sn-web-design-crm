import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth/roles";
import {
  getClientForUser,
  getProject,
  listDeliverables,
  listFeedback,
} from "@/lib/db/queries";
import { Badge } from "@/components/ui/badge";
import { DeliverableReview } from "@/components/portal/deliverable-review";

export default async function PortalProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireClient();
  const { id } = await params;
  const client = await getClientForUser(user.id);
  const project = await getProject(id);
  if (!project || !client || project.client_id !== client.id) notFound();

  const deliverables = await listDeliverables(id);
  const feedbackByDeliverable = await Promise.all(
    deliverables.map(async (d) => ({
      id: d.id,
      feedback: await listFeedback(d.id),
    }))
  );
  const feedbackMap = Object.fromEntries(
    feedbackByDeliverable.map((f) => [f.id, f.feedback])
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/projects" className="text-sm text-teal-700 hover:underline">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{project.name}</h1>
          <Badge>{project.status}</Badge>
        </div>
        <p className="text-slate-500">{project.progress}% complete</p>
        {project.description && (
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{project.description}</p>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Deliverables for review</h2>
        {deliverables.map((d) => (
          <DeliverableReview
            key={d.id}
            deliverable={d}
            feedback={feedbackMap[d.id] || []}
            projectId={project.id}
          />
        ))}
        {deliverables.length === 0 && (
          <p className="text-sm text-slate-500">No deliverables uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
