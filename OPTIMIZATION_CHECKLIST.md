# Squat Analyzer - Optimization Checklist

Quick reference for implementing performance improvements.

## ✅ Week 1: Critical Issues

### Day 1-2: Frontend Bundle Size (Priority 1)

- [ ] **Remove TensorFlow.js dependencies** (4 hours)
  - [ ] Remove `@tensorflow/tfjs` from package.json
  - [ ] Remove `@tensorflow-models/pose-detection` from package.json
  - [ ] Delete `src/utils/LocalAnalysis.js`
  - [ ] Remove TensorFlow imports from `VideoCapture.jsx`
  - [ ] Update `vite.config.js` - remove tensorflow chunks
  - [ ] Test build: `npm run build`
  - [ ] Verify bundle size reduced from 2.2MB → ~0.8MB

### Day 2-3: Monitoring Setup (Priority 2)

- [ ] **Add Sentry error tracking** (1 hour)
  ```bash
  pip install sentry-sdk
  npm install @sentry/react
  ```
  - [ ] Backend: Add Sentry to `app.py`
  - [ ] Frontend: Add Sentry to `main.jsx`
  - [ ] Deploy and verify errors are tracked

- [ ] **Add Prometheus metrics** (1 hour)
  ```bash
  pip install prometheus-flask-exporter
  ```
  - [ ] Add metrics endpoint
  - [ ] Track video processing duration
  - [ ] Track memory usage
  - [ ] Set up Grafana dashboard

### Day 3-5: Refactor Backend (Priority 3)

- [ ] **Break up app.py** (8 hours)
  - [ ] Create `routes/` directory
    - [ ] `analysis.py` - /analyze endpoint
    - [ ] `health.py` - /ping endpoint
    - [ ] `session.py` - session management
  - [ ] Create `services/` directory
    - [ ] `pose_detection.py` - MediaPipe logic
    - [ ] `video_processor.py` - frame extraction
    - [ ] `score_calculator.py` - scoring logic
  - [ ] Create `utils/` directory
    - [ ] `angle_calculations.py`
    - [ ] `coordinate_transforms.py`
  - [ ] Update imports and test each module
  - [ ] Verify all routes still work

---

## ✅ Week 2: High Priority Optimizations

### Day 6-8: Async Video Processing (Priority 4)

- [ ] **Set up Redis** (2 hours)
  ```bash
  # On Render.com:
  # Add Redis service in dashboard
  pip install redis
  ```
  - [ ] Create `redis_client.py` connection module
  - [ ] Update session management to use Redis
  - [ ] Test session persistence

- [ ] **Implement Celery** (10 hours)
  ```bash
  pip install celery
  ```
  - [ ] Create `tasks.py` with video processing task
  - [ ] Update `/analyze` to return task ID immediately
  - [ ] Create `/status/<task_id>` endpoint
  - [ ] Update frontend to poll for results
  - [ ] Add Celery worker to Procfile
  - [ ] Test end-to-end async flow

### Day 9-10: Memory Optimization (Priority 5)

- [ ] **Streaming video processing** (6 hours)
  - [ ] Refactor frame extraction to yield frames
  - [ ] Process frames in chunks of 10
  - [ ] Delete frames from memory after processing
  - [ ] Test memory usage with large videos

- [ ] **Session cleanup** (2 hours)
  - [ ] Add background task to clean old sessions
  - [ ] Set TTL on Redis keys (1 hour expiry)
  - [ ] Test cleanup runs correctly

---

## ✅ Week 3: Medium Priority Improvements

### Day 11-12: Frontend Rendering

- [ ] **Optimize canvas rendering** (4 hours)
  - [ ] Add throttle to 30fps in `ExercisePlayback.jsx`
  - [ ] Use `requestVideoFrameCallback` when available
  - [ ] Add React.memo to components
  - [ ] Profile with React DevTools

### Day 13: Response Optimization

- [ ] **Add compression** (1 hour)
  ```bash
  pip install flask-compress
  ```
  - [ ] Enable gzip compression on API responses
  - [ ] Test response sizes reduced

- [ ] **Reduce payload size** (2 hours)
  - [ ] Only send essential landmark points
  - [ ] Remove duplicate score calculations
  - [ ] Test frontend still renders correctly

### Day 14-15: Infrastructure

- [ ] **CDN setup** (4 hours)
  - [ ] Sign up for Cloudflare free tier
  - [ ] Upload models to R2/S3
  - [ ] Update model loading URLs
  - [ ] Test model downloads faster

- [ ] **Optimize Docker** (3 hours)
  - [ ] Create multi-stage Dockerfile
  - [ ] Use `opencv-python-headless`
  - [ ] Pre-download models in build
  - [ ] Measure image size reduction

---

## Testing Checkpoints

### After Each Major Change:

```bash
# Backend tests
pytest tests/

# Load test
k6 run --vus 5 --duration 30s load-test.js

# Frontend tests
npm run test
npm run build  # Check bundle size

# Memory profile
python -m memory_profiler backend/app.py
```

### Final Validation:

- [ ] Lighthouse score > 90
- [ ] Bundle size < 1MB
- [ ] API response time < 2s for 10s video
- [ ] Memory usage < 300MB per worker
- [ ] No memory leaks after 100 requests

---

## Quick Reference: File Sizes

### Before Optimization:
- `app.py`: 84KB (1,755 lines)
- Frontend bundle: 2.2MB
- Docker image: 1.2GB
- API response (typical): 600KB

### Target After Optimization:
- `app.py`: < 10KB (split into modules)
- Frontend bundle: < 800KB (60% reduction)
- Docker image: < 500MB (58% reduction)
- API response: < 200KB (67% reduction)

---

## Monitoring Metrics to Track

### Backend:
- `/analyze` endpoint latency (p50, p95, p99)
- Memory usage per request
- Frames processed per second
- Error rate
- Active sessions

### Frontend:
- First Contentful Paint (FCP) - Target: < 1.5s
- Largest Contentful Paint (LCP) - Target: < 2.5s
- Time to Interactive (TTI) - Target: < 3.5s
- Bundle load time - Target: < 2s on 3G

---

## Cost Savings Estimate

### Current (Estimated):
- Render.com: $25/month (starter plan)
- Bandwidth: ~$10/month
- **Total: $35/month**

### After Optimization:
- Render.com: $7/month (free tier might be sufficient)
- Bandwidth: ~$3/month (70% reduction)
- **Total: $10/month**
- **Savings: $25/month (71%)**

Plus ability to handle 5-10x more users on same plan.

---

## Emergency Quick Wins (If Short on Time)

### 1-Hour Sprint:
1. Add response compression (15 min)
2. Reduce bundle size by removing TensorFlow (30 min)
3. Add basic Sentry tracking (15 min)

### 4-Hour Sprint:
1. Above +
2. Refactor scoring to use NumPy (2 hours)
3. Optimize canvas rendering throttle (1.5 hours)

### 1-Day Sprint:
1. Above +
2. Break up app.py into 3 main modules (4 hours)
3. Set up CDN for models (2 hours)
4. Add memory cleanup for sessions (1 hour)

---

**Last Updated:** 2025-10-26
**Status:** Ready to implement
**Estimated Total Time:** 3 weeks (120 hours)
**Expected Performance Gain:** 3-5x improvement
