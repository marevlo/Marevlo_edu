"""
MIRA document endpoints — upload a PDF, list, delete. Q&A over the document
happens through the existing /mira/chat with `document_id` (one chat path,
one quota path, one safety gate — no parallel answer pipeline).

Rate-limited like /mira/chat: upload triggers an embedding batch (a paid
call when EMBED_BACKEND != local), so it gets its own, tighter limit.
"""
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.rate_limiting import limiter
from app.mira.services import document_service as docs
from app.mira.services.entitlement_bridge import resolve_access

router = APIRouter(prefix="/mira/documents", tags=["mira-documents"])

_UPLOAD_LIMIT = getattr(get_settings(), "MIRA_DOC_UPLOAD_RATE_LIMIT", "10/hour")


@router.post("")
@limiter.limit(_UPLOAD_LIMIT)
async def upload_document(request: Request, file: UploadFile = File(...),
                          user: User = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    name = (file.filename or "").strip()
    if not name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400,
                            detail="Only PDF files are supported right now. "
                                   "Image and data-file support is coming.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    access = resolve_access(db, user.id)
    try:
        doc = docs.ingest_pdf(db, user_id=user.id, plan=access.plan,
                              filename=name, data=data)
    except docs.DocError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    return {"id": doc.id, "filename": doc.filename, "title": doc.title,
            "n_pages": doc.n_pages, "n_chunks": doc.n_chunks,
            "status": doc.status}


@router.get("")
def list_documents(user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    return {"documents": docs.list_documents(db, user.id),
            "limit": docs.doc_limit_for_plan(resolve_access(db, user.id).plan)}


@router.delete("/{doc_id}")
def delete_document(doc_id: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    try:
        docs.delete_document(db, user.id, doc_id)
    except docs.DocError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    return {"deleted": doc_id}
