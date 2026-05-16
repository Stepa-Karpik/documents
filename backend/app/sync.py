from dataclasses import dataclass

from app.repositories import DocumentRepository, SyncResult


@dataclass(frozen=True, slots=True)
class ExternalFileSnapshot:
    external_file_id: str
    filename: str
    revision: str


class WatchedFolderSyncService:
    def __init__(self, repository: DocumentRepository):
        self.repository = repository

    def sync(self, source_id: str, snapshots: list[ExternalFileSnapshot]) -> list[SyncResult]:
        return [
            self.repository.ingest_watched_file(
                source_id=source_id,
                external_file_id=snapshot.external_file_id,
                filename=snapshot.filename,
                revision=snapshot.revision,
            )
            for snapshot in snapshots
        ]
