from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_groups_endpoint_proxies_search_knowledge(monkeypatch):
    class FakeSearchClient:
        def list_groups(self, *, owner_subject_id: str):
            assert owner_subject_id == "usr_1"
            return [{"kind": "company", "title": "Компании", "items": [{"name": "Acme", "document_count": 1}]}]

    monkeypatch.setattr("app.main._build_search_client", lambda: FakeSearchClient())

    response = client.get("/api/v1/groups", params={"owner_subject_id": "usr_1"})
    assert response.status_code == 200
    assert response.json()[0]["title"] == "Компании"
