"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, DocumentItem } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import Nav from "@/components/Nav";

const MAX_BYTES = 20 * 1024 * 1024;

const STATUS_STYLE: Record<DocumentItem["status"], string> = {
  uploaded: "bg-slate-100 text-slate-700",
  processing: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function DocumentsPage() {
  const user = useUser();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState("department");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await api<{ documents: DocumentItem[] }>("/documents");
    setDocuments(res.documents);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ documents: DocumentItem[] }>("/documents")
      .then((res) => {
        if (!cancelled) setDocuments(res.documents);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const pending = documents.some((d) => d.status === "uploaded" || d.status === "processing");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => load().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  function pickFile(picked: File | undefined) {
    setError("");
    setMessage("");
    if (!picked) return;
    if (picked.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError("That file is larger than 20 MB.");
      return;
    }
    setFile(picked);
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setMessage("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("visibility", visibility);
      await api("/documents", { method: "POST", body: form });
      setMessage("Uploaded. Processing will take a few seconds.");
      setTitle("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function startRename(doc: DocumentItem) {
    setListError("");
    setEditingId(doc.id);
    setEditTitle(doc.title);
  }

  async function saveRename(doc: DocumentItem) {
    const next = editTitle.trim();
    if (!next) {
      setListError("The title cannot be empty.");
      return;
    }
    if (next === doc.title) {
      setEditingId(null);
      return;
    }
    setListError("");
    setBusyId(doc.id);
    try {
      const res = await api<{ document: DocumentItem }>(`/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: next }),
      });
      setDocuments((list) => list.map((d) => (d.id === doc.id ? { ...d, title: res.document.title } : d)));
      setEditingId(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Could not rename the document");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(doc: DocumentItem) {
    if (!window.confirm(`Delete “${doc.title}”? It will no longer be searchable, and this cannot be undone.`)) return;
    setListError("");
    setBusyId(doc.id);
    try {
      await api(`/documents/${doc.id}`, { method: "DELETE" });
      setDocuments((list) => list.filter((d) => d.id !== doc.id));
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Could not delete the document");
    } finally {
      setBusyId(null);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  }

  const canUpload = user.role === "faculty" || user.role === "admin";
  const input =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
  const actionButton = "text-xs font-medium text-slate-600 hover:text-indigo-700 disabled:opacity-40";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Nav user={user} />
      <main className="mx-auto max-w-3xl space-y-6 p-4">
        {canUpload ? (
          <form onSubmit={upload} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Upload a PDF</h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="doc-title" className="mb-1 block text-sm font-medium text-slate-700">
                  Title <span className="font-normal text-slate-400">(optional, defaults to the file name)</span>
                </label>
                <input
                  id="doc-title"
                  className={input}
                  placeholder="For example: Academic Regulations 2024"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="doc-visibility" className="mb-1 block text-sm font-medium text-slate-700">
                  Who can see it
                </label>
                <select
                  id="doc-visibility"
                  className={input}
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  <option value="department">My department only</option>
                  <option value="college">Whole college</option>
                </select>
              </div>
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">PDF file</span>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
                  dragging
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50"
                }`}
              >
                <span className="text-sm font-medium text-slate-800">
                  {file ? file.name : "Click to choose a PDF, or drop it here"}
                </span>
                <span className="text-xs text-slate-500">
                  {file ? `${formatSize(file.size)} · click to change` : "PDF only, up to 20 MB"}
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
              </label>
            </div>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

            <button
              type="submit"
              disabled={uploading || !file}
              className="rounded-md bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </form>
        ) : (
          <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Only faculty and admins can upload documents.
          </p>
        )}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">Documents</h2>
          {listError && <p className="mx-4 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{listError}</p>}
          {documents.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {documents.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {editingId === d.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          autoFocus
                          aria-label="New title"
                          className={`${input} max-w-sm`}
                          value={editTitle}
                          maxLength={200}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(d);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button
                          onClick={() => saveRename(d)}
                          disabled={busyId === d.id}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className={actionButton}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="truncate font-medium">{d.title}</p>
                    )}
                    <p className="text-xs text-slate-500">
                      {d.filename} · {d.visibility === "college" ? "whole college" : "department"}
                      {d.page_count ? ` · ${d.page_count} ${d.page_count === 1 ? "page" : "pages"}` : ""}
                    </p>
                    {d.error_message && <p className="text-xs text-red-600">{d.error_message}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[d.status]}`}>
                      {d.status}
                    </span>
                    {d.can_manage && editingId !== d.id && (
                      <>
                        <button onClick={() => startRename(d)} disabled={busyId === d.id} className={actionButton}>
                          Rename
                        </button>
                        <button
                          onClick={() => remove(d)}
                          disabled={busyId === d.id || d.status === "processing"}
                          title={d.status === "processing" ? "Wait until processing finishes" : undefined}
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
