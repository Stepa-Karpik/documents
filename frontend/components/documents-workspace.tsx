"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Bell,
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
  ["recent", Clock3, "Последние"],
  ["documents", FileText, "Все документы"],
  ["groups", Sparkles, "AI-группы"],
  ["companies", Building2, "Компании"],
  ["people", Users, "Люди"],
  ["projects", FolderKanban, "Проекты"],
  ["finance", Landmark, "Финансы"],
  ["history", History, "История"],
  ["feed", Bell, "Лента"],
  ["integrations", Link2, "Интеграции"],
] as const

type ActiveSection = typeof nav[number][0]

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
type YandexUploadedFile = { provider: string; external_file_id: string; external_path: string; filename: string; revision: string; content_type: string }

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

export default function DocumentsWorkspace({ initialSection = "recent" }: { initialSection?: ActiveSection }) {
  const [subjectId, setSubjectId] = useState<string | null>(null)
  const [accountLabel, setAccountLabel] = useState<string | null>(null)
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
  const [activeSection] = useState<ActiveSection>(initialSection)
  const [yandexStatus, setYandexStatus] = useState<YandexStatus | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [integrationNotice, setIntegrationNotice] = useState<string | null>(null)
  const [yandexVerificationCode, setYandexVerificationCode] = useState("")

  useEffect(() => {
    const saved = localStorage.getItem("docs_storage_mode")
    if (saved === "managed" || saved === "yandex_disk") setStorageMode(saved)
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/auth/session`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((session: { subject_id: string; username?: string | null; email?: string | null; display_name?: string | null }) => {
        setSubjectId(session.subject_id)
        setAccountLabel(session.display_name || session.username || session.email || session.subject_id)
      })
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

  useEffect(() => {
    const firstSource = yandexStatus?.watched_sources?.[0]?.root_path
    if (firstSource) setWatchedPath(firstSource)
  }, [yandexStatus?.watched_sources])

  useEffect(() => {
    if (!subjectId || !yandexStatus?.connected || !(yandexStatus.watched_sources ?? []).length) return
    syncYandexSources(yandexStatus).catch(() => undefined)
    const timer = window.setInterval(() => {
      syncYandexSources(yandexStatus).catch(() => undefined)
    }, 30000)
    return () => window.clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, yandexStatus?.connected, yandexStatus?.watched_sources?.map((source) => source.id).join(",")])

  async function loadYandexStatus(activeSubjectId: string) {
    const response = await fetch(platformUrl(INTEGRATIONS_API_BASE, `/api/v1/providers/yandex-disk/status?owner_subject_id=${activeSubjectId}`), { credentials: "include" })
    if (response.ok) setYandexStatus(await response.json())
  }

  async function syncYandexSources(status: YandexStatus | null = yandexStatus) {
    if (!subjectId || !status?.connected) return
    const sources = status.watched_sources ?? []
    if (!sources.length) return
    await Promise.allSettled(sources.map((source) => fetch(platformUrl(INTEGRATIONS_API_BASE, `/api/v1/watched-sources/${source.id}/sync-now`), { method: "POST", credentials: "include" })))
    await loadDocuments(subjectId)
    await loadYandexStatus(subjectId)
  }

  const visibleDocuments = useMemo(() => {
    let items = documents
    if (hits.length) {
      const allowed = new Set(hits.map((hit) => hit.document_id))
      items = items.filter((document) => allowed.has(document.id))
    }
    if (activeSection === "recent") return items.slice(0, 8)
    return items
  }, [documents, hits, activeSection])

  const selected = documents.find((document) => document.id === selectedId)

  useEffect(() => {
    if (!selectedId) return
    if (!previewOpen) return
    fetch(`${API_BASE}/api/v1/documents/${selectedId}/event-proposals`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : [])
      .then((items: EventProposal[]) => setEventProposals(items))
      .catch(() => setEventProposals([]))
  }, [selectedId, previewOpen])

  useEffect(() => {
    if (!previewOpen || !selected?.asset_id) {
      setPreviewId(null)
      setPreviewConfig(null)
      return
    }
    fetch(`${API_BASE}/api/v1/documents/${selected.id}/preview`, { method: "POST", credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((preview: { preview_id: string }) => setPreviewId(preview.preview_id))
      .catch(() => setPreviewId(null))
  }, [previewOpen, selected?.id, selected?.asset_id])

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

  async function uploadFile(file: File) {
    if (!subjectId) return
    setUploading(true)
    try {
      if (storageMode === "yandex_disk") {
        if (!yandexStatus?.connected) {
          setIntegrationNotice("Сначала подключите Яндекс Диск в интеграциях.")
          window.location.href = "/integrations"
          return
        }
        const form = new FormData()
        form.append("owner_subject_id", subjectId)
        form.append("provider", "yandex_disk")
        form.append("root_path", watchedPath || yandexStatus.watched_sources[0]?.root_path || "/Docs")
        form.append("file", file)
        const uploadResponse = await fetch(platformUrl(INTEGRATIONS_API_BASE, "/api/v1/external-files/upload"), { method: "POST", body: form, credentials: "include" })
        if (!uploadResponse.ok) throw new Error("yandex upload failed")
        const uploaded: YandexUploadedFile = await uploadResponse.json()
        const assetResponse = await fetch(platformUrl(FILES_API_BASE, "/api/v1/assets/external"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_subject_id: subjectId,
            provider: uploaded.provider,
            external_file_id: uploaded.external_file_id,
            external_path: uploaded.external_path,
            filename: uploaded.filename,
            revision: uploaded.revision,
            content_type: uploaded.content_type,
          }),
          credentials: "include",
        })
        if (!assetResponse.ok) throw new Error("external asset registration failed")
        const asset: { asset_id: string } = await assetResponse.json()
        await fetch(`${API_BASE}/api/v1/documents/external/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_subject_id: subjectId,
            provider: uploaded.provider,
            external_file_id: uploaded.external_file_id,
            external_path: uploaded.external_path,
            filename: uploaded.filename,
            revision: uploaded.revision,
            content_type: uploaded.content_type,
            asset_id: asset.asset_id,
          }),
          credentials: "include",
        })
      } else {
        const form = new FormData()
        form.append("owner_subject_id", subjectId)
        form.append("file", file)
        const uploadResponse = await fetch(platformUrl(FILES_API_BASE, "/api/v1/uploads/managed"), { method: "POST", body: form, credentials: "include" })
        if (!uploadResponse.ok) throw new Error("managed upload failed")
        const uploadedAsset: { asset_id: string } = await uploadResponse.json()
        await fetch(`${API_BASE}/api/v1/documents/managed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner_subject_id: subjectId, filename: file.name, content_type: file.type || "application/octet-stream", asset_id: uploadedAsset.asset_id }),
          credentials: "include",
        })
      }
      await loadDocuments(subjectId)
    } catch {
      setIntegrationNotice("Не удалось загрузить файл. Проверьте подключение и попробуйте ещё раз.")
    } finally {
      setUploading(false)
    }
  }

  async function connectWatchedFolder() {
    if (!subjectId) return
    const connectionsResponse = await fetch(platformUrl(INTEGRATIONS_API_BASE, `/api/v1/connections?owner_subject_id=${subjectId}`), { credentials: "include" })
    const connections: { id: string; provider: string }[] = connectionsResponse.ok ? await connectionsResponse.json() : []
    const yandexConnection = connections.find((connection) => connection.provider === "yandex_disk")
    if (!yandexConnection) {
      setIntegrationNotice("Сначала авторизуйте Яндекс Диск через OAuth.")
      return
    }
    const response = await fetch(platformUrl(INTEGRATIONS_API_BASE, "/api/v1/watched-sources"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_subject_id: subjectId, provider: "yandex_disk", root_path: watchedPath, connection_id: yandexConnection.id }),
      credentials: "include",
    })
    if (!response.ok) {
      setIntegrationNotice("Не удалось сохранить отслеживаемую папку.")
      return
    }
    setIntegrationNotice(`Папка ${watchedPath} выбрана. Если её нет на диске, мы создадим её автоматически.`)
    await loadYandexStatus(subjectId)
  }

  async function connectYandexDisk() {
    if (!subjectId) return
    const response = await fetch(platformUrl(INTEGRATIONS_API_BASE, `/api/v1/oauth/yandex-disk/authorize?owner_subject_id=${subjectId}`), { credentials: "include" })
    if (!response.ok) {
      setIntegrationNotice("Авторизация Яндекс Диска пока недоступна.")
      return
    }
    const payload: { authorization_url: string } = await response.json()
    window.open(payload.authorization_url, "_blank", "noopener,noreferrer")
    setIntegrationNotice("После подтверждения в Яндексе вставьте код ниже и нажмите «Подключить».")
  }

  async function submitYandexVerificationCode() {
    if (!subjectId || !yandexVerificationCode.trim()) return
    const response = await fetch(platformUrl(INTEGRATIONS_API_BASE, "/api/v1/oauth/yandex-disk/verification-code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_subject_id: subjectId, code: yandexVerificationCode.trim() }),
      credentials: "include",
    })
    if (!response.ok) {
      setIntegrationNotice("Код не принят. Проверьте код подтверждения и попробуйте ещё раз.")
      return
    }
    setYandexVerificationCode("")
    setIntegrationNotice("Яндекс Диск подключён.")
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

  const meaningfulGroups = useMemo(() => groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => isUsefulGroupName(item.name)),
  })).filter((group) => group.items.length > 0), [groups])

  const sectionTitle = nav.find(([key]) => key === activeSection)?.[2] ?? "Документы"

  return (
    <main className="workspace-shell">
      <aside className="sidebar" aria-label="Documents navigation">
        <div className="brand">
          <div className="brand-mark">SP</div>
          <div><strong>Nerior Docs</strong><span>digital vault</span></div>
        </div>
        <div className="nav-card">
          <span className="nav-caption">Навигация</span>
          <nav>{nav.map(([key, Icon, label]) => (
            <Link className={activeSection === key ? "active" : ""} key={key} href={`/${key}`}>
              <Icon size={17} />{label}
            </Link>
          ))}</nav>
        </div>
        <div className="sidebar-spacer" />
        <Link className="side-link" href="/integrations"><Link2 size={16} />Интеграции</Link>
        <div className="account-pill"><Users size={15} /><span>{accountLabel ?? "Нужен вход"}</span></div>
        <button className="side-link danger" type="button" onClick={() => { window.location.href = "https://auth.nerior.ru/logout" }}>Выйти</button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="topbar-icon"><FileText size={16} /></div>
          <div><strong>{sectionTitle}</strong><span>Интеллектуальный архив Nerior</span></div>
        </header>

        {activeSection === "integrations" ? (
          <section className="screen narrow-screen">
            <div className="page-head"><h1>Интеграции</h1><p>Выберите, где будут лежать оригиналы документов.</p></div>
            <article className="panel integration-panel">
              <div className="panel-head">
                <div><h2>Хранение файлов</h2></div>
                <span className={`status-badge ${storageMode === "managed" || yandexStatus?.connected ? "ok" : "warn"}`}>{storageMode === "managed" ? "Наше хранилище" : yandexStatus?.connected ? "Подключён" : "Не подключён"}</span>
              </div>

              <div className="storage-switch" role="group" aria-label="Режим хранения">
                <button className={storageMode === "managed" ? "selected" : ""} onClick={() => { setStorageMode("managed"); localStorage.setItem("docs_storage_mode", "managed") }}>Хранить у нас</button>
                <button className={storageMode === "yandex_disk" ? "selected" : ""} onClick={() => { setStorageMode("yandex_disk"); localStorage.setItem("docs_storage_mode", "yandex_disk") }}>Мой Яндекс Диск</button>
              </div>

              <div className={`yandex-settings ${storageMode === "yandex_disk" ? "open" : "closed"}`} aria-hidden={storageMode !== "yandex_disk"}>
                {!yandexStatus?.connected && (
                  <div className="button-row">
                    <button onClick={connectYandexDisk} disabled={!yandexStatus?.credentials_configured}>Авторизовать диск</button>
                  </div>
                )}

                {!yandexStatus?.connected && (
                  <div className="code-row">
                    <label>Код подтверждения<input value={yandexVerificationCode} onChange={(event) => setYandexVerificationCode(event.target.value)} placeholder="Код из Яндекса" /></label>
                    <button onClick={submitYandexVerificationCode} disabled={!yandexVerificationCode.trim()}>Подключить</button>
                  </div>
                )}

                {yandexStatus?.connected && (
                  <div className="folder-row">
                    <label>Папка на диске<input value={watchedPath} onChange={(event) => setWatchedPath(event.target.value)} placeholder="/Docs" /></label>
                    <button onClick={connectWatchedFolder}>Сохранить</button>
                    <button onClick={() => syncYandexSources()}>Обновить</button>
                  </div>
                )}
                {integrationNotice && <p className="notice">{integrationNotice}</p>}
                {!!(yandexStatus?.watched_sources ?? []).length && <div className="watched-list">{yandexStatus?.watched_sources.map((source) => <span key={source.id}>{source.root_path}</span>)}</div>}
              </div>
            </article>
          </section>
        ) : (
          <section className="screen">
            <div className="hero-card">
              <div><p>Умный архив · {sectionTitle}</p><h1>Найдите документ по смыслу, срокам и контексту.</h1></div>
              <div className="hero-actions">
                <label className="upload-button">{uploading ? "Загрузка..." : "Загрузить файл"}<input type="file" onChange={(event) => event.target.files?.[0] && uploadFile(event.target.files[0])} /></label>
                <label className="searchbox"><ScanSearch size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder="найди договор, где был залог 2000 евро" /></label>
              </div>
            </div>

            {activeSection === "groups" ? (
              <section className="panel group-section">
                <h2>AI-группы</h2>
                {!meaningfulGroups.length && <div className="empty-state">AI-группы появятся после извлечения осмысленных сущностей: компаний, людей, проектов, недвижимости, финансов и документов. Числовой шум скрыт.</div>}
                {!!meaningfulGroups.length && <div className="group-board">{meaningfulGroups.map((group) => <article key={group.kind}><span>{group.title}</span><div>{group.items.map((item) => <button key={item.name} type="button" onClick={() => setQuery(item.name)}>{item.name}<em>{item.document_count}</em></button>)}</div></article>)}</div>}
              </section>
            ) : (
              <section className="document-grid">
                {visibleDocuments.map((document) => (
                  <button className={`doc-card ${selectedId === document.id ? "selected" : ""}`} key={document.id} onClick={() => { setSelectedId(document.id); setPreviewOpen(true) }}>
                    <div className="paper"><FileText size={26} /></div>
                    <h2>{document.filename}</h2>
                    <p>{document.storage_mode === "external" ? "Яндекс Диск" : "Наше хранилище"}</p>
                    <span className="pill mint">AI: {document.analysis_status}</span>
                  </button>
                ))}
                {!visibleDocuments.length && <div className="empty-state">Документы пока не найдены.</div>}
              </section>
            )}
          </section>
        )}
      </section>

      {previewOpen && selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false) }}>
          <section className="preview-modal">
            <header className="modal-head"><div><span>Предпросмотр</span><h2>{selected.filename}</h2></div><button onClick={() => setPreviewOpen(false)}>Закрыть</button></header>
            <div className="modal-body">
              <PreviewSurface document={selected} config={previewConfig} />
              <aside className="modal-insights">
                <section><h3>Статус</h3><p>Preview: {selected.preview_status}<br />Analysis: {selected.analysis_status}</p></section>
                <section><h3>AI summary</h3><p>После обработки здесь появятся summary, сущности и найденные события.</p></section>
                <section><h3>Найденные события</h3>{!eventProposals.length && <p>Пока нет предложений из документа.</p>}{eventProposals.map((proposal) => <EditableEventCard key={proposal.id} proposal={proposal} onConfirmed={(updated) => setEventProposals((items) => items.map((item) => item.id === updated.id ? updated : item))} />)}</section>
              </aside>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}


function isUsefulGroupName(name: string) {
  const normalized = name.trim()
  if (normalized.length < 3) return false
  if (/^\d+([.,]\d+)?$/.test(normalized)) return false
  if (/^[\d\s.,:;№#/-]+$/.test(normalized)) return false
  return /[a-zа-яё]/i.test(normalized)
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
  const contentUrl = document?.asset_id ? platformUrl(FILES_API_BASE, `/api/v1/assets/${document.asset_id}/content`) : null

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
