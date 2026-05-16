from app.domain import DocumentService, StorageMode


def test_registers_managed_document():
    service = DocumentService()
    document = service.register_managed_document(
        owner_subject_id="usr_1",
        filename="contract.pdf",
        content_type="application/pdf",
    )
    assert document.storage_mode is StorageMode.MANAGED
    assert document.analysis_status == "queued"
    assert document.preview_status == "queued"


def test_external_same_revision_is_not_reprocessed():
    service = DocumentService()
    first = service.discover_external_document(
        owner_subject_id="usr_1",
        provider="yandex_disk",
        external_file_id="disk_1",
        filename="invoice.docx",
        revision="rev_1",
    )
    second = service.discover_external_document(
        owner_subject_id="usr_1",
        provider="yandex_disk",
        external_file_id="disk_1",
        filename="invoice.docx",
        revision="rev_1",
    )
    assert first.id == second.id
    assert second.analysis_attempts == 1


def test_external_new_revision_is_reprocessed():
    service = DocumentService()
    service.discover_external_document(
        owner_subject_id="usr_1",
        provider="yandex_disk",
        external_file_id="disk_1",
        filename="invoice.docx",
        revision="rev_1",
    )
    updated = service.discover_external_document(
        owner_subject_id="usr_1",
        provider="yandex_disk",
        external_file_id="disk_1",
        filename="invoice.docx",
        revision="rev_2",
    )
    assert updated.revision == "rev_2"
    assert updated.analysis_attempts == 2
    assert updated.analysis_status == "queued"


def test_found_dates_become_editable_event_proposals():
    service = DocumentService()
    document = service.register_managed_document(
        owner_subject_id="usr_1",
        filename="insurance.pdf",
        content_type="application/pdf",
    )
    proposal = service.add_event_proposal(
        document_id=document.id,
        title="Продление страховки",
        starts_at="2026-07-01T09:00:00+03:00",
        description="Срок окончания страховки",
    )
    updated = service.update_event_proposal(
        proposal.id,
        title="Проверить продление страховки",
        priority="high",
    )
    assert updated.title == "Проверить продление страховки"
    assert updated.priority == "high"
    assert updated.confirmed is False


def test_confirmed_event_proposal_uses_planner_client():
    class FakePlannerClient:
        def __init__(self):
            self.calls = []
        def create_document_event(self, **payload):
            self.calls.append(payload)
            return "evt_1"

    planner = FakePlannerClient()
    service = DocumentService(planner_client=planner)
    document = service.register_managed_document(owner_subject_id="usr_1", filename="insurance.pdf", content_type="application/pdf")
    proposal = service.add_event_proposal(document_id=document.id, title="Продлить страховку", starts_at="2026-07-01T09:00:00+03:00")
    confirmed = service.confirm_event_proposal(proposal.id)
    assert confirmed.confirmed is True
    assert planner.calls[0]["calendar_title"] == "Документы"
    assert planner.calls[0]["owner_subject_id"] == "usr_1"
