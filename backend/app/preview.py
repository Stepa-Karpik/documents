from typing import Protocol

from app.repositories import DocumentRepository


class FilesPreviewClient(Protocol):
    def create_preview(self, **payload: str) -> str: ...


class PreviewOrchestrator:
    def __init__(self, repository: DocumentRepository, files_client: FilesPreviewClient):
        self.repository = repository
        self.files_client = files_client

    def request_preview(self, document_id: str, *, asset_id: str) -> str:
        document = self.repository.get_document(document_id)
        assert document is not None
        return self.files_client.create_preview(asset_id=asset_id, filename=document.filename)
