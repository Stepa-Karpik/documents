from dataclasses import dataclass

from app.repositories import DocumentRepository, SyncResult


@dataclass(frozen=True, slots=True)
class ExternalFileSnapshot:
    external_file_id: str
    filename: str
    revision: str
    external_path: str | None = None


class WatchedFolderSyncService:
    def __init__(self, repository: DocumentRepository, on_discovered=None):
        self.repository = repository
        self.on_discovered = on_discovered

    def sync(self, source_id: str, snapshots: list[ExternalFileSnapshot]) -> list[SyncResult]:
        results: list[SyncResult] = []
        for snapshot in snapshots:
            result = self.repository.ingest_watched_file(
                source_id=source_id,
                external_file_id=snapshot.external_file_id,
                filename=snapshot.filename,
                revision=snapshot.revision,
                external_path=snapshot.external_path,
            )
            if result.action in {'created', 'updated'} and self.on_discovered is not None:
                self.on_discovered(snapshot)
            results.append(result)
        return results
