# Week 1 Validation & Next Steps Guide

**Status:** All 8 Week 1 tasks implemented ✓  
**Ready for:** Testing and validation  
**Estimated validation time:** 30-60 minutes

---

## Quick Validation Checklist

### 1. Dependencies Installation (5 min)

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2. Backend Health Check (5 min)

```bash
cd backend
python run_dev.py
```

**Expected:**
- Server starts on http://localhost:8000
- No import errors for new modules:
  - `retrieval_service`
  - `reranker_service`
  - New `Citation` schema
- Swagger docs available at `/docs`

### 3. Frontend Build Check (5 min)

```bash
cd frontend
npm run build
npm run type-check
```

**Expected:**
- No TypeScript errors
- No build warnings
- Markdown rendering dependencies loaded

### 4. Live Testing (20-40 min)

#### Setup Test Book
```bash
# 1. Start both servers in separate terminals:
cd backend && python run_dev.py
cd frontend && npm run dev

# 2. Navigate to http://localhost:5173
# 3. Register/Login
# 4. Upload a test book (PDF or Markdown)
```

#### Test QA Flow

**Test Case 1: Normal Question (Should get citations)**
```
Question: "What is the main topic discussed in this book?"
Expected:
  ✓ Answer renders with markdown formatting
  ✓ Confidence indicator shows (green for high, amber for medium)
  ✓ Citations display below answer
  ✓ At least 1-3 citations shown
  ✓ Each citation has page number and quote
  ✓ "Go" button visible on each citation
```

**Test Case 2: Citation Navigation**
```
Action: Click "Go" button on first citation
Expected:
  ✓ Reader jumps to cited page
  ✓ Page number updates
  ✓ Reader UI stays responsive
  ✓ Can navigate back to AI panel
```

**Test Case 3: Weak Evidence (Should trigger insufficient_evidence)**
```
Question: "Ask something very specific that might not be in the book"
Expected:
  ✓ Amber confidence warning appears
  ✓ Answer says "I don't have enough relevant information..."
  ✓ Amber banner below answer: "Try refining your question..."
  ✓ No over-confident hallucinated answer
```

**Test Case 4: Markdown Answer Rendering**
```
Question: "List the key points about..."
Expected:
  ✓ Answer renders as formatted list (not plain text)
  ✓ Headings, code blocks, emphasis preserved
  ✓ No HTML injection or weird characters
```

### 5. Regression Testing (10-15 min)

```bash
cd backend

# First, get an auth token for your test user:
# - Login on frontend, copy token from localStorage
# - Or create test user directly

# Run evaluation:
python scripts/week1_eval.py \
  --book-id 1 \
  --token YOUR_TOKEN_HERE \
  --api-url http://localhost:8000 \
  --detailed

# Expected output:
# - >= 90% of answers include citations
# - >= 70% of answers meet confidence threshold
# - 0 hallucinations
# - All test cases complete successfully
```

---

## What to Look For (Quality Indicators)

### Good Signs ✓
- [ ] Confidence scores vary (not all 0.5)
- [ ] Citations contain relevant text, not random
- [ ] Page numbers are correct
- [ ] Markdown formatting (lists, code) appears correct
- [ ] Slow questions sometimes return insufficient_evidence (guardrail working)
- [ ] Fast questions have high confidence (confidence calibration working)

### Red Flags ⚠️
- [ ] All confidence scores are exactly 0.5 (scoring broken)
- [ ] Citations are completely irrelevant (retrieval broken)
- [ ] No markdown formatting in answers (markdown rendering issue)
- [ ] Citations missing page numbers (chunk metadata issue)
- [ ] Console errors when clicking citations (jump-to-page broken)
- [ ] Hallucinated confident answers on weak questions (guardrail broken)

---

## Known Limitations & Assumptions

### Current Implementation
- BM25 weights tuned for general English text (may need tweaking for technical docs)
- Cross-encoder model is lightweight (fast but slightly less accurate than larger models)
- Confidence score is average of top-3, may not be perfect calibration
- Citation quotes limited to 200 chars (may truncate important context)

### Testing Scope
- Tested with synthetic architecture, not real books yet
- Regression dataset is template, customize with your book content
- Performance not yet benchmarked (first production data will show real latency)

