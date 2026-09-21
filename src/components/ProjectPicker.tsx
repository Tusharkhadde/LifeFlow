"use client";

import { useEffect, useState } from "react";

interface ProjectOption {
  id: string;
  name: string;
  color: string;
}

export function ProjectPicker({
  value,
  onChange,
  allowEmpty = true,
  className = "",
}: {
  value?: string | null;
  onChange: (id: string | null) => void;
  allowEmpty?: boolean;
  className?: string;
}) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => response.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  return (
    <select
      value={value || ""}
      onChange={(event) => onChange(event.target.value || null)}
      className={`rounded-lg border border-border bg-background px-2 py-1.5 text-xs ${className}`}
      aria-label="Project"
    >
      {allowEmpty && <option value="">No project</option>}
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
