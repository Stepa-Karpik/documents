from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base
from app.repositories import DocumentRepository


def make_repo():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    return DocumentRepository(Session(engine))


def test_managed_document_persists():
    repo = make_repo()
    document = repo.create_managed_document(owner_subject_id='usr_1', filename='contract.pdf', content_type='application/pdf')
    loaded = repo.get_document(document.id)
    assert loaded is not None
    assert loaded.filename == 'contract.pdf'
    assert loaded.storage_mode == 'managed'


def test_external_revision_update_persists_attempt_count():
    repo = make_repo()
    first = repo.upsert_external_document(owner_subject_id='usr_1', provider='yandex_disk', external_file_id='disk_1', filename='invoice.docx', revision='rev_1')
    second = repo.upsert_external_document(owner_subject_id='usr_1', provider='yandex_disk', external_file_id='disk_1', filename='invoice.docx', revision='rev_2')
    assert first.id == second.id
    assert second.revision == 'rev_2'
    assert second.analysis_attempts == 2


def test_watched_source_ingest_is_idempotent():
    repo = make_repo()
    source = repo.create_watched_source(owner_subject_id='usr_1', provider='yandex_disk', root_path='/Docs')
    first = repo.ingest_watched_file(source_id=source.id, external_file_id='disk_1', filename='invoice.docx', revision='rev_1')
    second = repo.ingest_watched_file(source_id=source.id, external_file_id='disk_1', filename='invoice.docx', revision='rev_1')
    assert first.action == 'created'
    assert second.action == 'unchanged'


def test_analysis_searches_persisted_documents():
    repo = make_repo()
    document = repo.create_managed_document(owner_subject_id='usr_1', filename='lease.pdf', content_type='application/pdf')
    repo.attach_analysis(document_id=document.id, summary='Договор аренды с депозитом 2000 евро', entities=['аренда', 'депозит', '2000 евро'])
    hits = repo.search(owner_subject_id='usr_1', query='депозит 2000 евро')
    assert hits[0].document_id == document.id


def test_event_proposal_persists_and_confirms():
    repo = make_repo()
    document = repo.create_managed_document(owner_subject_id='usr_1', filename='insurance.pdf', content_type='application/pdf')
    proposal = repo.create_event_proposal(document_id=document.id, title='Продлить страховку', starts_at='2026-07-01T09:00:00+03:00')
    confirmed = repo.confirm_event_proposal(proposal.id, planner_event_id='evt_1')
    assert confirmed.confirmed == 1
    assert confirmed.planner_event_id == 'evt_1'
