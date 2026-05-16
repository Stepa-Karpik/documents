import httpx


class _BaseHttpClient:
    def __init__(self, *, base_url: str, transport: httpx.BaseTransport | None = None):
        self.base_url = base_url
        self.transport = transport


class HttpFilesClient(_BaseHttpClient):
    def register_external_asset(self, **payload: str) -> str:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/assets/external', json=payload)
            response.raise_for_status()
            return response.json()['asset_id']

    def register_managed_asset(self, **payload: str) -> str:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/assets/managed', json=payload)
            response.raise_for_status()
            return response.json()['asset_id']

    def create_preview(self, **payload: str) -> str:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/previews', json=payload)
            response.raise_for_status()
            return response.json()['preview_id']


class HttpAiClient(_BaseHttpClient):
    def create_job(self, **payload: str) -> str:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/jobs', json=payload)
            response.raise_for_status()
            return response.json()['job_id']


class HttpSearchClient(_BaseHttpClient):
    def index_document(self, **payload: str) -> None:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/index', json=payload)
            response.raise_for_status()
