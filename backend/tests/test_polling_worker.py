from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base
from app.polling import PollingSyncWorker
from app.repositories import DocumentRepository
from app.sync import ExternalFileSnapshot


class FakeProvider:
    def list_folder(self, path: str):
        assert path == '/Docs'
        return [ExternalFileSnapshot('disk_1', 'invoice.docx', 'rev_1')]


def test_polling_worker_syncs_provider_files_into_documents():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    source = repo.create_watched_source(owner_subject_id='usr_1', provider='yandex_disk', root_path='/Docs')
    result = PollingSyncWorker(repo, FakeProvider()).run_once(source.id)
    assert result[0].action == 'created'
