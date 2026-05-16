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


def test_managed_document_survives_across_requests():
    client = make_client()
    created = client.post('/api/v1/documents/managed', json={'owner_subject_id': 'usr_1', 'filename': 'contract.pdf', 'content_type': 'application/pdf'})
    document_id = created.json()['id']
    fetched = client.get(f'/api/v1/documents/{document_id}')
    assert fetched.status_code == 200
    assert fetched.json()['filename'] == 'contract.pdf'
