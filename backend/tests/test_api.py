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


def test_batch_sync_api_reports_file_actions():
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


def test_list_documents_api_returns_user_documents():
    client = make_client()
    client.post('/api/v1/documents/managed', json={'owner_subject_id': 'usr_list', 'filename': 'a.pdf', 'content_type': 'application/pdf'})
    client.post('/api/v1/documents/managed', json={'owner_subject_id': 'other', 'filename': 'b.pdf', 'content_type': 'application/pdf'})
    response = client.get('/api/v1/documents', params={'owner_subject_id': 'usr_list'})
    assert response.status_code == 200
    assert [item['filename'] for item in response.json()] == ['a.pdf']
