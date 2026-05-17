from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Base


def make_client():
    engine = create_engine('sqlite+pysqlite:///:memory:', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine)
    def override_session():
        with factory() as session:
            yield session
    app.dependency_overrides[get_session] = override_session
    return TestClient(app)


def test_healthz():
    client = make_client()
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["service"] == "documents"


def test_register_managed_document_api():
    client = make_client()
    response = client.post(
        "/api/v1/documents/managed",
        json={
            "owner_subject_id": "usr_1",
            "filename": "contract.pdf",
            "content_type": "application/pdf",
        },
    )
    assert response.status_code == 201
    assert response.json()["storage_mode"] == "managed"


def test_register_uploaded_managed_document_api_reuses_existing_asset(monkeypatch):
    client = make_client()

    class FakeOrchestrator:
        def register_uploaded_managed_document(self, **payload):
            assert payload["asset_id"] == "asset_uploaded_1"
            return type(
                "Document",
                (),
                {
                    "id": "doc_uploaded_1",
                    "owner_subject_id": payload["owner_subject_id"],
                    "filename": payload["filename"],
                    "storage_mode": "managed",
                    "asset_id": payload["asset_id"],
                    "content_type": payload["content_type"],
                    "provider": None,
                    "external_file_id": None,
                    "revision": None,
                    "preview_status": "queued",
                    "analysis_status": "queued",
                    "analysis_attempts": 1,
                },
            )()

    monkeypatch.setattr("app.main._build_orchestrator", lambda repo: FakeOrchestrator())

    response = client.post(
        "/api/v1/documents/managed",
        json={
            "owner_subject_id": "usr_1",
            "filename": "contract.pdf",
            "content_type": "application/pdf",
            "asset_id": "asset_uploaded_1",
        },
    )
    assert response.status_code == 201
    assert response.json()["id"] == "doc_uploaded_1"
    assert response.json()["asset_id"] == "asset_uploaded_1"


def test_external_discovery_and_search_api():
    client = make_client()
    external = client.post(
        "/api/v1/documents/external/discover",
        json={
            "owner_subject_id": "usr_api",
            "provider": "yandex_disk",
            "external_file_id": "disk_api_1",
            "filename": "lease.pdf",
            "revision": "rev_1",
        },
    )
    assert external.status_code == 201
    document_id = external.json()["id"]

    analyzed = client.post(
        f"/api/v1/documents/{document_id}/analysis",
        json={"summary": "Договор аренды с залогом 2000 евро", "entities": ["аренда", "2000 евро"]},
    )
    assert analyzed.status_code == 200

    search = client.get("/api/v1/search", params={"owner_subject_id": "usr_api", "q": "залог 2000 евро"})
    assert search.status_code == 200
    assert search.json()[0]["document_id"] == document_id


def test_analysis_can_surface_detected_event_proposals_without_confirming_them():
    client = make_client()
    document = client.post(
        "/api/v1/documents/managed",
        json={"owner_subject_id": "usr_events", "filename": "insurance.pdf", "content_type": "application/pdf"},
    ).json()

    analyzed = client.post(
        f"/api/v1/documents/{document['id']}/analysis",
        json={
            "summary": "Страховка действует до июля",
            "entities": ["страховка"],
            "events": [
                {
                    "title": "Продлить страховку",
                    "starts_at": "2026-07-01T09:00:00+03:00",
                    "description": "Найдено в документе",
                }
            ],
        },
    )

    assert analyzed.status_code == 200
    assert analyzed.json()["event_proposals"] == [
        {
            "id": analyzed.json()["event_proposals"][0]["id"],
            "document_id": document["id"],
            "title": "Продлить страховку",
            "starts_at": "2026-07-01T09:00:00+03:00",
            "description": "Найдено в документе",
            "priority": "normal",
            "confirmed": False,
            "planner_event_id": None,
        }
    ]
    listed = client.get(f"/api/v1/documents/{document['id']}/event-proposals")
    assert listed.status_code == 200
    assert listed.json()[0]["title"] == "Продлить страховку"


