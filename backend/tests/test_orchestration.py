from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base
from app.orchestration import DocumentOrchestrator
from app.repositories import DocumentRepository


class FakeFilesClient:
    def __init__(self): self.calls=[]
    def register_external_asset(self, **payload):
        self.calls.append(payload)
        return 'asset_1'

class FakeAiClient:
    def __init__(self): self.calls=[]
    def create_job(self, **payload):
        self.calls.append(payload)
        return 'job_1'

class FakeSearchClient:
    def __init__(self): self.calls=[]
    def index_document(self, **payload):
        self.calls.append(("document", payload))
    def index_entities(self, **payload):
        self.calls.append(("entities", payload))


def test_external_document_registration_orchestrates_asset_and_ai_job():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    files = FakeFilesClient(); ai = FakeAiClient(); search = FakeSearchClient()
    orchestrator = DocumentOrchestrator(repo, files_client=files, ai_client=ai, search_client=search)
    document = orchestrator.register_external_document(owner_subject_id='usr_1', provider='yandex_disk', external_file_id='disk_1', external_path='disk:/Docs/invoice.docx', filename='invoice.docx', revision='rev_1')
    assert document.id
    assert document.asset_id == 'asset_1'
    assert files.calls[0]['external_file_id'] == 'disk_1'
    assert files.calls[0]['external_path'] == 'disk:/Docs/invoice.docx'
    assert ai.calls[0]['content_ref'] == 'asset_1'


def test_managed_document_registration_orchestrates_asset_and_ai_job():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    class ManagedFilesClient(FakeFilesClient):
        def register_managed_asset(self, **payload):
            self.calls.append(payload)
            return 'asset_m1'
    files = ManagedFilesClient(); ai = FakeAiClient(); search = FakeSearchClient()
    document = DocumentOrchestrator(repo, files_client=files, ai_client=ai, search_client=search).register_managed_document(owner_subject_id='usr_1', filename='contract.pdf', content_type='application/pdf')
    assert document.storage_mode == 'managed'
    assert document.asset_id == 'asset_m1'
    assert ai.calls[0]['content_ref'] == 'asset_m1'


def test_uploaded_managed_document_reuses_existing_asset_without_duplicate_registration():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    files = FakeFilesClient(); ai = FakeAiClient(); search = FakeSearchClient()
    document = DocumentOrchestrator(repo, files_client=files, ai_client=ai, search_client=search).register_uploaded_managed_document(
        owner_subject_id='usr_1',
        filename='contract.pdf',
        content_type='application/pdf',
        asset_id='asset_uploaded_1',
    )
    assert document.storage_mode == 'managed'
    assert document.asset_id == 'asset_uploaded_1'
    assert files.calls == []
    assert ai.calls == [{'document_id': document.id, 'content_ref': 'asset_uploaded_1'}]


def test_completed_analysis_is_indexed_in_search_service():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    document = repo.create_managed_document(owner_subject_id='usr_1', filename='lease.pdf', content_type='application/pdf')
    files = FakeFilesClient(); ai = FakeAiClient(); search = FakeSearchClient()
    DocumentOrchestrator(repo, files_client=files, ai_client=ai, search_client=search).complete_analysis(document_id=document.id, summary='Договор аренды', entities=['аренда'])
    assert search.calls[0][1]['document_id'] == document.id
    assert 'аренда' in search.calls[0][1]['text']
    assert search.calls[1] == (
        "entities",
        {
            "document_id": document.id,
            "owner_subject_id": "usr_1",
            "entities": [{"kind": "topic", "name": "аренда"}],
        },
    )
