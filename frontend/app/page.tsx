"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  Clock3,
  FileText,
  FolderKanban,
  History,
  Landmark,
  Link2,
  ScanSearch,
  Sparkles,
  Users,
} from "lucide-react"

const API_BASE = process.env.NEXT_PUBLIC_DOCUMENTS_API_BASE_URL || "http://localhost:8200"
const FILES_API_BASE = process.env.NEXT_PUBLIC_FILES_API_BASE_URL || "http://localhost:8320"

const nav = [
  [Clock3, "Последние"],
  [FileText, "Все документы"],
  [Sparkles, "AI-группы"],
  [Building2, "Компании"],
  [Users, "Люди"],
  [FolderKanban, "Проекты"],
  [Landmark, "Финансы"],
  [History, "История"],
  [Link2, "Интеграции"],
] as const

type DocumentItem = {
  id: string
  filename: string
  storage_mode: "managed" | "external"
  analysis_status: string
  preview_status: string
}

type SearchHit = { document_id: string; score: number }

export default function Home() {
  const [subjectId, setSubjectId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/auth/session`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((session: { subject_id: string }) => setSubjectId(session.subject_id))
      .catch(() => setSubjectId(null))
  }, [])

  async function loadDocuments(activeSubjectId: string) {
    const response = await fetch(`${API_BASE}/api/v1/documents?owner_subject_id=${activeSubjectId}`, { credentials: "include" })
    const items: DocumentItem[] = await response.json()
    setDocuments(items)
    setSelectedId((current) => current ?? items[0]?.id ?? null)
  }

  useEffect(() => {
    if (!subjectId) return
    loadDocuments(subjectId).catch(() => setDocuments([]))
  }, [subjectId])

  const visibleDocuments = useMemo(() => {
    if (!hits.length) return documents
    const allowed = new Set(hits.map((hit) => hit.document_id))
    return documents.filter((document) => allowed.has(document.id))
  }, [documents, hits])

  const selected = documents.find((document) => document.id === selectedId)

  async function uploadManaged(file: File) {
    if (!subjectId) return
    setUploading(true)
    const form = new FormData()
    form.append("owner_subject_id", subjectId)
    form.append("file", file)
    await fetch(`${FILES_API_BASE}/api/v1/uploads/managed`, { method: "POST", body: form, credentials: "include" })
    await fetch(`${API_BASE}/api/v1/documents/managed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_subject_id: subjectId, filename: file.name, content_type: file.type || "application/octet-stream" }),
      credentials: "include",
    })
    await loadDocuments(subjectId)
    setUploading(false)
  }

  async function runSearch() {
    if (!query.trim()) {
      setHits([])
      return
    }
    if (!subjectId) return
    const response = await fetch(`${API_BASE}/api/v1/search?owner_subject_id=${subjectId}&q=${encodeURIComponent(query)}`, { credentials: "include" })
    setHits(await response.json())
  }

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">D</div><div><strong>Documents</strong><span>digital vault</span></div></div>
        <nav>{nav.map(([Icon, label], index) => <a className={index === 0 ? "active" : ""} href="#" key={label}><Icon size={17} />{label}</a>)}</nav>
        <section className="storage-card"><span>Аккаунт</span><strong>{subjectId ?? "Нужен вход"}</strong><small>Managed + Яндекс Диск</small></section>
      </aside>

      <section className="content">
        <header className="hero">
          <div><p>Умный архив</p><h1>Найдите документ по смыслу, а не по названию.</h1></div>
          <div className="hero-actions">
            <label className="upload-button">{uploading ? "Загрузка..." : "Загрузить файл"}<input type="file" onChange={(event) => event.target.files?.[0] && uploadManaged(event.target.files[0])} /></label>
            <label className="searchbox"><ScanSearch size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="найди договор, где был залог 2000 евро" /></label>
          </div>
        </header>
        <section className="document-grid">
          {visibleDocuments.map((document) => (
            <button className="doc-card" key={document.id} onClick={() => setSelectedId(document.id)}>
              <div className="paper" />
              <h2>{document.filename}</h2>
              <p>{document.storage_mode === "external" ? "Яндекс Диск" : "Наше хранилище"}</p>
              <span className="pill mint">AI: {document.analysis_status}</span>
            </button>
          ))}
          {!visibleDocuments.length && <div className="empty-state">Документы пока не найдены.</div>}
        </section>
      </section>

      <aside className="inspector">
        <div className="preview"><span>Предпросмотр</span><strong>{selected?.filename ?? "Выберите документ"}</strong></div>
        <section><h2>Статус</h2><p>Preview: {selected?.preview_status ?? "—"}<br />Analysis: {selected?.analysis_status ?? "—"}</p></section>
        <section><h2>AI summary</h2><p>После обработки здесь появятся summary, сущности и найденные события.</p></section>
      </aside>
    </main>
  )
}
