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
const INTEGRATIONS_API_BASE = process.env.NEXT_PUBLIC_INTEGRATIONS_API_BASE_URL || "http://localhost:8310"
const ONLYOFFICE_BASE = process.env.NEXT_PUBLIC_ONLYOFFICE_BASE_URL || "http://localhost:8088"

function platformUrl(base: string, apiPath: string) {
  const normalized = base.replace(/\/$/, "")
  if (/\/(files-api|integrations-api)$/.test(normalized)) return `${normalized}${apiPath.replace(/^\/api/, "")}`
  return `${normalized}${apiPath}`
}

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
  asset_id: string | null
  analysis_status: string
  preview_status: string
}

type SearchHit = { document_id: string; score: number }
type Group = {
  kind: string
  title: string
  items: { name: string; document_count: number }[]
}
type EventProposal = {
  id: string
  title: string
  starts_at: string
  description: string | null
  confirmed: boolean
  priority?: string
}
type YandexStatus = {
  credentials_configured: boolean
  connected: boolean
  watched_sources: { id: string; root_path: string }[]
  last_sync_status: string | null
  last_sync_at: string | null
}
type OnlyOfficeConfig = {
  document: { fileType: string; key: string; title: string; url: string }
  editorConfig: { mode: string }
  width?: string
  height?: string
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: OnlyOfficeConfig) => { destroyEditor?: () => void }
    }
  }
}

