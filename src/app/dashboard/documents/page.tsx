"use client";

import { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Upload, AlertTriangle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency, getDaysUntil } from "@/lib/utils";
import { KnowledgeItem } from "@/lib/types";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [textInput, setTextInput] = useState("");

  const loadDocuments = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function processUpload(payload: { text?: string; imageBase64?: string; fileName?: string }) {
    setUploading(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await loadDocuments();
        setTextInput("");
      }
    } finally {
      setUploading(false);
    }
  }

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      await processUpload({ imageBase64: base64, fileName: file.name });
    } else {
      const text = await file.text();
      await processUpload({ text, fileName: file.name });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "text/*": [], "application/pdf": [] },
    maxFiles: 1,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Document Vault</h1>
        <p className="text-muted-foreground mt-1">OCR extraction, expiry tracking, and AI memory synthesis.</p>
      </div>

      <div
        {...getRootProps()}
        className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto mb-3 text-primary" size={32} />
        <p className="font-medium">{uploading ? "Processing document…" : "Drop an image or document here"}</p>
        <p className="text-sm text-muted-foreground mt-1">Supports photos, PDFs, and text files</p>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Or paste document text here…"
          className="w-full min-h-[100px] rounded-xl border border-border bg-background p-3 text-sm"
        />
        <Button
          disabled={!textInput.trim() || uploading}
          onClick={() => processUpload({ text: textInput, fileName: "pasted-text" })}
        >
          Analyze Text
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading documents…</div>
      ) : documents.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-muted-foreground">
          No documents yet. Upload a bill, receipt, or ID to get started.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {documents.map((doc) => {
            const days = doc.expiryDate ? getDaysUntil(doc.expiryDate) : null;
            const urgent = days !== null && days <= 7;
            return (
              <div key={doc.id} className="glass-card rounded-2xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <FileText size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{doc.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{doc.aiMemory || doc.summary}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {doc.documentType && (
                    <span className="rounded-full bg-muted px-2 py-1 capitalize">{doc.documentType}</span>
                  )}
                  {doc.vendor && <span className="rounded-full bg-muted px-2 py-1">{doc.vendor}</span>}
                  {doc.extractedAmount && (
                    <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-1">
                      {formatCurrency(doc.extractedAmount)}
                    </span>
                  )}
                </div>
                {doc.expiryDate && (
                  <div className={`flex items-center gap-2 text-sm ${urgent ? "text-amber-500" : "text-muted-foreground"}`}>
                    {urgent ? <AlertTriangle size={14} /> : <Calendar size={14} />}
                    Expires {formatDate(doc.expiryDate)}
                    {days !== null && ` (${days}d)`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
