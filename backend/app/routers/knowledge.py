import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.routers.auth import get_current_user
from app.models import KnowledgePoint, KnowledgeLink, DocumentChunk, Book
from app.schemas import (
    KnowledgePointCreate, KnowledgePointUpdate, KnowledgePointResponse, KnowledgePointDetail,
    KnowledgeLinkCreate, KnowledgeLinkResponse,
    GraphNode, GraphEdge, GraphResponse, KnowledgeStatsResponse,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


def _parse_json(text: Optional[str]) -> list:
    if not text:
        return []
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return []


def _to_kp_response(kp: KnowledgePoint, db: Session) -> KnowledgePointResponse:
    outgoing = db.query(KnowledgeLink).filter(KnowledgeLink.source_kp_id == kp.id).count()
    incoming = db.query(KnowledgeLink).filter(KnowledgeLink.target_kp_id == kp.id).count()
    return KnowledgePointResponse(
        id=kp.id,
        user_id=kp.user_id,
        label=kp.label,
        aliases=_parse_json(kp.aliases),
        description=kp.description,
        source_chunk_ids=_parse_json(kp.source_chunk_ids),
        entity_type=kp.entity_type,
        link_count=outgoing + incoming,
        created_at=kp.created_at,
        updated_at=kp.updated_at,
    )


@router.get("/points", response_model=List[KnowledgePointResponse])
def list_knowledge_points(
    book_id: Optional[int] = Query(None),
    entity_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    query = db.query(KnowledgePoint).filter(KnowledgePoint.user_id == user["id"])

    if entity_type:
        query = query.filter(KnowledgePoint.entity_type == entity_type)

    if search:
        query = query.filter(KnowledgePoint.label.ilike(f"%{search}%"))

    if book_id:
        chunk_ids = (
            db.query(DocumentChunk.id)
            .filter(DocumentChunk.book_id == book_id)
            .all()
        )
        cid_set = {row[0] for row in chunk_ids}
        kps = query.order_by(KnowledgePoint.updated_at.desc()).all()
        filtered = []
        for kp in kps:
            kp_chunk_ids = set(_parse_json(kp.source_chunk_ids))
            if kp_chunk_ids & cid_set:
                filtered.append(kp)
        return [_to_kp_response(kp, db) for kp in filtered[offset:offset + limit]]

    kps = query.order_by(KnowledgePoint.updated_at.desc()).offset(offset).limit(limit).all()
    return [_to_kp_response(kp, db) for kp in kps]


@router.get("/points/{kp_id}", response_model=KnowledgePointDetail)
def get_knowledge_point(
    kp_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    kp = db.query(KnowledgePoint).filter(
        KnowledgePoint.id == kp_id,
        KnowledgePoint.user_id == user["id"],
    ).first()
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    result = _to_kp_response(kp, db)

    outgoing = db.query(KnowledgeLink).filter(KnowledgeLink.source_kp_id == kp.id).all()
    incoming = db.query(KnowledgeLink).filter(KnowledgeLink.target_kp_id == kp.id).all()
    linked_kp_ids = set()
    for link in outgoing:
        linked_kp_ids.add(link.target_kp_id)
    for link in incoming:
        linked_kp_ids.add(link.source_kp_id)
    linked = db.query(KnowledgePoint).filter(KnowledgePoint.id.in_(linked_kp_ids)).all() if linked_kp_ids else []
    linked_responses = [_to_kp_response(lkp, db) for lkp in linked]

    chunk_ids = _parse_json(kp.source_chunk_ids)
    sample_chunks = []
    if chunk_ids:
        chunks = db.query(DocumentChunk).filter(DocumentChunk.id.in_(chunk_ids[:5])).all()
        for ch in chunks:
            book_title = db.query(Book.title).filter(Book.id == ch.book_id).scalar() or "Unknown"
            sample_chunks.append({
                "chunk_id": ch.id,
                "book_id": ch.book_id,
                "book_title": book_title,
                "text": ch.text[:300] if ch.text else "",
                "section_path": ch.section_path,
                "page_start": ch.page_start,
            })

    return KnowledgePointDetail(
        **result.model_dump(),
        linked_points=linked_responses,
        sample_chunks=sample_chunks,
    )


@router.post("/points", response_model=KnowledgePointResponse)
def create_knowledge_point(
    body: KnowledgePointCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    existing = db.query(KnowledgePoint).filter(
        KnowledgePoint.user_id == user["id"],
        KnowledgePoint.label == body.label,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Knowledge point with this label already exists")

    kp = KnowledgePoint(
        user_id=user["id"],
        label=body.label,
        aliases=json.dumps(body.aliases),
        description=body.description,
        source_chunk_ids=json.dumps(body.source_chunk_ids),
        entity_type=body.entity_type,
    )
    db.add(kp)
    db.commit()
    db.refresh(kp)
    return _to_kp_response(kp, db)


@router.patch("/points/{kp_id}", response_model=KnowledgePointResponse)
def update_knowledge_point(
    kp_id: int,
    body: KnowledgePointUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    kp = db.query(KnowledgePoint).filter(
        KnowledgePoint.id == kp_id,
        KnowledgePoint.user_id == user["id"],
    ).first()
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    if body.label is not None:
        kp.label = body.label
    if body.aliases is not None:
        kp.aliases = json.dumps(body.aliases)
    if body.description is not None:
        kp.description = body.description
    if body.source_chunk_ids is not None:
        kp.source_chunk_ids = json.dumps(body.source_chunk_ids)
    if body.entity_type is not None:
        kp.entity_type = body.entity_type

    db.commit()
    db.refresh(kp)
    return _to_kp_response(kp, db)


@router.delete("/points/{kp_id}")
def delete_knowledge_point(
    kp_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    kp = db.query(KnowledgePoint).filter(
        KnowledgePoint.id == kp_id,
        KnowledgePoint.user_id == user["id"],
    ).first()
    if not kp:
        raise HTTPException(status_code=404, detail="Knowledge point not found")

    db.query(KnowledgeLink).filter(
        (KnowledgeLink.source_kp_id == kp_id) | (KnowledgeLink.target_kp_id == kp_id)
    ).delete()
    db.delete(kp)
    db.commit()
    return {"ok": True}


@router.get("/graph", response_model=GraphResponse)
def get_graph(
    book_id: Optional[int] = Query(None),
    central_kp_id: Optional[int] = Query(None),
    depth: int = Query(2, ge=1, le=5),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if central_kp_id:
        visited = {central_kp_id}
        frontier = {central_kp_id}
        for _ in range(depth):
            if not frontier:
                break
            links = db.query(KnowledgeLink).filter(
                KnowledgeLink.source_kp_id.in_(frontier) | KnowledgeLink.target_kp_id.in_(frontier)
            ).all()
            new_ids = set()
            for link in links:
                new_ids.add(link.source_kp_id)
                new_ids.add(link.target_kp_id)
            frontier = new_ids - visited
            visited |= new_ids

        kps = db.query(KnowledgePoint).filter(
            KnowledgePoint.id.in_(visited),
            KnowledgePoint.user_id == user["id"],
        ).all()
    elif book_id:
        chunk_ids = [row[0] for row in db.query(DocumentChunk.id).filter(DocumentChunk.book_id == book_id).all()]
        cid_set = set(chunk_ids)
        all_kps = db.query(KnowledgePoint).filter(KnowledgePoint.user_id == user["id"]).all()
        kp_ids = set()
        for kp in all_kps:
            if set(_parse_json(kp.source_chunk_ids)) & cid_set:
                kp_ids.add(kp.id)
        kps = db.query(KnowledgePoint).filter(KnowledgePoint.id.in_(kp_ids)).all() if kp_ids else []
    else:
        kps = db.query(KnowledgePoint).filter(KnowledgePoint.user_id == user["id"]).all()

    kp_id_set = {kp.id for kp in kps}
    links = db.query(KnowledgeLink).filter(
        KnowledgeLink.source_kp_id.in_(kp_id_set) & KnowledgeLink.target_kp_id.in_(kp_id_set)
    ).all()

    nodes = []
    for kp in kps:
        link_count = sum(1 for l in links if l.source_kp_id == kp.id or l.target_kp_id == kp.id)
        nodes.append(GraphNode(id=kp.id, label=kp.label, entity_type=kp.entity_type, link_count=link_count))

    edges = [GraphEdge(id=l.id, source=l.source_kp_id, target=l.target_kp_id, relation_type=l.relation_type, weight=l.weight) for l in links]

    return GraphResponse(nodes=nodes, edges=edges)


@router.post("/links", response_model=KnowledgeLinkResponse)
def create_link(
    body: KnowledgeLinkCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    source = db.query(KnowledgePoint).filter(
        KnowledgePoint.id == body.source_kp_id,
        KnowledgePoint.user_id == user["id"],
    ).first()
    target = db.query(KnowledgePoint).filter(
        KnowledgePoint.id == body.target_kp_id,
        KnowledgePoint.user_id == user["id"],
    ).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Source or target knowledge point not found")

    existing = db.query(KnowledgeLink).filter(
        KnowledgeLink.source_kp_id == body.source_kp_id,
        KnowledgeLink.target_kp_id == body.target_kp_id,
        KnowledgeLink.relation_type == body.relation_type,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Link already exists between these points with this relation type")

    link = KnowledgeLink(
        source_kp_id=body.source_kp_id,
        target_kp_id=body.target_kp_id,
        relation_type=body.relation_type,
        weight=body.weight,
        evidence_chunk_ids=json.dumps(body.evidence_chunk_ids),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return KnowledgeLinkResponse(
        id=link.id,
        source_kp_id=link.source_kp_id,
        target_kp_id=link.target_kp_id,
        relation_type=link.relation_type,
        weight=link.weight,
        evidence_chunk_ids=_parse_json(link.evidence_chunk_ids),
        created_at=link.created_at,
    )


@router.delete("/links/{link_id}")
def delete_link(
    link_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    link = db.query(KnowledgeLink).filter(KnowledgeLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    source = db.query(KnowledgePoint).filter(
        KnowledgePoint.id == link.source_kp_id,
        KnowledgePoint.user_id == user["id"],
    ).first()
    if not source:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(link)
    db.commit()
    return {"ok": True}


@router.get("/stats", response_model=KnowledgeStatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    total_nodes = db.query(func.count(KnowledgePoint.id)).filter(
        KnowledgePoint.user_id == user["id"]
    ).scalar() or 0

    total_edges = db.query(func.count(KnowledgeLink.id)).join(
        KnowledgePoint, KnowledgeLink.source_kp_id == KnowledgePoint.id
    ).filter(KnowledgePoint.user_id == user["id"]).scalar() or 0

    max_possible = total_nodes * (total_nodes - 1) if total_nodes > 1 else 1
    density = round(total_edges / max_possible, 4)

    dist = {}
    for row in db.query(KnowledgePoint.entity_type, func.count(KnowledgePoint.id)).filter(
        KnowledgePoint.user_id == user["id"]
    ).group_by(KnowledgePoint.entity_type).all():
        dist[row[0]] = row[1]

    return KnowledgeStatsResponse(
        total_nodes=total_nodes,
        total_edges=total_edges,
        density=density,
        entity_type_distribution=dist,
    )