def test_batch_sync_api_reports_file_actions(monkeypatch):
    class FakeOrchestrator:
        def register_external_document(self, **payload):
            return None
    monkeypatch.setattr('app.main._build_orchestrator', lambda repo: FakeOrchestrator())
    client = make_client()
    source = client.post('/api/v1/watched-sources', json={'owner_subject_id': 'usr_sync', 'provider': 'yandex_disk', 'root_path': '/Docs'})
    source_id = source.json()['id']
    response = client.post(
        f'/api/v1/watched-sources/{source_id}/sync',
        json={'files': [{'external_file_id': 'disk_1', 'filename': 'invoice.docx', 'revision': 'rev_1'}]},
    )
    assert response.status_code == 200
    assert response.json()[0]['action'] == 'created'


def test_event_proposal_api_can_be_created_and_confirmed():
    client = make_client()
    document = client.post('/api/v1/documents/managed', json={'owner_subject_id': 'usr_evt', 'filename': 'insurance.pdf', 'content_type': 'application/pdf'}).json()
    proposal = client.post(f"/api/v1/documents/{document['id']}/event-proposals", json={'title': 'Продлить страховку', 'starts_at': '2026-07-01T09:00:00+03:00'})
    assert proposal.status_code == 201
    confirmed = client.post(f"/api/v1/event-proposals/{proposal.json()['id']}/confirm", json={'planner_event_id': 'evt_1'})
    assert confirmed.status_code == 200
    assert confirmed.json()['planner_event_id'] == 'evt_1'


def test_event_proposal_can_be_edited_before_confirmation(monkeypatch):
    client = make_client()
    document = client.post(
        "/api/v1/documents/managed",
        json={"owner_subject_id": "usr_evt", "filename": "insurance.pdf", "content_type": "application/pdf"},
    ).json()
    proposal = client.post(
        f"/api/v1/documents/{document['id']}/event-proposals",
        json={"title": "Черновик", "starts_at": "2026-07-01T09:00:00+03:00"},
    ).json()

    class FakePlannerClient:
        def __init__(self, **kwargs):
            pass

        def create_document_event(self, **payload):
            assert payload["title"] == "Продлить страховку"
            assert payload["starts_at"] == "2026-07-02T10:30:00+03:00"
            assert payload["description"] == "Проверить условия"
            assert payload["priority"] == "high"
            return "evt_edited"

    monkeypatch.setattr("app.main.HttpPlannerClient", FakePlannerClient)

    confirmed = client.post(
        f"/api/v1/event-proposals/{proposal['id']}/confirm",
        json={
            "title": "Продлить страховку",
            "starts_at": "2026-07-02T10:30:00+03:00",
            "description": "Проверить условия",
            "priority": "high",
        },
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["title"] == "Продлить страховку"
    assert confirmed.json()["planner_event_id"] == "evt_edited"


def test_list_documents_api_returns_user_documents():
    client = make_client()
    client.post('/api/v1/documents/managed', json={'owner_subject_id': 'usr_list', 'filename': 'a.pdf', 'content_type': 'application/pdf'})
    client.post('/api/v1/documents/managed', json={'owner_subject_id': 'other', 'filename': 'b.pdf', 'content_type': 'application/pdf'})
    response = client.get('/api/v1/documents', params={'owner_subject_id': 'usr_list'})
    assert response.status_code == 200
    assert [item['filename'] for item in response.json()] == ['a.pdf']


def test_preview_can_be_requested_for_document_with_linked_asset(monkeypatch):
    client = make_client()
    document = client.post(
        "/api/v1/documents/managed",
        json={"owner_subject_id": "usr_preview", "filename": "contract.docx", "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ).json()

    class FakePreviewOrchestrator:
        def request_linked_preview(self, document_id: str):
            assert document_id == document["id"]
            return "preview_1"

    monkeypatch.setattr("app.main._build_preview_orchestrator", lambda repo: FakePreviewOrchestrator())

    response = client.post(f"/api/v1/documents/{document['id']}/preview")
    assert response.status_code == 201
    assert response.json() == {"preview_id": "preview_1"}
