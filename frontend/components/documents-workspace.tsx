"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  Box,
  Building2,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Globe2,
  History,
  Languages,
  Link2,
  Plus,
  Search,
  Send,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  Users,
  X,
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
  ["cities", Globe2, "Города"],
  ["projects", FolderKanban, "Проекты"],
  ["companies", Building2, "Компании"],
  ["people", Users, "Люди"],
  ["trash", Trash2, "Корзина"],
  ["history", History, "История"],
  ["integrations", Link2, "Интеграции"],
] as const

type ActiveSection = typeof nav[number][0] | "finance" | "feed" | "support" | "groups"
type EntityKind = "person" | "company" | "project" | "finance" | "city"

type DocumentItem = {
  id: string
  filename: string
  storage_mode: "managed" | "external"
  asset_id: string | null
  content_type?: string | null
  analysis_status: string
  preview_status: string
  analysis_summary?: string | null
  analysis_entities?: string[]
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
  documentType?: string
  editorConfig: { mode: string }
  token?: string
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [locale, setLocale] = useState<"ru" | "en">("ru")
  const [theme, setTheme] = useState<"dark" | "light">("dark")
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
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState("all")
  const [projectFilter, setProjectFilter] = useState("all")
  const [storageFilter, setStorageFilter] = useState("all")

  const t = (ru: string, en: string) => locale === "ru" ? ru : en

  useEffect(() => {
    const savedTheme = localStorage.getItem("docs_theme")
    const savedLocale = localStorage.getItem("docs_locale")
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme)
    if (savedLocale === "ru" || savedLocale === "en") setLocale(savedLocale)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem("docs_theme", theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem("docs_locale", locale)
  }, [locale])

  useEffect(() => {
    const saved = localStorage.getItem("docs_storage_mode")
    if (saved === "managed" || saved === "yandex_disk") setStorageMode(saved)
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/auth/session`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((session: { subject_id: string; username?: string | null; email?: string | null; display_name?: string | null; role?: string | null; is_admin?: boolean | null }) => {
        setSubjectId(session.subject_id)
        setAccountLabel(session.display_name || session.username || session.email || session.subject_id)
        setIsAdmin(Boolean(session.is_admin || session.role === "admin"))
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
    const timer = window.setInterval(() => syncYandexSources(yandexStatus).catch(() => undefined), 30000)
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
    await loadGroups(subjectId)
    await loadYandexStatus(subjectId)
  }

  const selected = documents.find((document) => document.id === selectedId)
  const filteredDocuments = useMemo(() => {
    let items = documents
    if (hits.length) {
      const allowed = new Set(hits.map((hit) => hit.document_id))
      items = items.filter((document) => allowed.has(document.id))
    }
    if (query.trim() && !hits.length) {
      const needle = query.trim().toLowerCase()
      items = items.filter((document) => [document.filename, document.analysis_summary ?? "", ...(document.analysis_entities ?? [])].join(" ").toLowerCase().includes(needle))
    }
    if (typeFilter !== "all") items = items.filter((document) => fileTypeLabel(document.filename) === typeFilter)
    if (storageFilter !== "all") items = items.filter((document) => document.storage_mode === storageFilter)
    if (projectFilter !== "all") items = items.filter((document) => [document.filename, document.analysis_summary ?? "", ...(document.analysis_entities ?? [])].join(" ").toLowerCase().includes(projectFilter.toLowerCase()))
    if (activeSection === "recent") return items.slice(0, 10)
    return items
  }, [documents, hits, activeSection, query, typeFilter, storageFilter, projectFilter])

  const meaningfulGroups = useMemo(() => groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => isUsefulGroupName(item.name)),
  })).filter((group) => group.items.length > 0), [groups])

  const entityKind = sectionToEntityKind(activeSection)
  const entityGroup = entityKind ? meaningfulGroups.find((group) => group.kind === entityKind) : null
  const selectedEntity = selectedEntityName ? entityGroup?.items.find((item) => item.name === selectedEntityName) : entityGroup?.items[0]
  const entityDocuments = useMemo(() => {
    if (!selectedEntity) return []
    const tokens = entityTokens(selectedEntity.name)
    return documents.filter((document) => {
      const corpus = [document.filename, document.analysis_summary ?? '', ...(document.analysis_entities ?? [])].join(' ').toLowerCase()
      return tokens.some((token) => corpus.includes(token))
    })
  }, [documents, selectedEntity])

  useEffect(() => {
    if (entityGroup?.items.length && !entityGroup.items.some((item) => item.name === selectedEntityName)) {
      setSelectedEntityName(entityGroup.items[0].name)
    }
  }, [entityGroup, selectedEntityName])

  useEffect(() => {
    if (!selectedId || !previewOpen) return
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
          body: JSON.stringify({ owner_subject_id: subjectId, provider: uploaded.provider, external_file_id: uploaded.external_file_id, external_path: uploaded.external_path, filename: uploaded.filename, revision: uploaded.revision, content_type: uploaded.content_type }),
          credentials: "include",
        })
        if (!assetResponse.ok) throw new Error("external asset registration failed")
        const asset: { asset_id: string } = await assetResponse.json()
        await fetch(`${API_BASE}/api/v1/documents/external/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner_subject_id: subjectId, provider: uploaded.provider, external_file_id: uploaded.external_file_id, external_path: uploaded.external_path, filename: uploaded.filename, revision: uploaded.revision, content_type: uploaded.content_type, asset_id: asset.asset_id }),
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
      await loadGroups(subjectId)
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
    setIntegrationNotice(`Папка ${watchedPath} выбрана.`)
    await loadYandexStatus(subjectId)
    await syncYandexSources()
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
    if (response.ok) setHits(await response.json())
  }

  const sectionTitle = nav.find(([key]) => key === activeSection)?.[2] ?? (activeSection === "finance" ? t("Финансы", "Finance") : t("Документы", "Documents"))
  const projectOptions = useMemo(() => meaningfulGroups.find((group) => group.kind === "project")?.items.map((item) => item.name) ?? [], [meaningfulGroups])

  return (
    <main className="workspace-shell">
      <aside className="sidebar" aria-label="Documents navigation">
        <div className="brand">
          <div className="brand-mark">SP</div>
          <div><strong>Nerior Docs</strong><span>digital vault</span></div>
        </div>
        <div className="nav-card">
          <span className="nav-caption">{t("Навигация", "Navigation")}</span>
          <nav>{nav.map(([key, Icon, label]) => (
            <Link className={activeSection === key ? "active" : ""} key={key} href={`/${key}`}>
              <Icon size={16} />{label}
            </Link>
          ))}</nav>
        </div>
        <div className="sidebar-spacer" />
        <Link className="side-link" href="/support"><Globe2 size={15} />{t("Поддержка", "Support")}</Link>
        <button className="side-link" type="button" onClick={() => setLocale(locale === "ru" ? "en" : "ru")}><Languages size={15} />{locale.toUpperCase()}</button>
        <button className="side-link" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Sun size={15} />{theme === "dark" ? t("Светлая тема", "Light theme") : t("Тёмная тема", "Dark theme")}</button>
        <div className="account-pill"><UserRound size={15} /><span>{accountLabel ?? "Нужен вход"}</span></div>
        <button className="side-link danger" type="button" onClick={() => { window.location.href = "https://auth.nerior.ru/logout" }}><Send size={15} />{t("Выйти", "Logout")}</button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="topbar-left"><div className="topbar-icon"><FileText size={16} /></div><div><strong>{sectionTitle}</strong><span>Интеллектуальный архив Nerior</span></div></div>
          <div className="topbar-actions">
            <Link className="ghost-button" href="/feed"><Bell size={16} />{t("Лента", "Feed")}</Link>{isAdmin && <a className="ghost-button" href="https://admin.nerior.ru"><Box size={16} />{t("Админ панель", "Admin")}</a>}
          </div>
        </header>

        {activeSection === "integrations" ? (
          <IntegrationsScreen storageMode={storageMode} setStorageMode={setStorageMode} yandexStatus={yandexStatus} watchedPath={watchedPath} setWatchedPath={setWatchedPath} yandexVerificationCode={yandexVerificationCode} setYandexVerificationCode={setYandexVerificationCode} connectYandexDisk={connectYandexDisk} submitYandexVerificationCode={submitYandexVerificationCode} connectWatchedFolder={connectWatchedFolder} syncYandexSources={syncYandexSources} integrationNotice={integrationNotice} />
        ) : activeSection === "groups" ? (
          <GroupsScreen groups={meaningfulGroups} />
        ) : activeSection === "feed" ? (
          <FeedScreen locale={locale} />
        ) : activeSection === "support" ? (
          <SupportScreen locale={locale} />
        ) : entityKind ? (
          <EntityScreen kind={entityKind} title={sectionTitle} group={entityGroup} selected={selectedEntity ?? null} onSelect={setSelectedEntityName} documents={entityDocuments} onOpenDocument={(id) => { setSelectedId(id); setPreviewOpen(true) }} />
        ) : activeSection === "trash" ? (
          <EmptyPanel title="Корзина" text="Удалённые документы появятся здесь после включения мягкого удаления." />
        ) : activeSection === "history" ? (
          <EmptyPanel title="История" text="Здесь будет лента загрузок, просмотров, синхронизаций и AI-обработки." />
        ) : (
          <DocumentsTable title={activeSection === "recent" ? t("Последние", "Recent") : t("Все документы", "All documents")} documents={filteredDocuments} allDocuments={documents} query={query} setQuery={setQuery} runSearch={runSearch} onOpenDocument={(id) => { setSelectedId(id); setPreviewOpen(true) }} uploading={uploading} uploadFile={uploadFile} typeFilter={typeFilter} setTypeFilter={setTypeFilter} projectFilter={projectFilter} setProjectFilter={setProjectFilter} projectOptions={projectOptions} storageFilter={storageFilter} setStorageFilter={setStorageFilter} locale={locale} />
        )}
      </section>

      {previewOpen && selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false) }}>
          <section className="preview-modal">
            <header className="modal-head">
              <div><span>Предпросмотр</span><h2>{selected.filename}</h2></div>
              <div className="modal-actions">
                {selected.asset_id && <a className="download-button" href={platformUrl(FILES_API_BASE, `/api/v1/assets/${selected.asset_id}/download`)}><Download size={17} />Скачать</a>}
                <button onClick={() => setPreviewOpen(false)}><X size={17} />Закрыть</button>
              </div>
            </header>
            <div className="modal-body">
              <PreviewSurface document={selected} config={previewConfig} />
              <aside className="modal-insights">
                <section><h3>{t("Статус", "Status")}</h3><p><StatusBadge status={selected.preview_status} locale={locale} /><br /><StatusBadge status={selected.analysis_status} locale={locale} /></p></section>
                <section><h3>AI summary</h3><p>{selected.analysis_summary || "После обработки здесь появятся summary, сущности и найденные события."}</p></section>
                <section><h3>Найденные события</h3>{!eventProposals.length && <p>Пока нет предложений из документа.</p>}{eventProposals.map((proposal) => <EditableEventCard key={proposal.id} proposal={proposal} onConfirmed={(updated) => setEventProposals((items) => items.map((item) => item.id === updated.id ? updated : item))} />)}</section>
              </aside>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function DocumentsTable({ title, documents, allDocuments, query, setQuery, runSearch, onOpenDocument, uploading, uploadFile, typeFilter, setTypeFilter, projectFilter, setProjectFilter, projectOptions, storageFilter, setStorageFilter, locale }: { title: string; documents: DocumentItem[]; allDocuments: DocumentItem[]; query: string; setQuery: (value: string) => void; runSearch: () => void; onOpenDocument: (id: string) => void; uploading: boolean; uploadFile: (file: File) => void; typeFilter: string; setTypeFilter: (value: string) => void; projectFilter: string; setProjectFilter: (value: string) => void; projectOptions: string[]; storageFilter: string; setStorageFilter: (value: string) => void; locale: "ru" | "en" }) {
  const t = (ru: string, en: string) => locale === "ru" ? ru : en
  const typeOptions = Array.from(new Set(allDocuments.map((document) => fileTypeLabel(document.filename)))).sort()
  return <section className="screen wide-screen"><div className="page-panel"><div className="documents-head"><div><h1>{title}</h1><p>{documents.length} {t("документов", "documents")}</p></div></div><div className="filter-row"><label className="searchbox"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runSearch()} placeholder={t("Поиск по названию и содержанию...", "Search by name and content...")} /></label><select className="filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">{t("Все типы", "All types")}</option>{typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select><select className="filter-select" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">{t("Все проекты", "All projects")}</option>{projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}</select><select className="filter-select" value={storageFilter} onChange={(event) => setStorageFilter(event.target.value)}><option value="all">{t("Хранилище", "Storage")}</option><option value="managed">{t("Сервер", "Server")}</option><option value="external">{t("Яндекс Диск", "Yandex Disk")}</option></select><label className="upload-button table-upload"><Plus size={16} />{uploading ? t("Загрузка...", "Uploading...") : t("Загрузить файл", "Upload file")}<input type="file" onChange={(event) => event.target.files?.[0] && uploadFile(event.target.files[0])} /></label></div><div className="documents-table"><div className="table-row table-header"><span>{t("Название", "Name")}</span><span>{t("Тип", "Type")}</span><span>{t("Хранилище", "Storage")}</span><span>{t("Изменено", "Modified")}</span><span>AI</span><span>{t("Статус", "Status")}</span></div>{documents.map((document) => <button className="table-row" key={document.id} onClick={() => onOpenDocument(document.id)}><span className="file-name"><FileIcon filename={document.filename} />{document.filename}</span><span>{fileTypeLabel(document.filename)}</span><span>{document.storage_mode === "external" ? t("Яндекс Диск", "Yandex Disk") : t("Сервер", "Server")}</span><span>—</span><span><StatusBadge status={document.analysis_status} locale={locale} /></span><span><StatusBadge status={document.preview_status} locale={locale} /></span></button>)}{!documents.length && <div className="empty-state">{t("Документы пока не найдены.", "No documents found yet.")}</div>}</div></div></section>
}

