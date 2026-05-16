from fastapi.testclient import TestClient
from app.main import app


def test_session_endpoint_returns_subject_from_identity_exchange(monkeypatch):
    class FakeIdentityClient:
        def exchange_browser_session(self, *, cookies):
            assert cookies['ecosystem_session'] == 'sess_1'
            from app.identity_client import SessionExchangeResult
            return SessionExchangeResult(subject_id='usr_1', access_token='access_1')
    monkeypatch.setattr('app.main._build_identity_client', lambda: FakeIdentityClient())
    response = TestClient(app).get('/api/v1/auth/session', cookies={'ecosystem_session': 'sess_1'})
    assert response.status_code == 200
    assert response.json()['subject_id'] == 'usr_1'
