from collections.abc import Generator
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL = os.getenv("DOCUMENTS_DATABASE_URL", "sqlite+pysqlite:///./documents.db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(engine)


def get_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
