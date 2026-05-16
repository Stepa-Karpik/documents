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
        self.calls.append(payload)


def test_external_document_registration_orchestrates_asset_and_ai_job():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    files = FakeFilesClient(); ai = FakeAiClient(); search = FakeSearchClient()
    orchestrator = DocumentOrchestrator(repo, files_client=files, ai_client=ai, search_client=search)
    document = orchestrator.register_external_document(owner_subject_id='usr_1', provider='yandex_disk', external_file_id='disk_1', filename='invoice.docx', revision='rev_1')
    assert document.id
    assert files.calls[0]['external_file_id'] == 'disk_1'
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
    assert ai.calls[0]['content_ref'] == 'asset_m1'
