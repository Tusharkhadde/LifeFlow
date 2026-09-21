"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  status: string;
  _count: { links: number; inboxItems: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function load() {
    const response = await fetch("/api/projects");
    if (response.ok) setProjects((await response.json()).projects || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createProject() {
    if (!name.trim()) return;
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (response.ok) {
      setName("");
      setDescription("");
      await load();
    }
  }

  return (
    <div className="space-y-6 max-w-5xl" data-tour="projects">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <FolderKanban size={28} /> Projects
        </h1>
        <p className="mt-1 text-muted-foreground">
          One hub for a project&apos;s tasks, meetings, knowledge, expenses, people, and inbox.
        </p>
      </div>

      <div className="glass-card grid gap-3 rounded-2xl p-4 md:grid-cols-[1fr_2fr_auto]">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" />
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What outcome does this project own?"
        />
        <Button onClick={createProject} disabled={!name.trim()}>
          <Plus size={14} className="mr-1" /> Create
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/dashboard/projects/${project.id}`}
            className="glass-card rounded-2xl border border-border p-5 transition hover:border-primary/50"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
              <h2 className="font-semibold">{project.name}</h2>
            </div>
            <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
              {project.description || "No description yet."}
            </p>
            <div className="mt-4 flex gap-3 text-xs text-muted-foreground">
              <span>{project._count.links} linked items</span>
              <span>{project._count.inboxItems} inbox</span>
            </div>
          </Link>
        ))}
        {projects.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-sm text-muted-foreground">
            Create a project, then attach tasks, meetings, vault items, and inbox proposals.
          </div>
        )}
      </div>
    </div>
  );
}