function EntityScreen({ kind, title, group, selected, onSelect, documents, onOpenDocument }: { kind: EntityKind; title: string; group: Group | null | undefined; selected: { name: string; document_count: number } | null; onSelect: (name: string) => void; documents: DocumentItem[]; onOpenDocument: (id: string) => void }) {
  const items = group?.items ?? []
  return <section className="screen wide-screen"><div className="entity-layout"><div className="entity-list-panel"><h1>{title}</h1><p>{entitySubtitle(kind)}</p><label className="searchbox entity-search"><Search size={17} /><input placeholder={entitySearchPlaceholder(kind)} /></label><p className="total-line">Всего: {items.length}</p><div className="entity-list">{items.map((item) => <button className={selected?.name === item.name ? "selected" : ""} key={item.name} onClick={() => onSelect(item.name)}><Avatar name={item.name} /><span><strong>{item.name}</strong><small>{shortName(item.name)}</small></span><em>{item.document_count} док.</em><ChevronRight size={17} /></button>)}</div></div><div className="entity-detail-panel">{selected ? <><div className="entity-card"><Avatar name={selected.name} large /><div><h2>{selected.name}</h2><p>{shortName(selected.name)}</p></div><span className="ai-pill">AI-обнаружен</span></div><div className="entity-meta"><div><span>Упоминаний в документах</span><strong>{selected.document_count}</strong></div><div><span>Тип</span><strong>{entityKindTitle(kind)}</strong></div></div><div className="related-docs"><h3>Документы ({documents.length || selected.document_count})</h3><div className="mini-table"><div className="mini-row mini-head"><span>Название</span><span>Тип</span><span>Хранилище</span><span>AI</span></div>{documents.map((document) => <button className="mini-row" key={document.id} onClick={() => onOpenDocument(document.id)}><span className="file-name"><FileIcon filename={document.filename} />{document.filename}</span><span>{fileTypeLabel(document.filename)}</span><span>{document.storage_mode === "external" ? "Яндекс Диск" : "Сервер"}</span><span>{document.analysis_status}</span></button>)}{!documents.length && <div className="empty-state">Документы этой категории появятся после AI-анализа содержимого.</div>}</div></div></> : <div className="empty-state">AI пока не нашёл сущности этого типа.</div>}</div></div></section>
}

