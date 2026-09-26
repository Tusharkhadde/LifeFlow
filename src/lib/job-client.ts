export interface ClientJob {
  id: string;
  name: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED" | "DEAD";
  result?: unknown;
  lastError?: string | null;
}

export async function processJobNow(id: string): Promise<ClientJob> {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "process", id }),
  });
  const data = await response.json();
  if (!data.job) throw new Error(data.error || "Job not found");
  return data.job as ClientJob;
}

export async function waitForJob(id: string, timeoutMs = 60_000): Promise<ClientJob> {
  const immediate = await processJobNow(id);
  if (["COMPLETED", "FAILED", "DEAD"].includes(immediate.status)) return immediate;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch("/api/jobs?limit=100");
    if (!response.ok) continue;
    const data = await response.json();
    const job = (data.jobs || []).find((candidate: ClientJob) => candidate.id === id) as ClientJob | undefined;
    if (job && ["COMPLETED", "FAILED", "DEAD"].includes(job.status)) return job;
  }
  throw new Error("Job is still processing. Check Activity for status.");
}
