import httpx
from app.platform_clients import HttpAiClient, HttpFilesClient, HttpSearchClient


def test_http_platform_clients_use_expected_contracts():
    seen=[]
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path))
        if request.url.path == '/api/v1/assets/external':
            return httpx.Response(201, json={'asset_id': 'asset_1'})
        if request.url.path == '/api/v1/jobs':
            return httpx.Response(201, json={'job_id': 'job_1'})
        return httpx.Response(201, json={'ok': True})
    transport = httpx.MockTransport(handler)
    files = HttpFilesClient(base_url='http://files', transport=transport)
    ai = HttpAiClient(base_url='http://ai', transport=transport)
    search = HttpSearchClient(base_url='http://search', transport=transport)
    assert files.register_external_asset(owner_subject_id='usr_1', provider='yandex_disk', external_file_id='disk_1', revision='rev_1') == 'asset_1'
    assert ai.create_job(document_id='doc_1', content_ref='asset_1') == 'job_1'
    search.index_document(document_id='doc_1', owner_subject_id='usr_1', text='hello')
    search.index_entities(document_id='doc_1', owner_subject_id='usr_1', entities=[{'kind': 'topic', 'name': 'аренда'}])
    assert search.list_groups(owner_subject_id='usr_1') == {'ok': True}
    assert seen == [('POST', '/api/v1/assets/external'), ('POST', '/api/v1/jobs'), ('POST', '/api/v1/index'), ('POST', '/api/v1/entities/index'), ('GET', '/api/v1/groups')]
