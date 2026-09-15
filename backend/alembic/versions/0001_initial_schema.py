"""initial schema

Revision ID: 0001
Revises: —
Create Date: 2026-09-14 17:51:11.348172
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Триграммный индекс для поиска по тексту заявки.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table('calendar_days',
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('is_working', sa.Boolean(), nullable=False),
    sa.Column('note', sa.String(length=256), nullable=True),
    sa.PrimaryKeyConstraint('day', name=op.f('pk_calendar_days'))
    )
    op.create_table('regions',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('name', sa.String(length=128), nullable=False),
    sa.Column('sort_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_regions')),
    sa.UniqueConstraint('name', name=op.f('uq_regions_name'))
    )
    op.create_table('request_counters',
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('last_value', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('year', name=op.f('pk_request_counters'))
    )
    op.create_table('topics',
    sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
    sa.Column('name', sa.String(length=128), nullable=False),
    sa.Column('sort_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('requires_detail', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_topics')),
    sa.UniqueConstraint('name', name=op.f('uq_topics_name'))
    )
    op.create_table('users',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('login', sa.String(length=256), nullable=False),
    sa.Column('full_name', sa.String(length=256), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=True),
    sa.Column('department', sa.String(length=256), nullable=True),
    sa.Column('is_admin', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('last_phone', sa.String(length=64), nullable=True),
    sa.Column('last_region_id', sa.Integer(), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['last_region_id'], ['regions.id'], name=op.f('fk_users_last_region_id_regions')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('login', name=op.f('uq_users_login'))
    )
    op.create_table('requests',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('number', sa.String(length=32), nullable=False),
    sa.Column('status', sa.Enum('review', 'clarification', 'accepted', 'development', 'testing', 'done', 'closed', 'rejected', 'withdrawn', name='request_status', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('author_id', sa.BigInteger(), nullable=False),
    sa.Column('applicant_name', sa.String(length=256), nullable=False),
    sa.Column('applicant_email', sa.String(length=320), nullable=True),
    sa.Column('applicant_phone', sa.String(length=64), nullable=False),
    sa.Column('applicant_department', sa.String(length=256), nullable=False),
    sa.Column('region_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.Enum('new', 'upgrade', name='request_type', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('existing_system_name', sa.String(length=500), nullable=True),
    sa.Column('topic_id', sa.Integer(), nullable=False),
    sa.Column('topic_other', sa.String(length=200), nullable=True),
    sa.Column('process', sa.Text(), nullable=False),
    sa.Column('problem', sa.Text(), nullable=False),
    sa.Column('desired_result', sa.Text(), nullable=False),
    sa.Column('method_suggestion', sa.Text(), nullable=True),
    sa.Column('beneficiaries', sa.Text(), nullable=False),
    sa.Column('result_recipient', sa.Text(), nullable=False),
    sa.Column('frequency', sa.Enum('day', 'week', 'month', 'quarter', 'year', 'irregular', name='frequency', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('duration', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('duration_unit', sa.Enum('minutes', 'hours', 'days', name='duration_unit', native_enum=False, create_constraint=True, length=32), nullable=True),
    sa.Column('times_per_period', sa.Integer(), nullable=True),
    sa.Column('employees_count', sa.Integer(), nullable=True),
    sa.Column('workload_note', sa.Text(), nullable=True),
    sa.Column('workload_hours_month', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('responsible', sa.String(length=256), nullable=True),
    sa.Column('deadline', sa.Date(), nullable=True),
    sa.Column('consent_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('review_due_date', sa.Date(), nullable=True),
    sa.Column('first_viewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=False),
    sa.Column('search_text', sa.Text(), sa.Computed("lower(number || ' ' || applicant_name || ' ' || applicant_department || ' ' || coalesce(existing_system_name, '') || ' ' || coalesce(topic_other, '') || ' ' || coalesce(responsible, '') || ' ' || process || ' ' || problem || ' ' || desired_result)", persisted=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("type <> 'upgrade' OR existing_system_name IS NOT NULL", name=op.f('ck_requests_upgrade_has_system')),
    sa.CheckConstraint('duration IS NULL OR duration > 0', name=op.f('ck_requests_duration_positive')),
    sa.CheckConstraint('employees_count IS NULL OR employees_count > 0', name=op.f('ck_requests_employees_positive')),
    sa.CheckConstraint('times_per_period IS NULL OR times_per_period > 0', name=op.f('ck_requests_times_positive')),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], name=op.f('fk_requests_author_id_users')),
    sa.ForeignKeyConstraint(['region_id'], ['regions.id'], name=op.f('fk_requests_region_id_regions')),
    sa.ForeignKeyConstraint(['topic_id'], ['topics.id'], name=op.f('fk_requests_topic_id_topics')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_requests')),
    sa.UniqueConstraint('number', name=op.f('uq_requests_number'))
    )
    op.create_index(op.f('ix_requests_author_id'), 'requests', ['author_id'], unique=False)
    op.create_index(op.f('ix_requests_region_id'), 'requests', ['region_id'], unique=False)
    op.create_index('ix_requests_search_trgm', 'requests', ['search_text'], unique=False, postgresql_using='gin', postgresql_ops={'search_text': 'gin_trgm_ops'})
    op.create_index(op.f('ix_requests_status'), 'requests', ['status'], unique=False)
    op.create_index('ix_requests_status_created', 'requests', ['status', 'created_at'], unique=False)
    op.create_index(op.f('ix_requests_topic_id'), 'requests', ['topic_id'], unique=False)
    op.create_table('drafts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('request_id', sa.UUID(), nullable=True),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['request_id'], ['requests.id'], name=op.f('fk_drafts_request_id_requests'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_drafts_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_drafts'))
    )
    op.create_index('uq_drafts_new_per_user', 'drafts', ['user_id'], unique=True, postgresql_where=sa.text('request_id IS NULL'))
    op.create_index('uq_drafts_user_request', 'drafts', ['user_id', 'request_id'], unique=True, postgresql_where=sa.text('request_id IS NOT NULL'))
    op.create_table('request_events',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('request_id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.Enum('submitted', 'status_changed', 'resubmitted', 'withdrawn', 'comment', 'assignment_changed', name='event_kind', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('from_status', sa.Enum('review', 'clarification', 'accepted', 'development', 'testing', 'done', 'closed', 'rejected', 'withdrawn', name='event_from_status', native_enum=False, create_constraint=True, length=32), nullable=True),
    sa.Column('to_status', sa.Enum('review', 'clarification', 'accepted', 'development', 'testing', 'done', 'closed', 'rejected', 'withdrawn', name='event_to_status', native_enum=False, create_constraint=True, length=32), nullable=True),
    sa.Column('comment', sa.Text(), nullable=True),
    sa.Column('is_internal', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('actor_id', sa.BigInteger(), nullable=True),
    sa.Column('actor_name', sa.String(length=256), nullable=False),
    sa.Column('actor_role', sa.Enum('applicant', 'admin', 'system', name='actor_role', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_request_events_actor_id_users')),
    sa.ForeignKeyConstraint(['request_id'], ['requests.id'], name=op.f('fk_request_events_request_id_requests'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_request_events'))
    )
    op.create_index('ix_request_events_request_created', 'request_events', ['request_id', 'created_at'], unique=False)
    op.create_table('notifications',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('request_id', sa.UUID(), nullable=False),
    sa.Column('event_id', sa.BigInteger(), nullable=True),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['event_id'], ['request_events.id'], name=op.f('fk_notifications_event_id_request_events'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['request_id'], ['requests.id'], name=op.f('fk_notifications_request_id_requests'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notifications_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications'))
    )
    op.create_index('ix_notifications_user_unread', 'notifications', ['user_id', 'read_at', 'created_at'], unique=False)
    op.create_table('request_documents',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('request_id', sa.UUID(), nullable=True),
    sa.Column('draft_id', sa.UUID(), nullable=True),
    sa.Column('uploaded_by', sa.BigInteger(), nullable=False),
    sa.Column('original_name', sa.String(length=255), nullable=False),
    sa.Column('extension', sa.String(length=16), nullable=False),
    sa.Column('content_type', sa.String(length=128), nullable=False),
    sa.Column('size_bytes', sa.BigInteger(), nullable=False),
    sa.Column('storage_key', sa.String(length=64), nullable=False),
    sa.Column('usage', sa.Text(), nullable=True),
    sa.Column('future_use', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('request_id IS NOT NULL OR draft_id IS NOT NULL', name=op.f('ck_request_documents_has_owner')),
    sa.ForeignKeyConstraint(['draft_id'], ['drafts.id'], name=op.f('fk_request_documents_draft_id_drafts'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['request_id'], ['requests.id'], name=op.f('fk_request_documents_request_id_requests'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], name=op.f('fk_request_documents_uploaded_by_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_request_documents')),
    sa.UniqueConstraint('storage_key', name=op.f('uq_request_documents_storage_key'))
    )
    op.create_index(op.f('ix_request_documents_draft_id'), 'request_documents', ['draft_id'], unique=False)
    op.create_index(op.f('ix_request_documents_request_id'), 'request_documents', ['request_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_request_documents_request_id'), table_name='request_documents')
    op.drop_index(op.f('ix_request_documents_draft_id'), table_name='request_documents')
    op.drop_table('request_documents')
    op.drop_index('ix_notifications_user_unread', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index('ix_request_events_request_created', table_name='request_events')
    op.drop_table('request_events')
    op.drop_index('uq_drafts_user_request', table_name='drafts', postgresql_where=sa.text('request_id IS NOT NULL'))
    op.drop_index('uq_drafts_new_per_user', table_name='drafts', postgresql_where=sa.text('request_id IS NULL'))
    op.drop_table('drafts')
    op.drop_index(op.f('ix_requests_topic_id'), table_name='requests')
    op.drop_index('ix_requests_status_created', table_name='requests')
    op.drop_index(op.f('ix_requests_status'), table_name='requests')
    op.drop_index('ix_requests_search_trgm', table_name='requests', postgresql_using='gin', postgresql_ops={'search_text': 'gin_trgm_ops'})
    op.drop_index(op.f('ix_requests_region_id'), table_name='requests')
    op.drop_index(op.f('ix_requests_author_id'), table_name='requests')
    op.drop_table('requests')
    op.drop_table('users')
    op.drop_table('topics')
    op.drop_table('request_counters')
    op.drop_table('regions')
    op.drop_table('calendar_days')
