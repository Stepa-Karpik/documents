from typing import Protocol

from app.repositories import DocumentRepository, SyncResult
from app.sync import ExternalFileSnapshot, WatchedFolderSyncService


class FolderProvider(Protocol):
    def list_folder(self, path: str) -> list[ExternalFileSnapshot]: ...


class PollingSyncWorker:
    def __init__(self, repository: DocumentRepository, provider: FolderProvider):
        self.repository = repository
        self.provider = provider

    def run_once(self, source_id: str) -> list[SyncResult]:
        source = self.repository.get_watched_source(source_id)
        snapshots = self.provider.list_folder(source.root_path)
        return WatchedFolderSyncService(self.repository).sync(source_id, snapshots)
