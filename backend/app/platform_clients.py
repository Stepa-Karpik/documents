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

    def download_asset_content(self, asset_id: str) -> bytes:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.get(f'/api/v1/assets/{asset_id}/content')
            response.raise_for_status()
            return response.content


class HttpAiClient(_BaseHttpClient):
    def create_job(self, **payload: str) -> str:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/jobs', json=payload)
            response.raise_for_status()
            return response.json()['job_id']

    def analyze_content(self, **payload: str) -> dict:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/analyze-content', json=payload)
            response.raise_for_status()
            return response.json()


class HttpSearchClient(_BaseHttpClient):
    def index_document(self, **payload: str) -> None:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/index', json=payload)
            response.raise_for_status()

    def index_entities(self, **payload: str) -> None:
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.post('/api/v1/entities/index', json=payload)
            response.raise_for_status()

    def list_groups(self, *, owner_subject_id: str):
        with httpx.Client(base_url=self.base_url, transport=self.transport) as client:
            response = client.get('/api/v1/groups', params={'owner_subject_id': owner_subject_id})
            response.raise_for_status()
            return response.json()
