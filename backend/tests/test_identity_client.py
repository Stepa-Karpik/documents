import httpx
from app.identity_client import HttpIdentityClient


def test_identity_client_exchanges_browser_session():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/v1/session-exchange'
        return httpx.Response(200, json={'subject_id': 'usr_1', 'access_token': 'access_1'})
    client = HttpIdentityClient(base_url='http://identity', transport=httpx.MockTransport(handler))
    result = client.exchange_browser_session(cookies={'ecosystem_session': 'sess_1'})
    assert result.subject_id == 'usr_1'
