from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base
from app.preview import PreviewOrchestrator
from app.repositories import DocumentRepository


class FakeFilesPreviewClient:
    def __init__(self): self.calls=[]
    def create_preview(self, **payload):
        self.calls.append(payload)
        return 'preview_1'


def test_document_preview_is_requested_through_files_service():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    document = repo.create_managed_document(owner_subject_id='usr_1', filename='contract.docx', content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    client = FakeFilesPreviewClient()
    preview_id = PreviewOrchestrator(repo, client).request_preview(document.id, asset_id='asset_1')
    assert preview_id == 'preview_1'
    assert client.calls[0]['filename'] == 'contract.docx'


def test_document_preview_uses_asset_already_linked_to_document():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    document = repo.create_managed_document(owner_subject_id='usr_1', filename='contract.docx', content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    repo.assign_asset(document.id, asset_id='asset_linked_1')
    client = FakeFilesPreviewClient()
    preview_id = PreviewOrchestrator(repo, client).request_linked_preview(document.id)
    assert preview_id == 'preview_1'
    assert client.calls[0]['asset_id'] == 'asset_linked_1'
