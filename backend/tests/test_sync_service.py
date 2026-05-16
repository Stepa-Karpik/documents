from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base
from app.repositories import DocumentRepository
from app.sync import ExternalFileSnapshot, WatchedFolderSyncService


def make_service():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    session = Session(engine)
    repo = DocumentRepository(session)
    source = repo.create_watched_source(owner_subject_id='usr_1', provider='yandex_disk', root_path='/Docs')
    return WatchedFolderSyncService(repo), source


def test_sync_batch_reports_created_unchanged_and_updated():
    service, source = make_service()
    first = service.sync(source.id, [ExternalFileSnapshot('disk_1', 'invoice.docx', 'rev_1')])
    second = service.sync(source.id, [
        ExternalFileSnapshot('disk_1', 'invoice.docx', 'rev_1'),
        ExternalFileSnapshot('disk_2', 'contract.pdf', 'rev_1'),
    ])
    third = service.sync(source.id, [ExternalFileSnapshot('disk_1', 'invoice.docx', 'rev_2')])
    assert [item.action for item in first] == ['created']
    assert [item.action for item in second] == ['unchanged', 'created']
    assert [item.action for item in third] == ['updated']


def test_sync_service_can_use_discovery_callback_for_new_files():
    service, source = make_service()
    seen=[]
    service.on_discovered=lambda snapshot: seen.append(snapshot.external_file_id)
    service.sync(source.id,[ExternalFileSnapshot('disk_1','invoice.docx','rev_1')])
    assert seen==['disk_1']
