"""initial documents schema

Revision ID: 0001_initial_documents
Revises:
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = '0001_initial_documents'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'documents',
        sa.Column('id', sa.String(length=64), primary_key=True),
        sa.Column('owner_subject_id', sa.String(length=128), nullable=False),
        sa.Column('filename', sa.String(length=512), nullable=False),
        sa.Column('storage_mode', sa.String(length=32), nullable=False),
        sa.Column('content_type', sa.String(length=255), nullable=True),
        sa.Column('provider', sa.String(length=64), nullable=True),
        sa.Column('external_file_id', sa.String(length=512), nullable=True),
        sa.Column('revision', sa.String(length=255), nullable=True),
        sa.Column('preview_status', sa.String(length=32), nullable=False),
        sa.Column('analysis_status', sa.String(length=32), nullable=False),
        sa.Column('analysis_attempts', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('owner_subject_id', 'provider', 'external_file_id', name='uq_external_document'),
    )
    op.create_index('ix_documents_owner_subject_id', 'documents', ['owner_subject_id'])
    op.create_table(
        'watched_sources',
        sa.Column('id', sa.String(length=64), primary_key=True),
        sa.Column('owner_subject_id', sa.String(length=128), nullable=False),
        sa.Column('provider', sa.String(length=64), nullable=False),
        sa.Column('root_path', sa.String(length=1024), nullable=False),
        sa.Column('last_scan_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_watched_sources_owner_subject_id', 'watched_sources', ['owner_subject_id'])
    op.create_table(
        'analysis_records',
        sa.Column('document_id', sa.String(length=64), sa.ForeignKey('documents.id'), primary_key=True),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('entities_json', sa.Text(), nullable=False),
    )
    op.create_table(
        'event_proposals',
        sa.Column('id', sa.String(length=64), primary_key=True),
        sa.Column('document_id', sa.String(length=64), sa.ForeignKey('documents.id'), nullable=False),
        sa.Column('title', sa.String(length=512), nullable=False),
        sa.Column('starts_at', sa.String(length=128), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('priority', sa.String(length=32), nullable=False),
        sa.Column('confirmed', sa.Integer(), nullable=False),
        sa.Column('planner_event_id', sa.String(length=128), nullable=True),
    )
    op.create_index('ix_event_proposals_document_id', 'event_proposals', ['document_id'])


def downgrade() -> None:
    op.drop_index('ix_event_proposals_document_id', table_name='event_proposals')
    op.drop_table('event_proposals')
    op.drop_table('analysis_records')
    op.drop_index('ix_watched_sources_owner_subject_id', table_name='watched_sources')
    op.drop_table('watched_sources')
    op.drop_index('ix_documents_owner_subject_id', table_name='documents')
    op.drop_table('documents')
