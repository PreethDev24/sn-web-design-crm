"use server";

import { revalidatePath } from "next/cache";
import { requireClient, requireStaff } from "@/lib/auth/roles";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore, newId, touch } from "@/lib/demo/store";
import type { Deliverable, DeliverableStatus, Feedback, ProjectStatus } from "@/lib/types";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import { allocateDemoProjectId, allocateProjectId } from "@/lib/projects/allocate-project-id";

function requireDb() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Add credentials to .env.local");
  }
  return getSupabaseAdmin();
}

async function saveDemoFile(file: File, folder: string) {
  const dir = path.join(process.cwd(), ".data", "uploads", folder);
  fs.mkdirSync(dir, { recursive: true });
  const ext = file.name.split(".").pop() || "bin";
  const filename = `${nanoid()}.${ext}`;
  const fullPath = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);
  return `/api/demo/files/${folder}/${filename}`;
}

export async function createProject(formData: FormData) {
  const user = await requireStaff();

  if (isDemoMode()) {
    const clientId = String(formData.get("client_id") || "");
    mutateStore((store) => {
      const client = store.clients.find((c) => c.id === clientId);
      const projectId = allocateDemoProjectId(
        client?.name ?? String(formData.get("name") || ""),
        store.projects.map((p) => p.id)
      );
      store.projects.push({
        id: projectId,
        name: String(formData.get("name") || "").trim(),
        description: String(formData.get("description") || "").trim() || null,
        client_id: String(formData.get("client_id") || ""),
        status: "discovery",
        progress: 10,
        start_date: String(formData.get("start_date") || "") || null,
        target_launch_date: String(formData.get("target_launch_date") || "") || null,
        assigned_to: user.id,
        deal_id: null,
        created_by: user.id,
        created_at: touch(),
        updated_at: touch(),
      });
    });
    revalidatePath("/crm/projects");
    return;
  }

  const supabase = requireDb();
  const clientId = String(formData.get("client_id") || "");
  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();
  if (!client) throw new Error("Client not found");

  const projectId = await allocateProjectId(supabase, client.name);
  const { error } = await supabase.from("projects").insert({
    id: projectId,
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim() || null,
    client_id: clientId,
    status: "discovery",
    start_date: String(formData.get("start_date") || "") || null,
    target_launch_date: String(formData.get("target_launch_date") || "") || null,
    assigned_to: user.id === "local-dev-user" ? null : user.id,
    created_by: user.id === "local-dev-user" ? null : user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/crm/projects");
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  await requireStaff();
  const progressMap: Partial<Record<ProjectStatus, number>> = {
    discovery: 10,
    wireframing: 25,
    design: 40,
    development: 60,
    revisions: 75,
    launch: 90,
    maintenance: 100,
    completed: 100,
  };

  if (isDemoMode()) {
    mutateStore((store) => {
      const project = store.projects.find((p) => p.id === projectId);
      if (!project) throw new Error("Project not found");
      project.status = status;
      if (progressMap[status] !== undefined) project.progress = progressMap[status]!;
      project.updated_at = touch();
    });
    revalidatePath("/crm/projects");
    revalidatePath(`/crm/projects/${projectId}`);
    revalidatePath(`/portal/projects/${projectId}`);
    return;
  }

  const supabase = requireDb();
  const update: Record<string, unknown> = { status };
  if (progressMap[status] !== undefined) update.progress = progressMap[status];
  const { error } = await supabase.from("projects").update(update).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath("/crm/projects");
  revalidatePath(`/crm/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

export async function createDeliverable(formData: FormData) {
  const user = await requireStaff();
  const projectId = String(formData.get("project_id") || "");
  const file = formData.get("file") as File | null;

  let fileUrl: string | null = null;
  let fileName: string | null = null;

  if (isDemoMode()) {
    if (file && file.size > 0) {
      fileUrl = await saveDemoFile(file, "deliverables");
      fileName = file.name;
    } else {
      fileUrl = String(formData.get("file_url") || "").trim() || null;
      fileName = String(formData.get("file_name") || "").trim() || null;
    }
    const preview =
      String(formData.get("preview_url") || "").trim() ||
      fileUrl ||
      "https://placehold.co/1200x800/0f766e/ffffff?text=Deliverable";

    mutateStore((store) => {
      const deliverable: Deliverable = {
        id: newId("deliv"),
        project_id: projectId,
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim() || null,
        file_url: fileUrl || preview,
        file_name: fileName,
        preview_url: preview,
        status: "in_review",
        version: Number(formData.get("version") || 1),
        uploaded_by: user.id,
        approved_at: null,
        created_at: touch(),
        updated_at: touch(),
      };
      store.deliverables.push(deliverable);
    });
    revalidatePath(`/crm/projects/${projectId}`);
    revalidatePath(`/portal/projects/${projectId}`);
    return;
  }

  const supabase = requireDb();
  if (file && file.size > 0) {
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `${projectId}/${nanoid()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("deliverables")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadError) {
      throw new Error(
        `Upload failed: ${uploadError.message}. Create a Storage bucket named "deliverables".`
      );
    }
    fileUrl = supabase.storage.from("deliverables").getPublicUrl(storagePath).data.publicUrl;
    fileName = file.name;
  } else {
    fileUrl = String(formData.get("file_url") || "").trim() || null;
    fileName = String(formData.get("file_name") || "").trim() || null;
  }

  const { error } = await supabase.from("deliverables").insert({
    project_id: projectId,
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim() || null,
    file_url: fileUrl,
    file_name: fileName,
    preview_url: String(formData.get("preview_url") || "").trim() || fileUrl,
    status: "in_review",
    version: Number(formData.get("version") || 1),
    uploaded_by: user.id === "local-dev-user" ? null : user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/crm/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

export async function updateDeliverableStatus(
  deliverableId: string,
  status: DeliverableStatus,
  projectId: string,
  authorId: string | null
) {
  if (isDemoMode()) {
    mutateStore((store) => {
      const d = store.deliverables.find((x) => x.id === deliverableId);
      if (!d) throw new Error("Deliverable not found");
      d.status = status;
      d.approved_at = status === "approved" ? touch() : d.approved_at;
      d.updated_at = touch();
      store.activities.unshift({
        id: newId("act"),
        type: "status_change",
        body: `Deliverable marked ${status}`,
        lead_id: null,
        deal_id: null,
        client_id: null,
        project_id: projectId,
        author_id: authorId,
        created_at: touch(),
      });
    });
    revalidatePath(`/crm/projects/${projectId}`);
    revalidatePath(`/portal/projects/${projectId}`);
    return;
  }

  const supabase = requireDb();
  const update: Record<string, unknown> = { status };
  if (status === "approved") update.approved_at = new Date().toISOString();
  const { error } = await supabase.from("deliverables").update(update).eq("id", deliverableId);
  if (error) throw new Error(error.message);
  await supabase.from("activities").insert({
    type: "status_change",
    body: `Deliverable marked ${status}`,
    project_id: projectId,
    author_id: authorId === "local-dev-user" ? null : authorId,
  });
  revalidatePath(`/crm/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

export async function addFeedback(formData: FormData) {
  const user = await requireClient();
  const deliverableId = String(formData.get("deliverable_id") || "");
  const projectId = String(formData.get("project_id") || "");
  const comment = String(formData.get("comment") || "").trim();
  const requestChanges = formData.get("request_changes") === "on";
  if (!comment) throw new Error("Comment is required");

  if (isDemoMode()) {
    mutateStore((store) => {
      const item: Feedback = {
        id: newId("fb"),
        deliverable_id: deliverableId,
        author_id: user.id,
        comment,
        resolved: false,
        created_at: touch(),
      };
      store.feedback.push(item);
      if (requestChanges) {
        const d = store.deliverables.find((x) => x.id === deliverableId);
        if (d) {
          d.status = "changes_requested";
          d.updated_at = touch();
        }
      }
    });
    revalidatePath(`/portal/projects/${projectId}`);
    revalidatePath(`/crm/projects/${projectId}`);
    return;
  }

  const supabase = requireDb();
  const { error } = await supabase.from("feedback").insert({
    deliverable_id: deliverableId,
    author_id: user.id,
    comment,
  });
  if (error) throw new Error(error.message);
  if (requestChanges) {
    await supabase
      .from("deliverables")
      .update({ status: "changes_requested" })
      .eq("id", deliverableId);
  }
  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/crm/projects/${projectId}`);
}

export async function approveDeliverable(deliverableId: string, projectId: string) {
  const user = await requireClient();
  await updateDeliverableStatus(
    deliverableId,
    "approved",
    projectId,
    user.id === "local-dev-user" ? null : user.id
  );
}
