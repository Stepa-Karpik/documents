import httpx


class HttpPlannerClient:
    def __init__(self, *, base_url: str, internal_api_key: str = '', transport: httpx.BaseTransport | None = None):
        self.base_url = base_url
        self.internal_api_key = internal_api_key
        self.transport = transport

    def create_document_event(self, **payload: str) -> str:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/document-events', json=payload, headers={'x-internal-key': self.internal_api_key})
            response.raise_for_status()
            body = response.json()
            return body.get('event_id') or body['data']['event_id']