function GroupsScreen({ groups }: { groups: Group[] }) {
  return <section className="screen wide-screen"><div className="page-panel"><div className="documents-head"><div><h1>AI-группы</h1><p>Осмысленные категории, найденные в документах</p></div></div>{!groups.length && <div className="empty-state">AI-группы появятся после обработки документов.</div>}<div className="group-board">{groups.map((group) => <article key={group.kind}><span>{group.title}</span><div>{group.items.map((item) => <button key={item.name} type="button">{item.name}<em>{item.document_count}</em></button>)}</div></article>)}</div></div></section>
}

function IntegrationsScreen(props: { storageMode: "managed" | "yandex_disk"; setStorageMode: (mode: "managed" | "yandex_disk") => void; yandexStatus: YandexStatus | null; watchedPath: string; setWatchedPath: (path: string) => void; yandexVerificationCode: string; setYandexVerificationCode: (code: string) => void; connectYandexDisk: () => void; submitYandexVerificationCode: () => void; connectWatchedFolder: () => void; syncYandexSources: () => void; integrationNotice: string | null }) {
  return <section className="screen narrow-screen"><div className="page-head"><h1>Интеграции</h1><p>Настройки хранения и синхронизации.</p></div><article className="panel integration-panel"><div className="panel-head"><div><h2>Хранение файлов</h2></div><span className={`status-badge ${props.storageMode === "managed" || props.yandexStatus?.connected ? "ok" : "warn"}`}>{props.storageMode === "managed" ? "Наше хранилище" : props.yandexStatus?.connected ? "Подключён" : "Не подключён"}</span></div><div className="storage-switch" role="group" aria-label="Режим хранения"><button className={props.storageMode === "managed" ? "selected" : ""} onClick={() => { props.setStorageMode("managed"); localStorage.setItem("docs_storage_mode", "managed") }}>Хранить у нас</button><button className={props.storageMode === "yandex_disk" ? "selected" : ""} onClick={() => { props.setStorageMode("yandex_disk"); localStorage.setItem("docs_storage_mode", "yandex_disk") }}>Мой Яндекс Диск</button></div><div className={`yandex-settings ${props.storageMode === "yandex_disk" ? "open" : "closed"}`} aria-hidden={props.storageMode !== "yandex_disk"}>{!props.yandexStatus?.connected && <div className="button-row"><button onClick={props.connectYandexDisk} disabled={!props.yandexStatus?.credentials_configured}>Авторизовать диск</button></div>}{!props.yandexStatus?.connected && <div className="code-row"><label>Код подтверждения<input value={props.yandexVerificationCode} onChange={(event) => props.setYandexVerificationCode(event.target.value)} placeholder="Код из Яндекса" /></label><button onClick={props.submitYandexVerificationCode} disabled={!props.yandexVerificationCode.trim()}>Подключить</button></div>}{props.yandexStatus?.connected && <div className="folder-row"><label>Папка на диске<input value={props.watchedPath} onChange={(event) => props.setWatchedPath(event.target.value)} placeholder="/Docs" /></label><button onClick={props.connectWatchedFolder}>Сохранить</button><button onClick={props.syncYandexSources}>Обновить</button></div>}{props.integrationNotice && <p className="notice">{props.integrationNotice}</p>}</div></article></section>
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <section className="screen wide-screen"><div className="page-panel empty-page"><Box size={34} /><h1>{title}</h1><p>{text}</p></div></section>
}