export default function Home() {
  const [subjectId, setSubjectId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [eventProposals, setEventProposals] = useState<EventProposal[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewConfig, setPreviewConfig] = useState<OnlyOfficeConfig | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [storageMode, setStorageMode] = useState<"managed" | "yandex_disk">("managed")
  const [watchedPath, setWatchedPath] = useState("/Docs")
  const [activeView, setActiveView] = useState<"documents" | "integrations">("documents")
  const [yandexClientId, setYandexClientId] = useState("")
  const [yandexClientSecret, setYandexClientSecret] = useState("")
  const [yandexStatus, setYandexStatus] = useState<YandexStatus | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/auth/session`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((session: { subject_id: string }) => setSubjectId(session.subject_id))
      .catch(() => {
        const returnTo = encodeURIComponent(window.location.href)
        window.location.href = `https://auth.nerior.ru/login?return_to=${returnTo}`
      })
  }, [])

  async function loadDocuments(activeSubjectId: string) {
    const response = await fetch(`${API_BASE}/api/v1/documents?owner_subject_id=${activeSubjectId}`, { credentials: "include" })
    const items: DocumentItem[] = await response.json()
    setDocuments(items)
    setSelectedId((current) => current ?? items[0]?.id ?? null)
  }

  async function loadGroups(activeSubjectId: string) {
    const response = await fetch(`${API_BASE}/api/v1/groups?owner_subject_id=${activeSubjectId}`, { credentials: "include" })
    if (!response.ok) return
    setGroups(await response.json())
  }

  useEffect(() => {
    if (!subjectId) return
    loadDocuments(subjectId).catch(() => setDocuments([]))
    loadGroups(subjectId).catch(() => setGroups([]))
    loadYandexStatus(subjectId).catch(() => setYandexStatus(null))
  }, [subjectId])

  async function loadYandexStatus(activeSubjectId: string) {
    const response = await fetch(platformUrl(INTEGRATIONS_API_BASE, `/api/v1/providers/yandex-disk/status?owner_subject_id=${activeSubjectId}`), { credentials: "include" })
    if (response.ok) setYandexStatus(await response.json())
  }

  const visibleDocuments = useMemo(() => {
    if (!hits.length) return documents
    const allowed = new Set(hits.map((hit) => hit.document_id))
    return documents.filter((document) => allowed.has(document.id))
  }, [documents, hits])

  const selected = documents.find((document) => document.id === selectedId)

  useEffect(() => {
    if (!selectedId) return
    fetch(`${API_BASE}/api/v1/documents/${selectedId}/event-proposals`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : [])
      .then((items: EventProposal[]) => setEventProposals(items))
      .catch(() => setEventProposals([]))
  }, [selectedId])

  useEffect(() => {
    if (!selected?.asset_id) {
      setPreviewId(null)
      setPreviewConfig(null)
      return
    }
    fetch(`${API_BASE}/api/v1/documents/${selected.id}/preview`, { method: "POST", credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((preview: { preview_id: string }) => setPreviewId(preview.preview_id))
      .catch(() => setPreviewId(null))
  }, [selected?.id, selected?.asset_id])

  useEffect(() => {
    if (!previewId) return
    const heartbeat = window.setInterval(() => {
      fetch(platformUrl(FILES_API_BASE, `/api/v1/previews/${previewId}/heartbeat`), { method: "POST", credentials: "include" }).catch(() => undefined)
    }, 30000)
    return () => {
      window.clearInterval(heartbeat)
      fetch(platformUrl(FILES_API_BASE, `/api/v1/previews/${previewId}/close`), { method: "POST", credentials: "include", keepalive: true }).catch(() => undefined)
    }
  }, [previewId])

  useEffect(() => {
    if (!previewId) {
      setPreviewConfig(null)
      return
    }
    fetch(platformUrl(FILES_API_BASE, `/api/v1/previews/${previewId}/editor-config`), { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((config: OnlyOfficeConfig) => setPreviewConfig(config))
      .catch(() => setPreviewConfig(null))
  }, [previewId])

  async function uploadManaged(file: File) {
    if (!subjectId) return
    setUploading(true)
    const form = new FormData()
    form.append("owner_subject_id", subjectId)
    form.append("file", file)
    const uploadResponse = await fetch(platformUrl(FILES_API_BASE, "/api/v1/uploads/managed"), { method: "POST", body: form, credentials: "include" })
    const uploadedAsset: { asset_id: string } = await uploadResponse.json()
    await fetch(`${API_BASE}/api/v1/documents/managed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_subject_id: subjectId, filename: file.name, content_type: file.type || "application/octet-stream", asset_id: uploadedAsset.asset_id }),
      credentials: "include",
    })
    await loadDocuments(subjectId)
    setUploading(false)
  }

  async function connectWatchedFolder() {
    if (!subjectId) return
    const connectionsResponse = await fetch(platformUrl(INTEGRATIONS_API_BASE, `/api/v1/connections?owner_subject_id=${subjectId}`), { credentials: "include" })
    const connections: { id: string; provider: string }[] = connectionsResponse.ok ? await connectionsResponse.json() : []
    const yandexConnection = connections.find((connection) => connection.provider === "yandex_disk")
    if (!yandexConnection) return
    await fetch(platformUrl(INTEGRATIONS_API_BASE, "/api/v1/watched-sources"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_subject_id: subjectId, provider: "yandex_disk", root_path: watchedPath, connection_id: yandexConnection.id }),
      credentials: "include",
    })
    await loadYandexStatus(subjectId)
  }

  async function connectYandexDisk() {
    if (!subjectId) return
    const response = await fetch(platformUrl(INTEGRATIONS_API_BASE, `/api/v1/oauth/yandex-disk/authorize?owner_subject_id=${subjectId}`), { credentials: "include" })
    if (!response.ok) return
    const payload: { authorization_url: string } = await response.json()
    window.location.href = payload.authorization_url
  }

  async function saveYandexCredentials() {
    if (!subjectId) return
    await fetch(platformUrl(INTEGRATIONS_API_BASE, "/api/v1/providers/yandex-disk/credentials"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_subject_id: subjectId, client_id: yandexClientId, client_secret: yandexClientSecret }),
      credentials: "include",
    })
    setYandexClientSecret("")
    await loadYandexStatus(subjectId)
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
        <nav>{nav.map(([Icon, label], index) => <button className={(index === 0 && activeView === "documents") || (label === "Интеграции" && activeView === "integrations") ? "active" : ""} key={label} onClick={() => setActiveView(label === "Интеграции" ? "integrations" : "documents")}><Icon size={17} />{label}</button>)}</nav>
        <section className="storage-card"><span>Аккаунт</span><strong>{subjectId ?? "Нужен вход"}</strong><small>Managed + Яндекс Диск</small></section>
        <section className="integration-card">
          <span>Режим хранения</span>
          <select value={storageMode} onChange={(event) => setStorageMode(event.target.value as "managed" | "yandex_disk")}>
            <option value="managed">Хранить у нас</option>
            <option value="yandex_disk">Мой Яндекс Диск</option>
          </select>
          {storageMode === "yandex_disk" && <>
            <button onClick={connectYandexDisk}>Подключить Яндекс Диск</button>
            <input value={watchedPath} onChange={(event) => setWatchedPath(event.target.value)} placeholder="/Docs" />
            <button onClick={connectWatchedFolder}>Подключить папку</button>
          </>}
        </section>
      </aside>

      <section className="content">
        {activeView === "integrations" ? (
          <section className="integrations-screen">
            <header><p>Интеграции</p><h1>Яндекс Диск</h1></header>
            <article className="integration-panel">
              <div className="status-row">
                <strong>{yandexStatus?.connected ? "Подключён" : "Не подключён"}</strong>
                <span>{yandexStatus?.credentials_configured ? "OAuth credentials настроены" : "Нужны client id и secret"}</span>
              </div>
              <label>Client ID<input value={yandexClientId} onChange={(event) => setYandexClientId(event.target.value)} placeholder="Введите client id" /></label>
              <label>Client Secret<input type="password" value={yandexClientSecret} onChange={(event) => setYandexClientSecret(event.target.value)} placeholder="Введите client secret" /></label>
              <div className="integration-actions">
                <button onClick={saveYandexCredentials}>Сохранить зашифрованно</button>
                <button onClick={connectYandexDisk} disabled={!yandexStatus?.credentials_configured}>Авторизовать диск</button>
              </div>
              <div className="watched-folder-form">
                <label>Отслеживаемая папка<input value={watchedPath} onChange={(event) => setWatchedPath(event.target.value)} /></label>
                <button onClick={connectWatchedFolder} disabled={!yandexStatus?.connected}>Подключить папку</button>
              </div>
              <div className="sync-meta">
                <span>Последний статус: {yandexStatus?.last_sync_status ?? "ещё не запускалась"}</span>
                <span>Последняя синхронизация: {yandexStatus?.last_sync_at ?? "—"}</span>
              </div>
              <div className="watched-list">
                {(yandexStatus?.watched_sources ?? []).map((source) => <span key={source.id}>{source.root_path}</span>)}
              </div>
            </article>
          </section>
        ) : <>
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
        {!!groups.length && (
          <section className="group-board">
            {groups.map((group) => (
              <article key={group.kind}>
                <span>{group.title}</span>
                <div>
                  {group.items.map((item) => (
                    <button key={item.name} type="button" onClick={() => setQuery(item.name)}>
                      {item.name}
                      <em>{item.document_count}</em>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
        </>}
      </section>

      <aside className="inspector">
        <PreviewSurface document={selected} config={previewConfig} />
        <section><h2>Статус</h2><p>Preview: {selected?.preview_status ?? "—"}<br />Analysis: {selected?.analysis_status ?? "—"}</p></section>
        <section><h2>AI summary</h2><p>После обработки здесь появятся summary, сущности и найденные события.</p></section>
        <section>
          <h2>Найденные события</h2>
          {!eventProposals.length && <p>Пока нет предложений из документа.</p>}
          {eventProposals.map((proposal) => (
            <EditableEventCard
              key={proposal.id}
              proposal={proposal}
              onConfirmed={(updated) => setEventProposals((items) => items.map((item) => item.id === updated.id ? updated : item))}
            />
          ))}
        </section>
      </aside>
    </main>
  )
}

function EditableEventCard({ proposal, onConfirmed }: { proposal: EventProposal; onConfirmed: (proposal: EventProposal) => void }) {
  const [title, setTitle] = useState(proposal.title)
  const [startsAt, setStartsAt] = useState(proposal.starts_at)
  const [description, setDescription] = useState(proposal.description ?? "")
  const [priority, setPriority] = useState(proposal.priority ?? "normal")
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    const response = await fetch(`${API_BASE}/api/v1/event-proposals/${proposal.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, starts_at: startsAt, description, priority }),
    })
    if (response.ok) onConfirmed(await response.json())
    setSaving(false)
  }

  return (
    <article className="event-card">
      <input value={title} onChange={(event) => setTitle(event.target.value)} />
      <input value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Описание" />
      <select value={priority} onChange={(event) => setPriority(event.target.value)}>
        <option value="low">Низкий</option>
        <option value="normal">Обычный</option>
        <option value="high">Высокий</option>
      </select>
      <button disabled={proposal.confirmed || saving} onClick={confirm}>
        {proposal.confirmed ? "Добавлено" : saving ? "Добавляем..." : "Добавить в календарь"}
      </button>
    </article>
  )
}

function PreviewSurface({ document, config }: { document?: DocumentItem; config: OnlyOfficeConfig | null }) {
  const extension = document?.filename.split(".").pop()?.toLowerCase()
  const contentUrl = document?.asset_id ? `${FILES_API_BASE}/api/v1/assets/${document.asset_id}/content` : null

  if (!document) {
    return <div className="preview empty"><span>Предпросмотр</span><strong>Выберите документ</strong></div>
  }

  if (!contentUrl) {
    return <div className="preview empty"><span>Предпросмотр</span><strong>{document.filename}</strong><small>Оригинал ещё не готов к просмотру</small></div>
  }

  if (extension === "pdf") {
    return <iframe className="preview-frame" title={document.filename} src={contentUrl} />
  }

  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension ?? "")) {
    return <img className="preview-image" alt={document.filename} src={contentUrl} />
  }

  if (["docx", "xlsx", "pptx", "doc", "xls", "ppt"].includes(extension ?? "") && config) {
    return <OnlyOfficePreview config={config} />
  }

  return <div className="preview empty"><span>Предпросмотр</span><strong>{document.filename}</strong><small>Для этого формата готовится viewer</small></div>
}

function OnlyOfficePreview({ config }: { config: OnlyOfficeConfig }) {
  useEffect(() => {
    let editor: { destroyEditor?: () => void } | undefined
    let cancelled = false
    const scriptId = "onlyoffice-docs-api"
    const mount = () => {
      if (cancelled || !window.DocsAPI) return
      editor = new window.DocsAPI.DocEditor("onlyoffice-preview", {
        ...config,
        width: "100%",
        height: "100%",
      })
    }
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existing) {
      if (window.DocsAPI) mount()
      else existing.addEventListener("load", mount, { once: true })
    } else {
      const script = document.createElement("script")
      script.id = scriptId
      script.src = `${ONLYOFFICE_BASE}/web-apps/apps/api/documents/api.js`
      script.onload = mount
      document.body.appendChild(script)
    }
    return () => {
      cancelled = true
      editor?.destroyEditor?.()
    }
  }, [config])

  return <div className="onlyoffice-preview" id="onlyoffice-preview" />
}
