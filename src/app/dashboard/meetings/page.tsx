"use client";

import { useEffect, useRef, useState } from "react";
import { CheckSquare, Loader2, Mic, NotebookPen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { waitForJob } from "@/lib/job-client";

interface MeetingResult {
  knowledgeItemId: string;
  title: string;
  summary: string;
  decisions: string[];
  actionItems: Array<{ title: string; owner?: string; taskId?: string }>;
  people: string[];
  projects: string[];
  memories: Array<{ key: string; value: string }>;
  followUpQuestions: string[];
  transcript?: string;
}

interface MeetingListItem {
  id: string;
  title: string;
  summary: string | null;
  createdAt: string;
  metadata?: { decisions?: string[]; people?: string[] } | null;
}

export default function MeetingsPage() {
  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MeetingResult | null>(null);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/meetings");
    if (res.ok) setMeetings((await res.json()).meetings || []);
  }

  useEffect(() => { load(); }, []);

  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, title: title || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to process meeting");
        return;
      }
      if (data.job?.id) {
        const job = await waitForJob(data.job.id);
        if (job.status !== "COMPLETED") throw new Error(job.lastError || "Meeting processing failed");
        setResult(job.result as MeetingResult);
      } else {
        setResult(data.result);
      }
      setTranscript("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function onAudioSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "");
      void submit({ audioBase64: base64, fileName: file.name });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <NotebookPen size={28} /> Meeting intelligence
        </h1>
        <p className="text-muted-foreground mt-1">
          Paste notes or upload audio. LifeFlow writes the summary, extracts decisions, creates tasks (synced to Calendar), and remembers people and projects.
        </p>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title (optional)" />
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste a transcript, Zoom/Meet notes, or a voice-note transcript…"
          className="w-full min-h-40 rounded-xl border border-border bg-background p-3 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => submit({ transcript })} disabled={busy || transcript.trim().length < 20}>
            {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckSquare size={14} className="mr-1" />}
            Process notes
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Mic size={14} className="mr-1" /> Upload audio
          </Button>
          <input ref={fileInput} type="file" accept="audio/*" hidden onChange={onAudioSelected} />
          <span className="text-xs text-muted-foreground self-center flex items-center gap-1">
            <Upload size={12} /> Telegram: send a voice note with caption “meeting”
          </span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {result && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{result.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{result.summary}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title={`Tasks created (${result.actionItems.length})`}>
              {result.actionItems.map((item) => (
                <li key={item.taskId || item.title}>• {item.title}{item.owner ? ` — ${item.owner}` : ""}</li>
              ))}
            </Section>
            <Section title="Decisions">
              {result.decisions.length ? result.decisions.map((item) => <li key={item}>• {item}</li>) : <li className="text-muted-foreground">None captured</li>}
            </Section>
            <Section title="People & projects">
              {[...result.people, ...result.projects].length ? (
                [...result.people, ...result.projects].map((item) => <li key={item}>• {item}</li>)
              ) : (
                <li className="text-muted-foreground">None detected</li>
              )}
            </Section>
            <Section title="Remembered">
              {result.memories.length ? result.memories.map((item) => <li key={item.key}>• {item.key}: {item.value}</li>) : <li className="text-muted-foreground">No durable facts</li>}
            </Section>
          </div>
          {result.followUpQuestions.length > 0 && (
            <Section title="Open questions">
              {result.followUpQuestions.map((item) => <li key={item}>• {item}</li>)}
            </Section>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-semibold">Past meetings</h2>
        {meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meetings processed yet.</p>
        ) : (
          meetings.map((meeting) => (
            <div key={meeting.id} className="glass-card rounded-xl p-4">
              <div className="flex justify-between gap-3">
                <div className="font-medium">{meeting.title}</div>
                <div className="text-xs text-muted-foreground">{new Date(meeting.createdAt).toLocaleDateString()}</div>
              </div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{meeting.summary}</p>
              {meeting.metadata?.people?.length ? (
                <p className="text-xs text-muted-foreground mt-1">With: {meeting.metadata.people.join(", ")}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <ul className="text-sm space-y-1">{children}</ul>
    </div>
  );
}
