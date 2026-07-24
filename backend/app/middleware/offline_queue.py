import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import OfflineQueue

logger = logging.getLogger(__name__)


def enqueue(db: Session, user_id: int, task_type: str, payload: dict) -> OfflineQueue:
    task = OfflineQueue(
        user_id=user_id,
        task_type=task_type,
        payload_json=json.dumps(payload),
        status="pending",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    logger.info("Offline task enqueued: id=%s type=%s user=%s", task.id, task_type, user_id)
    return task


def get_pending(db: Session, user_id: int) -> list[OfflineQueue]:
    return (
        db.query(OfflineQueue)
        .filter(OfflineQueue.user_id == user_id, OfflineQueue.status == "pending")
        .order_by(OfflineQueue.created_at)
        .all()
    )


def mark_processing(db: Session, task: OfflineQueue):
    task.status = "processing"
    task.attempts += 1
    task.updated_at = datetime.utcnow()
    db.commit()


def mark_done(db: Session, task: OfflineQueue, result: dict):
    task.status = "done"
    task.result_json = json.dumps(result)
    task.updated_at = datetime.utcnow()
    db.commit()


def mark_failed(db: Session, task: OfflineQueue, error: str):
    task.status = "failed"
    task.error_message = error
    task.updated_at = datetime.utcnow()
    db.commit()


def pending_count(db: Session, user_id: int) -> int:
    return (
        db.query(OfflineQueue)
        .filter(OfflineQueue.user_id == user_id, OfflineQueue.status == "pending")
        .count()
    )


def flush_for_user(db: Session, user_id: int, processor) -> int:
    count = 0
    for task in get_pending(db, user_id):
        try:
            mark_processing(db, task)
            payload = json.loads(task.payload_json)
            result = processor(task.task_type, payload)
            mark_done(db, task, result)
            count += 1
        except Exception as exc:
            logger.error("Offline task %s failed: %s", task.id, exc)
            mark_failed(db, task, str(exc))
    return count
