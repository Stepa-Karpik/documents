from dataclasses import dataclass

import httpx


@dataclass(frozen=True, slots=True)
class SessionExchangeResult:
    subject_id: str
    access_token: str


class HttpIdentityClient:
    def __init__(self, *, base_url: str, transport: httpx.BaseTransport | None = None):
        self.base_url = base_url
        self.transport = transport

    def exchange_browser_session(self, *, cookies: dict[str, str]) -> SessionExchangeResult:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/session-exchange', cookies=cookies)
            response.raise_for_status()
        return SessionExchangeResult(**response.json())
