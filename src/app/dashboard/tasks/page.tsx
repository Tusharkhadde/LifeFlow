"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectPicker } from "@/components/ProjectPicker";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  completed: boolean;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTasks() {
    const res = await fetch("/api/tasks");
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function addTask() {
    if (!title.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dueAt: dueAt || undefined, projectId }),
    });
    if (res.ok) {
      setTitle("");
      setDueAt("");
      setProjectId(null);
      await loadTasks();
    }
  }

  async function toggleTask(task: Task) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, completed: !task.completed }),
    });
    await loadTasks();
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    await loadTasks();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Tasks</h1>
        <p className="text-muted-foreground mt-1">Synced with your Telegram assistant.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task…" onKeyDown={(e) => e.key === "Enter" && addTask()} />
        <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="sm:w-56" />
        <ProjectPicker value={projectId} onChange={setProjectId} className="sm:w-44" />
        <Button onClick={addTask}><Plus size={16} className="mr-1" /> Add</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : tasks.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">No tasks yet.</div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="glass-card rounded-xl p-4 flex items-center gap-3">
              <button onClick={() => toggleTask(task)} className={`rounded-lg p-2 ${task.completed ? "text-emerald-500" : "text-muted-foreground"}`}>
                <CheckSquare size={18} />
              </button>
              <span className={`flex-1 ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                {task.title}
                {task.dueAt && (
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(task.dueAt).toLocaleString()}</span>
                )}
              </span>
              <button onClick={() => deleteTask(task.id)} className="text-muted-foreground hover:text-destructive p-2">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