function PreviewSurface({ document, config }: { document?: DocumentItem; config: OnlyOfficeConfig | null }) {
  const extension = document?.filename.split(".").pop()?.toLowerCase()
  const contentUrl = document?.asset_id ? platformUrl(FILES_API_BASE, `/api/v1/assets/${document.asset_id}/content`) : null
  if (!document) return <div className="preview empty"><span>Предпросмотр</span><strong>Выберите документ</strong></div>
  if (!contentUrl) return <div className="preview empty"><span>Предпросмотр</span><strong>{document.filename}</strong><small>Оригинал ещё не готов к просмотру</small></div>
  if (extension === "pdf") return <iframe className="preview-frame" title={document.filename} src={`${contentUrl}#toolbar=0&navpanes=0`} />
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension ?? "")) return <img className="preview-image" alt={document.filename} src={contentUrl} />
  if (["docx", "xlsx", "pptx", "doc", "xls", "ppt"].includes(extension ?? "")) return config ? <OnlyOfficePreview config={config} /> : <div className="preview empty"><strong>{document.filename}</strong><small>Готовим предпросмотр Office-документа…</small></div>
  return <div className="preview empty"><span>Предпросмотр</span><strong>{document.filename}</strong><small>Для этого формата готовится viewer</small></div>
}

