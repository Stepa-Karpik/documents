"""store external file paths"""
from alembic import op
import sqlalchemy as sa

revision = "0003_document_external_path"
down_revision = "0002_document_asset_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("external_path", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "external_path")
