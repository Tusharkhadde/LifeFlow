"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useData } from "@/components/DataProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  CheckCircle,
  Trash2,
  Calendar,
  Tag,
} from "lucide-react";

interface ExtractedData {
  type: string;
  fields: Record<string, string>;
  dates: Record<string, string>;
  amount?: number;
  confidence: number;
}

const mockExtractors: Record<string, (filename?: string) => ExtractedData> = {
  "electricity bill": () => ({
    type: "Utility Bill",
    fields: {
      "Account Number": "MSE-2026-45892",
      "Bill Period": "May 2026",
      "Units Consumed": "285 kWh",
    },
    dates: {
      "Bill Date": "2026-05-28",
      "Due Date": "2026-06-20",
    },
    amount: 2800,
    confidence: 92,
  }),
  passport: () => ({
    type: "Identity Document",
    fields: {
      "Name": "DEMO USER",
      "Number": "R1234567",
      "Nationality": "Indian",
    },
    dates: {
      "Date of Issue": "2020-03-15",
      "Date of Expiry": "2030-03-14",
    },
    confidence: 95,
  }),
  "car insurance": () => ({
    type: "Insurance Policy",
    fields: {
      "Policy Number": "INS-AUTO-2026-7891",
      "Vehicle": "MH-12-AB-1234",
      "Insurer": "HDFC ERGO",
    },
    dates: {
      "Start Date": "2025-06-20",
      "Expiry Date": "2026-06-20",
    },
    amount: 15000,
    confidence: 88,
  }),
  default: (filename?: string) => ({
    type: "General Document",
    fields: {
      "File Name": filename || "unknown",
      "Status": "Processed",
    },
    dates: {
      "Upload Date": new Date().toISOString().split("T")[0],
    },
    confidence: 75,
  }),
};

function extractDataFromFilename(filename: string): ExtractedData {
  const lower = filename.toLowerCase();
  for (const [key, extractor] of Object.entries(mockExtractors)) {
    if (key !== "default" && lower.includes(key)) {
      return extractor();
    }
  }
  return mockExtractors.default(filename);
}

function categorizeDocument(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes("identity") || lower.includes("passport") || lower.includes("aadhaar"))
    return "Identity";
  if (lower.includes("insurance")) return "Insurance";
  if (lower.includes("utility") || lower.includes("bill")) return "Utilities";
  if (lower.includes("medical") || lower.includes("health")) return "Medical";
  if (lower.includes("education") || lower.includes("marksheet")) return "Education";
  if (lower.includes("finance") || lower.includes("bank")) return "Finance";
  return "Uncategorized";
}

export default function DocumentsPage() {
  const { documents, refreshAll } = useData();
  const { language } = useLanguage();
  const [processing, setProcessing] = useState<string | null>(null);
  const [extractedPreview, setExtractedPreview] = useState<{
    id: string;
    data: ExtractedData;
    fileName: string;
  } | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        const id = Math.random().toString(36).substring(2, 15);
        setProcessing(file.name);

        await new Promise((r) => setTimeout(r, 1500));

        const extracted = extractDataFromFilename(file.name);
        const category = categorizeDocument(extracted.type);

        await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            type: file.type,
            category,
            ocrData: extracted.fields,
            confidence: extracted.confidence,
            keyDates: extracted.dates,
            extractedData: extracted,
          }),
        });
        await refreshAll();
        setExtractedPreview({ id, data: extracted, fileName: file.name });
        setProcessing(null);
      }
    },
    [refreshAll]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg"],
    },
  });

  const confirmDocument = () => {
    setExtractedPreview(null);
  };

const deleteDocument = async (id: string) => {
  try {
    await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
    await refreshAll();
  } catch (e) {
    console.error("Failed to delete document", e);
  }
};

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t("documents", language)}</h1>
        <p className="text-muted-foreground mt-1">
          Upload documents for AI-powered extraction and organization
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary"
        }`}
      >
        <input {...getInputProps()} />
        <Upload
          size={40}
          className={`mx-auto mb-4 ${isDragActive ? "text-primary" : "text-muted-foreground"}`}
        />
        <p className="text-lg font-medium mb-2">{t("dragDrop", language)}</p>
        <p className="text-sm text-muted-foreground">{t("orClickUpload", language)}</p>
        <p className="text-xs text-muted-foreground mt-2">{t("supportedFormats", language)}</p>
      </div>

      {processing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="glass-card">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
                <span className="animate-thinking text-white text-lg">●</span>
              </div>
              <div>
                <p className="font-medium">Processing: {processing}</p>
                <p className="text-sm text-muted-foreground">Running OCR and extracting fields...</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {extractedPreview && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="glass-card border-primary/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileText size={18} className="text-primary" />
                    {t("extractedData", language)} — {extractedPreview.fileName}
                  </CardTitle>
                  <Badge
                    variant={
                      extractedPreview.data.confidence >= 85
                        ? "upcoming"
                        : extractedPreview.data.confidence >= 70
                        ? "due-soon"
                        : "urgent"
                    }
                  >
                    {t("confidence", language)}: {extractedPreview.data.confidence}%
                  </Badge>
                </div>
              </CardHeader>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                      <Tag size={14} /> Fields
                    </h4>
                    <div className="space-y-1">
                      {Object.entries(extractedPreview.data.fields).map(([key, val]) => (
                        <div key={key} className="flex justify-between text-sm p-2 rounded-lg bg-muted/50">
                          <span className="text-muted-foreground">{key}</span>
                          <span className="font-medium">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                      <Calendar size={14} /> Dates
                    </h4>
                    <div className="space-y-1">
                      {Object.entries(extractedPreview.data.dates).map(([key, val]) => (
                        <div key={key} className="flex justify-between text-sm p-2 rounded-lg bg-muted/50">
                          <span className="text-muted-foreground">{key}</span>
                          <span className="font-medium">{val}</span>
                        </div>
                      ))}
                    </div>
                    {extractedPreview.data.amount && (
                      <div className="mt-3 p-3 rounded-xl bg-primary/10">
                        <p className="text-sm text-muted-foreground">Amount</p>
                        <p className="text-xl font-bold text-primary">
                          ₹{extractedPreview.data.amount.toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => confirmDocument()}>
                    <CheckCircle size={16} className="mr-2" />
                    {t("confirmAndSave", language)}
                  </Button>
                  <Button variant="outline" onClick={() => setExtractedPreview(null)}>
                    {t("cancel", language)}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <h2 className="text-lg font-semibold mb-4">
          {documents.length} Document{documents.length !== 1 ? "s" : ""} Saved
        </h2>
        {documents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText size={40} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium">No documents uploaded</p>
            <p className="text-sm mt-1">Upload your first document for AI-powered extraction</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {documents.map((doc) => (
              <motion.div
                key={doc.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <div className="glass-card">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center flex-shrink-0">
                      <FileText className="text-white" size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary">{doc.category}</Badge>
                        {doc.confidence && (
                          <Badge
                            variant={doc.confidence >= 85 ? "upcoming" : "due-soon"}
                          >
                            {doc.confidence}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDocument(doc.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        )}
      </div>
    </div>
  );
}