function OnlyOfficePreview({ config }: { config: OnlyOfficeConfig }) {
  useEffect(() => {
    let editor: { destroyEditor?: () => void } | undefined
    let cancelled = false
    const scriptId = "onlyoffice-docs-api"
    const mount = () => {
      if (cancelled || !window.DocsAPI) return
      const id = `onlyoffice-preview-${config.document.key}`
      editor = new window.DocsAPI.DocEditor(id, { ...config, width: "100%", height: "100%" })
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
  return <div className="onlyoffice-preview" id={`onlyoffice-preview-${config.document.key}`} />
}

function StatusBadge({ status, locale }: { status: string; locale: "ru" | "en" }) {
  const map: Record<string, { ru: string; en: string; tone: string }> = {
    queued: { ru: "В очереди", en: "Queued", tone: "queued" },
    processing: { ru: "Обрабатывается", en: "Processing", tone: "processing" },
    ready: { ru: "Готово", en: "Ready", tone: "ready" },
    failed: { ru: "Ошибка", en: "Failed", tone: "failed" },
    missed_original: { ru: "Удалён извне", en: "Deleted externally", tone: "failed" },
  }
  const item = map[status] ?? { ru: status, en: status, tone: "queued" }
  return <span className={`status-chip ${item.tone}`}>{locale === "ru" ? item.ru : item.en}</span>
}

function FeedScreen({ locale }: { locale: "ru" | "en" }) {
  const t = (ru: string, en: string) => locale === "ru" ? ru : en
  return <section className="screen wide-screen"><div className="page-panel feed-panel"><div className="documents-head"><div><h1>{t("Лента", "Feed")}</h1><p>{t("Уведомления, синхронизации и события документов.", "Document notifications, syncs and events.")}</p></div></div><div className="empty-state">{t("Лента появится после первых действий с документами.", "The feed will appear after the first document actions.")}</div></div></section>
}

function SupportScreen({ locale }: { locale: "ru" | "en" }) {
  const t = (ru: string, en: string) => locale === "ru" ? ru : en
  return <section className="screen wide-screen"><div className="support-layout"><aside className="support-tickets"><h2>{t("Мои тикеты", "My tickets")}</h2><label className="searchbox"><Search size={16} /><input placeholder={t("Поиск по тикетам...", "Search tickets...")} /></label><button className="ticket-item selected"><span>{t("Новый вопрос", "New request")}</span><small>{t("Поддержка документов", "Documents support")}</small></button></aside><article className="support-chat"><header><div><h1>{t("Поддержка", "Support")}</h1><p>{t("Опишите проблему — сообщение попадёт в поддержку Nerior.", "Describe the issue — it will go to Nerior support.")}</p></div></header><div className="chat-empty">{t("Сообщений пока нет.", "No messages yet.")}</div><div className="chat-input"><input placeholder={t("Сообщение", "Message")} /><button><Send size={16} /></button></div></article></div></section>
}

function EditableEventCard({ proposal, onConfirmed }: { proposal: EventProposal; onConfirmed: (proposal: EventProposal) => void }) {
  const [title, setTitle] = useState(proposal.title)
  const [startsAt, setStartsAt] = useState(proposal.starts_at)
  const [description, setDescription] = useState(proposal.description ?? "")
  const [priority, setPriority] = useState(proposal.priority ?? "normal")
  const [saving, setSaving] = useState(false)
  async function confirm() {
    setSaving(true)
    const response = await fetch(`${API_BASE}/api/v1/event-proposals/${proposal.id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ title, starts_at: startsAt, description, priority }) })
    if (response.ok) onConfirmed(await response.json())
    setSaving(false)
  }
  return <article className="event-card"><input value={title} onChange={(event) => setTitle(event.target.value)} /><input value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Описание" /><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option></select><button disabled={proposal.confirmed || saving} onClick={confirm}>{proposal.confirmed ? "Добавлено" : saving ? "Добавляем..." : "Добавить в календарь"}</button></article>
}

function isUsefulGroupName(name: string) {
  const normalized = name.trim()
  if (normalized.length < 3) return false
  if (/^\d+([.,]\d+)?$/.test(normalized)) return false
  if (/^[\d\s.,:;№#/-]+$/.test(normalized)) return false
  return /[a-zа-яё]/i.test(normalized)
}
function sectionToEntityKind(section: ActiveSection): EntityKind | null { return section === "people" ? "person" : section === "companies" ? "company" : section === "projects" ? "project" : section === "finance" ? "finance" : section === "cities" ? "city" : null }
function entityTokens(name: string) { return name.toLowerCase().split(/\s+/).filter((part) => part.length > 3).slice(0, 4) }
function shortName(name: string) { const parts = name.split(/\s+/).filter(Boolean); return parts.length >= 3 ? `${parts[0]} ${parts[1][0]}.${parts[2][0]}.` : name }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AI" }
function Avatar({ name, large = false }: { name: string; large?: boolean }) { return <span className={large ? "avatar large" : "avatar"}>{initials(name)}</span> }
function entitySubtitle(kind: EntityKind) { return kind === "person" ? "Все физические лица, упомянутые в документах" : kind === "company" ? "Организации и контрагенты из документов" : kind === "project" ? "Проекты, связанные с документами" : kind === "city" ? "Города, найденные в документах" : "Финансовые сущности и обязательства" }
function entitySearchPlaceholder(kind: EntityKind) { return kind === "person" ? "Поиск людей..." : kind === "company" ? "Поиск компаний..." : kind === "project" ? "Поиск проектов..." : kind === "city" ? "Поиск городов..." : "Поиск финансов..." }
function entityKindTitle(kind: EntityKind) { return kind === "person" ? "Человек" : kind === "company" ? "Компания" : kind === "project" ? "Проект" : kind === "city" ? "Город" : "Финансы" }
function fileTypeLabel(filename: string) { const ext = filename.split(".").pop()?.toLowerCase(); if (ext === "pdf") return "PDF"; if (["doc", "docx"].includes(ext ?? "")) return "Документ"; if (["xls", "xlsx"].includes(ext ?? "")) return "Таблица"; if (["ppt", "pptx"].includes(ext ?? "")) return "Презентация"; return "Файл" }
function FileIcon({ filename }: { filename: string }) { const ext = filename.split(".").pop()?.toLowerCase(); if (["xls", "xlsx"].includes(ext ?? "")) return <FileSpreadsheet size={18} className="file-icon sheet" />; return <FileText size={18} className={ext === "pdf" ? "file-icon pdf" : "file-icon doc"} /> }
