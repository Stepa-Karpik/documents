import httpx
from app.planner_client import HttpPlannerClient


def test_planner_client_creates_document_event():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/v1/document-events'
        return httpx.Response(201, json={'event_id': 'evt_1'})
    client = HttpPlannerClient(base_url='http://planner', transport=httpx.MockTransport(handler))
    event_id = client.create_document_event(owner_subject_id='usr_1', calendar_title='Документы', title='Продлить', starts_at='2026-07-01T09:00:00+03:00', description='', priority='normal')
    assert event_id == 'evt_1'
