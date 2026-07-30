"""Durable ingestion commands, fenced leases, and transactional outbox delivery."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import json
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from cognoscope.api.errors import ApiError
from cognoscope.domain.events import EventLease, OutboxStatus
from cognoscope.domain.jobs import CLAIMABLE_STATES, TERMINAL_STATES, JobLease, JobState
from cognoscope.infrastructure.models import AdmittedAsset, AuthorityGeneration, DocumentRevision, DurableJob, EventConsumerReceipt, LibraryDocument, LibraryProject, OutboxEvent, new_id, utcnow


@dataclass(frozen=True)
class RestoreRecovery:
    jobs_marked: int
    events_released: int


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class JobService:
    """All state transitions are short, fenced database transactions."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    @staticmethod
    def _now() -> datetime:
        return utcnow()

    @staticmethod
    async def _assert_recovery_ready(db: AsyncSession) -> None:
        state = await db.get(AuthorityGeneration, 1, with_for_update=True)
        if state is None or state.recovery_required:
            raise ApiError(409, "restore_recovery_required", "Restore reconciliation must complete before work can be claimed")

    @staticmethod
    def _event(job: DurableJob, event_type: str, deduplication_key: str) -> OutboxEvent:
        return OutboxEvent(
            id=new_id(),
            aggregate_id=job.id,
            event_type=event_type,
            payload_json=_json({"job_id": job.id, "state": job.state, "checkpoint": job.checkpoint, "version": job.version}),
            deduplication_key=deduplication_key,
        )

    @staticmethod
    def _lease_matches(job: DurableJob, lease: JobLease, now: datetime) -> None:
        if (
            job.id != lease.job_id
            or job.state != JobState.RUNNING.value
            or job.lease_token != lease.token
            or job.lease_fence != lease.fence
            or job.lease_expires_at is None
            or _utc(job.lease_expires_at) <= now
        ):
            raise ApiError(409, "stale_lease", "The worker lease is stale")

    async def _finalize_running_cancellations(
        self,
        db: AsyncSession,
        now: datetime,
        *,
        expired_only: bool = True,
        excluded_job_ids: set[str] | None = None,
    ) -> int:
        query = select(DurableJob).where(
            DurableJob.state == JobState.RUNNING.value,
            DurableJob.cancel_requested.is_(True),
        )
        if expired_only:
            query = query.where((DurableJob.lease_expires_at.is_(None)) | (DurableJob.lease_expires_at <= now))
        if excluded_job_ids:
            query = query.where(DurableJob.id.not_in(excluded_job_ids))
        jobs = (await db.scalars(query.with_for_update())).all()
        for job in jobs:
            job.state = JobState.CANCELLED.value
            job.lease_token = None
            job.lease_expires_at = None
            job.terminal_at = now
            job.version += 1
            db.add(self._event(job, "job.cancelled", f"job:{job.id}:cancelled"))
        return len(jobs)

    async def _owned_asset(self, db: AsyncSession, account_id: str, asset_id: str) -> AdmittedAsset:
        asset = await db.scalar(
            select(AdmittedAsset)
            .join(DocumentRevision, AdmittedAsset.document_revision_id == DocumentRevision.id)
            .join(LibraryDocument, DocumentRevision.document_id == LibraryDocument.id)
            .join(LibraryProject, LibraryDocument.project_id == LibraryProject.id)
            .where(AdmittedAsset.id == asset_id, LibraryProject.owner_account_id == account_id)
            .with_for_update()
        )
        if asset is None:
            raise ApiError(404, "asset_not_found", "The admitted asset was not found")
        return asset

    async def create_import(
        self,
        *,
        account_id: str,
        admitted_asset_id: str,
        request_idempotency_key: str,
        resource_profile: str | None = "cpu-local",
    ) -> DurableJob:
        if not request_idempotency_key.strip():
            raise ApiError(422, "invalid_idempotency_key", "An idempotency key is required")
        job = DurableJob(
            id=new_id(),
            account_id=account_id,
            admitted_asset_id=admitted_asset_id,
            request_idempotency_key=request_idempotency_key,
            resource_profile=resource_profile,
            state=JobState.QUEUED.value,
            checkpoint=0,
            version=0,
            attempt_count=0,
            lease_fence=0,
            cancel_requested=False,
        )
        try:
            async with self._session_factory() as db:
                async with db.begin():
                    await self._owned_asset(db, account_id, admitted_asset_id)
                    db.add(job)
                    db.add(self._event(job, "import.requested", f"job:{job.id}:requested"))
            return job
        except IntegrityError as exc:
            async with self._session_factory() as db:
                existing = await db.scalar(
                    select(DurableJob).where(
                        DurableJob.account_id == account_id,
                        DurableJob.request_idempotency_key == request_idempotency_key,
                    )
                )
            if existing is None:
                raise ApiError(409, "idempotency_conflict", "The import request conflicts with existing work") from exc
            if existing.admitted_asset_id != admitted_asset_id or existing.resource_profile != resource_profile:
                raise ApiError(409, "idempotency_conflict", "The idempotency key belongs to a different import") from exc
            return existing

    async def get_job(self, *, account_id: str, job_id: str) -> DurableJob:
        async with self._session_factory() as db:
            job = await db.scalar(select(DurableJob).where(DurableJob.id == job_id, DurableJob.account_id == account_id))
        if job is None:
            raise ApiError(404, "job_not_found", "The job was not found")
        return job

    async def list_jobs(self, *, account_id: str) -> tuple[DurableJob, ...]:
        async with self._session_factory() as db:
            jobs = (await db.scalars(select(DurableJob).where(DurableJob.account_id == account_id).order_by(DurableJob.created_at.desc()))).all()
        return tuple(jobs)

    async def claim_job(self, *, job_id: str, worker_id: str, lease_seconds: int = 30) -> JobLease:
        if not worker_id or lease_seconds <= 0:
            raise ValueError("worker id and positive lease duration are required")
        now = self._now()
        token = str(uuid4())
        eligible = (DurableJob.state.in_([state.value for state in CLAIMABLE_STATES])) | (
            (DurableJob.state == JobState.RUNNING.value)
            & DurableJob.lease_token.is_not(None)
            & DurableJob.lease_expires_at.is_not(None)
            & (DurableJob.lease_expires_at <= now)
        )
        async with self._session_factory() as db:
            async with db.begin():
                await self._assert_recovery_ready(db)
                await self._finalize_running_cancellations(db, now)
                claimed = await db.execute(
                    update(DurableJob)
                    .where(DurableJob.id == job_id, DurableJob.cancel_requested.is_(False), eligible)
                    .values(
                        state=JobState.RUNNING.value,
                        wait_reason=None,
                        lease_token=token,
                        lease_fence=DurableJob.lease_fence + 1,
                        lease_expires_at=now + timedelta(seconds=lease_seconds),
                        attempt_count=DurableJob.attempt_count + 1,
                        version=DurableJob.version + 1,
                    )
                    .returning(DurableJob.id, DurableJob.lease_fence)
                )
                row = claimed.one_or_none()
        if row is None:
            async with self._session_factory() as db:
                job = await db.get(DurableJob, job_id)
            if job is None:
                raise ApiError(404, "job_not_found", "The job was not found")
            if job.cancel_requested:
                raise ApiError(409, "job_cancelled", "The job was cancelled")
            raise ApiError(409, "job_unavailable", "The job is not available for a worker")
        return JobLease(row.id, token, row.lease_fence)

    async def claim_next_job(self, *, worker_id: str, lease_seconds: int = 30) -> JobLease | None:
        now = self._now()
        eligible = (DurableJob.state.in_([state.value for state in CLAIMABLE_STATES])) | (
            (DurableJob.state == JobState.RUNNING.value)
            & DurableJob.lease_token.is_not(None)
            & DurableJob.lease_expires_at.is_not(None)
            & (DurableJob.lease_expires_at <= now)
        )
        async with self._session_factory() as db:
            async with db.begin():
                await self._assert_recovery_ready(db)
                await self._finalize_running_cancellations(db, now)
                job_id = await db.scalar(
                    select(DurableJob.id)
                    .where(DurableJob.cancel_requested.is_(False), eligible)
                    .order_by(DurableJob.created_at)
                    .limit(1)
                )
        if job_id is None:
            return None
        try:
            return await self.claim_job(job_id=job_id, worker_id=worker_id, lease_seconds=lease_seconds)
        except ApiError as exc:
            if exc.code == "job_unavailable":
                return None
            raise

    async def heartbeat(self, lease: JobLease, *, lease_seconds: int = 30) -> None:
        if lease_seconds <= 0:
            raise ValueError("positive lease duration is required")
        now = self._now()
        async with self._session_factory() as db:
            async with db.begin():
                job = await db.get(DurableJob, lease.job_id, with_for_update=True)
                if job is None:
                    raise ApiError(404, "job_not_found", "The job was not found")
                self._lease_matches(job, lease, now)
                job.lease_expires_at = now + timedelta(seconds=lease_seconds)
                job.version += 1

    async def lease_cancel_requested(self, lease: JobLease) -> bool:
        now = self._now()
        async with self._session_factory() as db:
            async with db.begin():
                job = await db.get(DurableJob, lease.job_id, with_for_update=True)
                if job is None:
                    raise ApiError(404, "job_not_found", "The job was not found")
                self._lease_matches(job, lease, now)
                return job.cancel_requested

    async def leased_job(self, lease: JobLease) -> DurableJob:
        """Return worker input only while the caller still owns the active fence."""

        now = self._now()
        async with self._session_factory() as db, db.begin():
            job = await db.get(DurableJob, lease.job_id, with_for_update=True)
            if job is None:
                raise ApiError(404, "job_not_found", "The job was not found")
            self._lease_matches(job, lease, now)
            return job

    async def checkpoint(self, lease: JobLease, *, checkpoint: int, result: object | None = None) -> DurableJob:
        now = self._now()
        async with self._session_factory() as db:
            async with db.begin():
                job = await db.get(DurableJob, lease.job_id, with_for_update=True)
                if job is None:
                    raise ApiError(404, "job_not_found", "The job was not found")
                self._lease_matches(job, lease, now)
                serialized_result = None if result is None else _json(result)
                if checkpoint == job.checkpoint:
                    if serialized_result != job.result_json:
                        raise ApiError(409, "checkpoint_conflict", "Checkpoint result does not match committed work")
                    return job
                if checkpoint < job.checkpoint:
                    raise ApiError(409, "checkpoint_regression", "Checkpoints must advance monotonically")
                job.checkpoint = checkpoint
                if serialized_result is not None:
                    job.result_json = serialized_result
                db.add(self._event(job, "job.checkpointed", f"job:{job.id}:checkpoint:{checkpoint}"))
                return job

    async def resource_wait(self, lease: JobLease, *, reason: str, resource_profile: str | None = None) -> DurableJob:
        if not reason.strip():
            raise ApiError(422, "invalid_wait_reason", "A resource wait reason is required")
        now = self._now()
        async with self._session_factory() as db:
            async with db.begin():
                job = await db.get(DurableJob, lease.job_id, with_for_update=True)
                if job is None:
                    raise ApiError(404, "job_not_found", "The job was not found")
                self._lease_matches(job, lease, now)
                job.state = JobState.RESOURCE_WAIT.value
                job.resource_profile = resource_profile or job.resource_profile
                job.wait_reason = reason
                job.lease_token = None
                job.lease_expires_at = None
                job.version += 1
                db.add(self._event(job, "job.resource_wait", f"job:{job.id}:resource_wait:{job.version}"))
                return job

    async def finish(
        self,
        lease: JobLease,
        *,
        state: JobState,
        result: object | None = None,
        failure_code: str | None = None,
    ) -> DurableJob:
        if state not in TERMINAL_STATES:
            raise ValueError("finish requires a terminal state")
        now = self._now()
        async with self._session_factory() as db:
            async with db.begin():
                job = await db.get(DurableJob, lease.job_id, with_for_update=True)
                if job is None:
                    raise ApiError(404, "job_not_found", "The job was not found")
                self._lease_matches(job, lease, now)
                if job.cancel_requested and state != JobState.CANCELLED:
                    raise ApiError(409, "job_cancelled", "The job was cancelled")
                job.state = state.value
                job.result_json = _json(result) if result is not None else job.result_json
                job.failure_code = failure_code
                job.lease_token = None
                job.lease_expires_at = None
                job.terminal_at = now
                job.version += 1
                db.add(self._event(job, f"job.{state.value}", f"job:{job.id}:{state.value}"))
                return job

    async def request_cancel(self, *, account_id: str, job_id: str) -> DurableJob:
        now = self._now()
        async with self._session_factory() as db:
            async with db.begin():
                job = await db.scalar(
                    select(DurableJob).where(DurableJob.id == job_id, DurableJob.account_id == account_id).with_for_update()
                )
                if job is None:
                    raise ApiError(404, "job_not_found", "The job was not found")
                if JobState(job.state) in TERMINAL_STATES:
                    return job
                job.cancel_requested = True
                job.version += 1
                if job.state != JobState.RUNNING.value:
                    job.state = JobState.CANCELLED.value
                    job.terminal_at = now
                    job.lease_token = None
                    job.lease_expires_at = None
                    db.add(self._event(job, "job.cancelled", f"job:{job.id}:cancelled"))
                return job

    async def retry_import(self, *, account_id: str, job_id: str, request_idempotency_key: str) -> DurableJob:
        job = await self.get_job(account_id=account_id, job_id=job_id)
        if JobState(job.state) not in {JobState.PARTIAL, JobState.FAILED, JobState.CANCELLED}:
            raise ApiError(409, "job_not_retryable", "Only partial, failed, or cancelled imports can be retried")
        return await self.create_import(
            account_id=account_id,
            admitted_asset_id=job.admitted_asset_id,
            request_idempotency_key=request_idempotency_key,
            resource_profile=job.resource_profile,
        )

    async def recover_after_restore(self, *, reconciliation_acknowledged: bool) -> RestoreRecovery:
        if not reconciliation_acknowledged:
            raise ApiError(409, "reconciliation_required", "Authority and blob reconciliation must complete before jobs recover")
        now = self._now()
        jobs_marked = events_released = 0
        async with self._session_factory() as db:
            async with db.begin():
                recovery_state = await db.get(AuthorityGeneration, 1, with_for_update=True)
                if recovery_state is None:
                    raise RuntimeError("authority generation is not initialized")
                jobs_marked += await self._finalize_running_cancellations(
                    db, now, expired_only=False
                )
                jobs = (await db.scalars(select(DurableJob).with_for_update())).all()
                for job in jobs:
                    if JobState(job.state) not in TERMINAL_STATES and not (job.state == JobState.RECOVERY_PENDING.value and job.lease_token is None):
                        job.state = JobState.RECOVERY_PENDING.value
                        job.lease_token = None
                        job.lease_expires_at = None
                        job.wait_reason = "restore_recovery"
                        job.version += 1
                        db.add(self._event(job, "job.recovery_pending", f"job:{job.id}:recovery:{job.version}"))
                        jobs_marked += 1
                events = (await db.scalars(select(OutboxEvent).where(OutboxEvent.status == OutboxStatus.LEASED.value).with_for_update())).all()
                for event in events:
                    event.status = OutboxStatus.PENDING.value
                    event.lease_token = None
                    event.lease_expires_at = None
                    event.available_at = now
                    events_released += 1
                recovery_state.recovery_required = False
        return RestoreRecovery(jobs_marked, events_released)

    async def claim_outbox_event(self, *, worker_id: str, lease_seconds: int = 30) -> EventLease | None:
        if not worker_id or lease_seconds <= 0:
            raise ValueError("worker id and positive lease duration are required")
        now = self._now()
        eligible = or_(
            (OutboxEvent.status == OutboxStatus.PENDING.value) & (OutboxEvent.available_at <= now),
            (OutboxEvent.status == OutboxStatus.LEASED.value) & (OutboxEvent.lease_expires_at <= now),
        )
        async with self._session_factory() as db:
            async with db.begin():
                await self._assert_recovery_ready(db)
                event_id = await db.scalar(select(OutboxEvent.id).where(eligible).order_by(OutboxEvent.created_at).limit(1))
        if event_id is None:
            return None
        token = str(uuid4())
        async with self._session_factory() as db:
            async with db.begin():
                await self._assert_recovery_ready(db)
                claimed = await db.execute(
                    update(OutboxEvent)
                    .where(OutboxEvent.id == event_id, eligible)
                    .values(
                        status=OutboxStatus.LEASED.value,
                        lease_token=token,
                        lease_fence=OutboxEvent.lease_fence + 1,
                        lease_expires_at=now + timedelta(seconds=lease_seconds),
                        attempt_count=OutboxEvent.attempt_count + 1,
                    )
                    .returning(
                        OutboxEvent.id,
                        OutboxEvent.lease_fence,
                        OutboxEvent.event_type,
                        OutboxEvent.aggregate_id,
                        OutboxEvent.payload_json,
                    )
                )
                row = claimed.one_or_none()
        if row is None:
            return None
        return EventLease(row.id, token, row.lease_fence, row.event_type, row.aggregate_id, row.payload_json)

    async def deliver_outbox_event(
        self,
        lease: EventLease,
        *,
        consumer_name: str,
        handler: Callable[[EventLease, AsyncSession], Awaitable[None]],
        max_attempts: int = 5,
    ) -> bool:
        """Runs a local transactional consumer; network work must never be a handler here."""
        now = self._now()
        try:
            async with self._session_factory() as db:
                async with db.begin():
                    event = await db.get(OutboxEvent, lease.event_id, with_for_update=True)
                    if (
                        event is None
                        or event.status != OutboxStatus.LEASED.value
                        or event.lease_token != lease.token
                        or event.lease_fence != lease.fence
                        or event.lease_expires_at is None
                        or _utc(event.lease_expires_at) <= now
                    ):
                        raise ApiError(409, "stale_event_lease", "The event delivery lease is stale")
                    receipt = await db.scalar(
                        select(EventConsumerReceipt).where(
                            EventConsumerReceipt.consumer_name == consumer_name,
                            EventConsumerReceipt.event_id == event.id,
                        )
                    )
                    if receipt is None:
                        await handler(lease, db)
                        db.add(EventConsumerReceipt(id=new_id(), consumer_name=consumer_name, event_id=event.id))
                    event.status = OutboxStatus.DELIVERED.value
                    event.lease_token = None
                    event.lease_expires_at = None
                    event.delivered_at = now
                    return receipt is None
        except ApiError:
            raise
        except Exception as exc:
            await self._record_delivery_failure(lease, str(exc), max_attempts=max_attempts)
            raise

    async def _record_delivery_failure(self, lease: EventLease, error: str, *, max_attempts: int) -> None:
        now = self._now()
        async with self._session_factory() as db:
            async with db.begin():
                event = await db.get(OutboxEvent, lease.event_id, with_for_update=True)
                if event is None or event.lease_token != lease.token or event.lease_fence != lease.fence:
                    return
                event.last_error = error[:4096]
                event.lease_token = None
                event.lease_expires_at = None
                if event.attempt_count >= max_attempts:
                    event.status = OutboxStatus.POISON.value
                else:
                    event.status = OutboxStatus.PENDING.value
                    event.available_at = now + timedelta(seconds=min(2 ** event.attempt_count, 300))

    async def retry_poison_event(self, *, event_id: str) -> OutboxEvent:
        async with self._session_factory() as db:
            async with db.begin():
                event = await db.get(OutboxEvent, event_id, with_for_update=True)
                if event is None:
                    raise ApiError(404, "event_not_found", "The event was not found")
                if event.status != OutboxStatus.POISON.value:
                    raise ApiError(409, "event_not_poisoned", "Only poison events can be retried")
                event.status = OutboxStatus.PENDING.value
                event.available_at = self._now()
                event.last_error = None
                return event

    async def events_for_job(self, *, account_id: str, job_id: str) -> tuple[OutboxEvent, ...]:
        await self.get_job(account_id=account_id, job_id=job_id)
        async with self._session_factory() as db:
            events = (await db.scalars(select(OutboxEvent).where(OutboxEvent.aggregate_id == job_id).order_by(OutboxEvent.created_at))).all()
        return tuple(events)

    async def retry_owned_poison_event(self, *, account_id: str, event_id: str) -> OutboxEvent:
        async with self._session_factory() as db:
            event = await db.scalar(
                select(OutboxEvent)
                .join(DurableJob, OutboxEvent.aggregate_id == DurableJob.id)
                .where(OutboxEvent.id == event_id, DurableJob.account_id == account_id)
            )
        if event is None:
            raise ApiError(404, "event_not_found", "The event was not found")
        return await self.retry_poison_event(event_id=event_id)
