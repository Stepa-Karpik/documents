from app.domain import DocumentService


def test_watched_folder_discovers_new_external_file_once():
    service = DocumentService()
    source = service.create_watched_source(
        owner_subject_id="usr_1",
        provider="yandex_disk",
        root_path="/Docs",
    )
    first = service.ingest_watched_file(
        source_id=source.id,
        external_file_id="disk_1",
        filename="invoice.docx",
        revision="rev_1",
    )
    second = service.ingest_watched_file(
        source_id=source.id,
        external_file_id="disk_1",
        filename="invoice.docx",
        revision="rev_1",
    )
    assert first.document_id == second.document_id
    assert first.action == "created"
    assert second.action == "unchanged"


def test_semantic_search_matches_filename_summary_and_entities():
    service = DocumentService()
    document = service.register_managed_document(
        owner_subject_id="usr_1",
        filename="rental-contract.pdf",
        content_type="application/pdf",
    )
    service.attach_analysis(
        document_id=document.id,
        summary="Договор аренды с депозитом 2000 евро",
        entities=["аренда", "депозит", "2000 евро"],
    )
    hits = service.search(owner_subject_id="usr_1", query="где был залог 2000 евро")
    assert hits[0].document_id == document.id
    assert hits[0].score > 0
