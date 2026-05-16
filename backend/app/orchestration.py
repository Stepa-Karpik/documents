from typing import Protocol

from app.models import DocumentModel
from app.repositories import DocumentRepository


class FilesClient(Protocol):
    def register_external_asset(self, **payload: str) -> str: ...
    def register_managed_asset(self, **payload: str) -> str: ...


class AiClient(Protocol):
    def create_job(self, **payload: str) -> str: ...


class SearchClient(Protocol):
    def index_document(self, **payload: str) -> None: ...


class DocumentOrchestrator:
    def __init__(self, repository: DocumentRepository, *, files_client: FilesClient, ai_client: AiClient, search_client: SearchClient):
        self.repository = repository
        self.files_client = files_client
        self.ai_client = ai_client
        self.search_client = search_client

    def register_managed_document(self, *, owner_subject_id: str, filename: str, content_type: str) -> DocumentModel:
        document = self.repository.create_managed_document(owner_subject_id=owner_subject_id, filename=filename, content_type=content_type)
        asset_id = self.files_client.register_managed_asset(owner_subject_id=owner_subject_id, filename=filename, content_type=content_type)
        self.ai_client.create_job(document_id=document.id, content_ref=asset_id)
        return document

    def register_external_document(self, *, owner_subject_id: str, provider: str, external_file_id: str, filename: str, revision: str) -> DocumentModel:
        document = self.repository.upsert_external_document(
            owner_subject_id=owner_subject_id,
            provider=provider,
            external_file_id=external_file_id,
            filename=filename,
            revision=revision,
        )
        asset_id = self.files_client.register_external_asset(
            owner_subject_id=owner_subject_id,
            provider=provider,
            external_file_id=external_file_id,
            revision=revision,
        )
        self.ai_client.create_job(document_id=document.id, content_ref=asset_id)
        return document


    def complete_analysis(self, *, document_id: str, summary: str, entities: list[str]) -> None:
        document = self.repository.get_document(document_id)
        assert document is not None
        self.repository.attach_analysis(document_id=document_id, summary=summary, entities=entities)
        text = " ".join([document.filename, summary, *entities])
        self.search_client.index_document(document_id=document_id, owner_subject_id=document.owner_subject_id, text=text)