### Future Improvements
- Tune BM25/vector weights based on evaluation results
- Add field-specific reranking (title search vs content search)
- Implement confidence calibration using held-out validation set
- Add A/B testing framework for retrieval variants

---

## Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'rank_bm25'"
**Solution:**
```bash
pip install rank-bm25==0.2.2
```

### Issue: "ModuleNotFoundError: No module named 'sentence_transformers'"
**Solution:**
```bash
pip install sentence-transformers==3.4.1
```

### Issue: Frontend markdown not rendering
**Solution:**
```bash
cd frontend
npm install react-markdown remark-gfm rehype-sanitize
```

### Issue: "Citations don't jump to page"
**Solution:**
1. Check browser console for errors
2. Verify book is PDF format (Markdown support separate)
3. Check that `onJumpToPage` callback reaches Reader
4. Try with page 1 (known page) first

### Issue: All answers have insufficient_evidence flag
**Solution:**
1. Check that book is properly indexed (POST /api/books/{id}/index)
2. Verify embeddings were generated (check database)
3. Try a very simple question first ("What is...?")
4. Check BM25 index is built (should have many BM25 matches)

### Issue: Evaluation script fails to connect
**Solution:**
1. Verify backend is running: `curl http://localhost:8000/health`
2. Check token is valid: Login and copy from localStorage
3. Check book_id exists and is owned by user
4. Run with verbose mode: Add `--detailed` flag

---

## Next Steps for Development

### Immediate (If Validation Passes)
1. ✓ Merge Week 1 code
2. ✓ Create production deployment
3. ✓ Monitor real user feedback on confidence/citations

### Short Term (Week 2)
1. Start Week 2: Ingestion & Markdown support
2. Tune BM25/vector weights based on real evaluation data
3. Create larger regression dataset with real books
4. Add performance benchmarking

### Medium Term (Week 3-4)
1. Add note-taking and flashcard creation
2. Build learning workflow UI
3. Implement personalization signals

---

## Performance Expectations

**Current Estimated Latencies (per query):**
- Embedding: ~100-200ms
- Hybrid retrieval: ~50-100ms
- Reranking: ~200-400ms
- LLM inference: ~2000-4000ms
- **Total: ~2.5-4.5 seconds**

**Memory Footprint:**
- BM25 index: ~0.5-1x chunk data size
- Cross-encoder model: ~200MB (cached)
- Sentence-transformer embeddings: ~100MB (cached)
- Per-book indexes: ~10-50MB depending on size

---

## Support & Debugging

### Getting More Logging
```python
# In backend/app/routers/ai.py or services:
import logging
logger = logging.getLogger(__name__)
logger.info(f"Hybrid retrieval returned {len(top_hits)} candidates")
logger.debug(f"Confidence score: {confidence}")
```

### Checking Database State
```python
# Backend shell
from app.database import SessionLocal
from app.models import DocumentChunk

db = SessionLocal()
chunks = db.query(DocumentChunk).filter_by(book_id=1).all()
print(f"Total chunks: {len(chunks)}")
print(f"Chunks with embeddings: {sum(1 for c in chunks if c.embedding)}")
```

### Browser Developer Tools
- **Console:** Check for JavaScript errors on citation interaction
- **Network:** Check API response times and payload sizes
- **Storage:** Verify token is stored (localStorage)

---

## Success Criteria for Week 1 → Week 2 Transition

✓ All the following must pass:

- [ ] Backend API returns new citation response format
- [ ] Frontend renders citations with confidence indicators
- [ ] Citation click navigates to page in Reader
- [ ] Weak evidence triggers safe message (insufficient_evidence)
- [ ] Regression test passes (>= 90% citation coverage, < 5% hallucination)
- [ ] No console errors or TypeScript warnings
- [ ] Code is documented and linted

**If all ✓:** Ready to start Week 2  
**If any ✗:** Document issues in GitHub Issues and adjust implementation

---

## Questions & Feedback

During validation, note any of:
- Unexpected behavior
- UI/UX improvements needed
- Performance concerns
- Missing features
- Documentation gaps

These will inform Week 2 planning and prioritization.

---

**Ready to validate? Start with step 1 above!**
