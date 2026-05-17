from alembic import op
import sqlalchemy as sa

revision = "0002_document_asset_id"
down_revision = "0001_initial_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("asset_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "asset_id")
