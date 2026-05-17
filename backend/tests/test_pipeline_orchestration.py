from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import Base
from app.orchestration import DocumentOrchestrator
from app.repositories import DocumentRepository

class Files:
    def register_managed_asset(self, **payload): return 'asset_1'
    def download_asset_content(self, asset_id): return 'Оплатить до 2026-07-01. Сумма 2000 евро.'.encode()
class Ai:
    def create_job(self, **payload): return 'job_1'
    def analyze_content(self, **payload): return {'summary':'Счет', 'entities':['2000'], 'events':[{'title':'Оплата','starts_at':'2026-07-01','description':None}]}
class Search:
    def index_document(self, **payload): pass
    def index_entities(self, **payload): pass

def test_managed_document_runs_real_analysis_pipeline():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    repo = DocumentRepository(Session(engine))
    doc = DocumentOrchestrator(repo, files_client=Files(), ai_client=Ai(), search_client=Search()).register_managed_document(owner_subject_id='usr_1', filename='invoice.txt', content_type='text/plain')
    assert repo.get_document(doc.id).analysis_status == 'ready'
    assert repo.list_event_proposals(doc.id)[0].title == 'Оплата'
