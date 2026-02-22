# SmartSquat Analyzer — Product Analysis & System Design Interview Guide

---

## PART 1: PRODUCT IMPROVEMENTS

### Critical Bugs

#### 1. Variable Reference Error in Error Handler (`App.jsx:485-491`)
The `.catch()` handler references `err` instead of `error` in multiple places:
```js
} else if (errorMessage.includes("parse") || err instanceof SyntaxError) {
```
`err` is undefined — this will throw a `ReferenceError` at runtime, meaning **any parse error silently crashes the error handler** and the user sees a generic message instead of the helpful one.

**Fix:** Replace all `err` references with `error` in the catch block.

#### 2. `setIsLoading` Doesn't Exist (`App.jsx:458`)
The catch block calls `setIsLoading(false)` but the state setter is named `setLoading`. This throws a `ReferenceError` every time a fetch fails, meaning **error recovery is broken**.

#### 3. `goto_processing` Flag Set After It's Checked (`app.py:858 vs 871`)
The `goto_processing = True` line inside the image fallback (line 858) is set, then immediately overwritten to `False` on line 871. The image fallback path can never actually execute. This means corrupted videos that could be read as images silently fail.

#### 4. Unbounded Session State Memory Leak (`app.py:132-136`)
`previous_states`, `squat_timings`, `squat_counts`, and `session_start_times` are global dicts keyed by session ID. They are **never cleaned up**. Every request creates a new session entry. On a long-running server, this is an unbounded memory leak.

**Fix:** Add TTL-based cleanup or use an LRU cache with a max size.

#### 5. MoveNet Keypoint Index Mapping Is Wrong (`movenet_validator.py:40-45`)
The `_MP_ORDER` array maps MoveNet's 17 keypoints to MediaPipe indices, but the comment says "shoulders L,R – elbows L,R" while the actual MediaPipe mapping is:
- Index 5 = left shoulder, 6 = right shoulder, 7 = left elbow, 8 = right elbow

The mapping `[5, 7, 6, 8]` swaps right shoulder with left elbow. The cross-validation comparison at `app.py:366` (`mp_kp[5:, :2] - mv_kp[5:, :2]`) is comparing misaligned joints, making the 20px divergence threshold nearly meaningless.

#### 6. Command Injection via `os.system()` (`app.py:1059`)
```python
ffmpeg_cmd = f"ffmpeg -i {temp_path} -r {target_fps} -q:v 1 {tmpdirname}/frame_%04d.jpg"
os.system(ffmpeg_cmd)
```
`temp_path` is derived from the uploaded filename. While `uuid` is used for the temp name, this is still a shell injection vector if the pattern changes. Should use `subprocess.run()` with a list argument like the other ffmpeg calls.

---

### Reliability Issues

#### 7. No Request Concurrency Protection
The global `pose_landmarker_global` MediaPipe instance is shared across all requests with no mutex/lock. If two videos are uploaded simultaneously, both requests call `.detect()` on the same model instance concurrently. MediaPipe's pose landmarker is **not thread-safe** — this causes silent data corruption or crashes.

**Fix:** Use a threading lock around `pose_landmarker_global.detect()`, or use a request-scoped landmarker.

#### 8. `depth_ratio` Uses Uninitialized Variables (`app.py:1262`)
```python
if knee_angle is not None and hip is not None and ankle is not None and knee is not None:
    depth_ratio = calculate_depth_ratio(hip, knee, ankle)
```
`hip`, `knee`, and `ankle` are only defined inside the `if` block for the *right* side (line 1249). If only the *left* side is visible, `knee_angle` is set from `left_knee_angle` but `hip`/`knee`/`ankle` still reference the right-side variables which may be unbound, causing a `NameError`.

#### 9. Pelvic Tilt Score Measures Absolute Angle, Not Delta (`app.py:1549-1556`)
The `calc_pelvic_tilt_score()` function is documented as measuring the **change** from neutral (standing) position, but the code passes the raw absolute angle: `calc_pelvic_tilt_score(abs(pelvic_angle))`. Since pelvic angle is typically 5-15° even when standing perfectly, this means nearly everyone gets penalized for "butt wink" they don't have.

**Fix:** Track the standing-frame pelvic angle as a baseline, then pass the delta.

#### 10. `LocalAnalysis.js` Returns Fake Data — No Actual Analysis
The "local analysis fallback" generates completely synthetic sinusoidal data. It does not use the TensorFlow.js pose detector that's already loaded on the frontend. This means when the server is down, users get fabricated scores that have no relation to their actual squat. This is misleading.

**Fix:** Actually run the client-side pose detector over extracted video frames, or clearly label results as "demo mode" rather than presenting them as real analysis.

#### 11. CORS Proxy to Third-Party Service (`ServerWarmup.js:173`)
```js
const corsProxyUrl = 'https://cors-anywhere.herokuapp.com/';
```
This is a public demo proxy that rate-limits aggressively and requires manual opt-in. It will fail for production users. It also sends your backend URL to a third party.

#### 12. Frame Extraction Redundancy
The `analyze_video()` function contains ~400 lines of frame extraction with 4 fallback methods, plus a duplicate of `validate_video_metadata()` logic inline (lines 873-928 duplicate lines 391-451). The inline version has different clamping behavior (`max(10, min(frame_count, 1500))`) vs. the extracted function. This means the same video could get different frame counts depending on which code path runs.

---

### Accuracy Issues

#### 13. Shoulder-Midfoot Alignment Uses Ankle, Not Midfoot (`app.py:268-270`)
Despite the function name `calculate_shoulder_midfoot_diff`, it only uses the ankle x-coordinate as "midfoot." True midfoot is between the heel and toe landmarks (indices 29-32), which MediaPipe already provides. This gives incorrect forward lean readings, especially for people with large feet.

#### 14. 2D Angle Calculation on 3D Movement
All angle calculations use only X,Y coordinates, ignoring the Z (depth) axis that MediaPipe provides. For a squat filmed from a 45° angle rather than perfectly from the side, knee angles will be systematically overestimated (appear straighter than they are) because the depth component is lost. A 90° squat viewed at 45° appears as ~120° in 2D.

**Impact:** Users filming from imperfect angles get artificially low depth scores.

#### 15. Depth Ratio Formula Is Misleading (`app.py:246`)
```python
depth_ratio = knee_y / hip_to_ankle
```
This isn't really a "depth ratio" — it's the knee's relative Y position between hip and ankle. The name and the 0-100 scaling suggest a percentage, but the formula doesn't normalize correctly. For example, if `knee_y = 0.7`, `hip_y = 0.5`, `ankle_y = 0.9`, then `depth_ratio = 0.7 / 0.4 = 1.75 * 100 = 175`. The value can exceed 100, which is confusing.

#### 16. Asymmetric Score Behavior
- Knee depth takes the **best** (deepest) angle — score can only go up
- Shoulder alignment takes the **worst** lean — score can only go down
- Hip flexion takes the **best** score — can only go up
- Pelvic tilt takes the **worst** score — can only go down

This mixed "sticky best / sticky worst" approach means the overall score doesn't represent any single moment in time. A user who wobbles badly at the top but hits good depth gets both the high depth score AND the low shoulder score, potentially underrepresenting their actual form.

#### 17. Hip-Below-Knee Detection Uses Raw Y Coordinates (`app.py:1481-1486`)
```python
hip_below_knee = hip_below_knee or (lm[24]['y'] > lm[26]['y'])
```
MediaPipe returns normalized coordinates where Y increases downward. This is correct for standard orientation, but for portrait videos that were rotated (line 462), the coordinate system may be altered. The rotation doesn't update the landmark coordinate frame.

#### 18. No Knee Valgus Detection
The system measures knee depth and forward lean but completely misses **knee valgus** (knees caving inward) — one of the most common and dangerous squat form errors. MediaPipe provides left/right knee X coordinates and left/right ankle X coordinates, which is sufficient to detect this.

---

### Performance & Scalability Issues

#### 19. Every Frame Processed — No Adaptive Sampling
`frame_skip = 1` means a 10-second 30fps video processes all 300 frames through MediaPipe. On a free-tier Render server, this takes 2+ minutes and risks timeout. Adaptive sampling (e.g., process every 3rd frame for the first pass, then fill in around the deepest squat point) would cut processing time by 60-70% with minimal accuracy loss.

#### 20. GC Every 4 Frames Is Too Aggressive
`gc.collect()` is called every 4 frames (line 1344-1347). Python's GC with `gc.collect()` is a full mark-and-sweep that pauses execution. For 300 frames, that's 75 forced GC cycles. The memory diagnostic logging on every cycle adds further overhead.

#### 21. Frontend Bundle Includes Full TensorFlow.js
`@tensorflow/tfjs` + `@tensorflow-models/pose-detection` + WebGL backend adds ~3-5MB to the JavaScript bundle. The frontend TensorFlow is only used for live preview skeleton overlay during recording. Consider lazy-loading it or using a lighter model.

#### 22. No Response Compression
The `/analyze` endpoint returns full landmark data (33 points × N frames) as uncompressed JSON. For a 300-frame video, that's ~1-2MB of JSON. Enabling gzip compression on Flask (via `flask-compress`) would reduce this by ~80%.

---

### UX / Product Issues

#### 23. No Multi-Rep Detection
The code has `squat_phases` tracking but forces the entire video into a single phase: `squat_phases = [{"start": 0, "end": max(0, len(frames_to_process) - 1)}]`. Users who do multiple reps get a single blended score rather than per-rep feedback.

#### 24. Scores Persist After Reset
`handleBackToRecord()` resets `analysisData` but doesn't call `/reset-session` on the backend. Session state from a previous recording leaks into new ones if the same session ID is reused.

#### 25. No Confidence Indicator
The analysis returns scores but never tells the user **how confident** the system is. If landmark visibility is consistently below 0.5 across frames, the scores are unreliable. Users should see a "confidence: low/medium/high" indicator.

---

### Summary: Top 5 Most Impactful Fixes

| Priority | Issue | Impact |
|----------|-------|--------|
| 1 | Variable reference bugs in error handler (#1, #2) | Crashes error recovery for every failed request |
| 2 | Thread safety on pose model (#7) | Data corruption under any concurrent load |
| 3 | MoveNet keypoint mapping wrong (#5) | Cross-validation is comparing wrong joints |
| 4 | Pelvic tilt uses absolute angle not delta (#9) | Everyone gets false "butt wink" penalty |
| 5 | LocalAnalysis returns fake data (#10) | Users see fabricated scores when server is down |

---

## PART 2: SYSTEM DESIGN INTERVIEW GUIDE

### The 30-Second Elevator Pitch

> "SmartSquat is a real-time AI exercise form analyzer. A user records a squat on their phone, we run it through two pose estimation models on the backend, calculate biomechanical angles at every frame, and return a scored breakdown of their form — all within about a minute of processing."

---

### Architecture Overview (The "Restaurant" Analogy)

Think of the system like a restaurant:

```
┌─────────────────────────────────────────┐
│  FRONTEND (The Dining Room)              │
│  React app — takes the order (video),    │
│  shows the meal (results + overlay)      │
└───────────────┬─────────────────────────┘
                │  HTTP POST (the waiter carries the order)
                ▼
┌─────────────────────────────────────────┐
│  BACKEND (The Kitchen)                   │
│  Flask server — preps the ingredients    │
│  (frame extraction), cooks (pose AI),    │
│  plates it (scoring), sends it back      │
└─────────────────────────────────────────┘
```

**The Dining Room (Frontend)** handles three things:
1. **Taking the order** — Records video via WebRTC
2. **Live preview** — Shows a skeleton overlay using client-side TF.js (like the open kitchen where you watch the chef)
3. **Presenting the meal** — Plays back video with scored overlays

**The Kitchen (Backend)** handles the heavy lifting:
1. **Prep** — Saves and validates the video, extracts frames
2. **Cook** — Runs each frame through MediaPipe + MoveNet
3. **Plate** — Calculates angles, scores, and assembles the JSON response

---

### Key Decision Points & Rationale

#### Decision 1: Where Does the AI Run?

**Options I had:**
| Option | Pros | Cons |
|--------|------|------|
| A. All client-side (browser) | No server cost, instant | TF.js is slow, can't use MediaPipe heavy model, phone batteries drain |
| B. All server-side | Full model power, consistent results | Requires server, upload latency, cost |
| C. **Hybrid** (chosen) | Live preview on client, heavy analysis on server | More complex, two codepaths |

**Why hybrid:** Think of it like spell-check vs. Grammarly. The browser does quick spell-check (live skeleton preview with TF.js) so the user gets immediate visual feedback. But for the deep grammar analysis (biomechanical scoring), we send it to the server where we can run the heavy model.

**Interview soundbite:** *"We chose a hybrid approach — lightweight client-side inference for real-time feedback, heavy server-side analysis for accuracy. It's like having autocomplete in your IDE (fast, approximate) vs. running the full CI pipeline (thorough, but takes time)."*

---

#### Decision 2: Why Two AI Models?

**The approach:** Primary analysis uses **MediaPipe Pose Landmarker** (Google). Cross-validation uses **MoveNet Thunder** (ONNX).

**Analogy:** This is like having two independent reviewers grade an exam. If Reviewer A says the answer is "90° knee angle" and Reviewer B says "145°", something is wrong — maybe the camera angle is bad or a limb is occluded. We flag this (20px divergence threshold) rather than silently returning garbage data.

**Options I had:**
| Option | Pros | Cons |
|--------|------|------|
| Single model | Simpler, faster | No way to detect bad readings |
| **Two models** (chosen) | Catch outliers, higher confidence | 2x compute cost, alignment complexity |
| Ensemble (average) | Most accurate | Slowest, models use different skeletons |

**Why not ensemble:** MediaPipe gives 33 keypoints, MoveNet gives 17. They use different coordinate systems. Averaging them would require complex mapping. Instead, we use MoveNet purely as a sanity check — it's the "second pair of eyes."

**Interview soundbite:** *"Cross-validation is our reliability mechanism. If two independent models disagree significantly, we know the reading is unreliable — similar to how distributed systems use quorum-based consensus."*

---

#### Decision 3: What Biomechanics to Measure?

**The four pillars of squat scoring:**

| Metric | What It Measures | Weight | Analogy |
|--------|-----------------|--------|---------|
| **Knee Depth** | How deep the squat goes (knee angle) | 40% | Like measuring how far you dip in a pushup |
| **Shoulder Alignment** | Forward lean (shoulder vs. midfoot) | 30% | Like checking if a building leans (plumb line) |
| **Hip Flexion** | Hip hinge angle (90°-120° ideal) | 20% | Like checking a door hinge opens to the right angle |
| **Pelvic Tilt** | "Butt wink" — pelvis tucking under | 10% | Like checking if the foundation of a building shifts |

**Why these weights:** Depth is king in squatting — it's the primary movement objective (40%). Shoulder alignment indicates injury risk from forward lean (30%). Hip flexion and pelvic tilt are secondary form indicators that experienced coaches look for.

**Interview soundbite:** *"The scoring system is a weighted composite — think of it like a credit score. Depth is your payment history (most important), shoulder alignment is credit utilization (injury risk), and the others are length of credit history and credit mix."*

---

#### Decision 4: How to Handle Video Processing?

**The challenge:** Users upload videos from every device imaginable — iPhone WebM, Android MP4, desktop AVI. Each has different codecs, frame rates (variable vs. constant), and metadata quality.

**The solution — Fallback Chain (like a DNS resolver):**

```
Step 1: Try FFmpeg transcoding (normalize to constant-FPS MP4)
        ↓ if fails
Step 2: Try OpenCV keyframe extraction
        ↓ if < 60 frames
Step 3: Try sequential frame reading
        ↓ if < 20 frames
Step 4: Try FFmpeg direct frame export
        ↓ if < 10 frames
Step 5: Try imageio library
        ↓ if still failing
Step 6: Coverage check — if < 80%, do brute-force sequential read
```

**Analogy:** This is like how your GPS works. First it tries GPS satellites. If that fails, it falls back to cell tower triangulation. If that fails, it uses Wi-Fi positioning. Each method is less accurate but more likely to work. The system always gets *something*.

**Interview soundbite:** *"Video ingestion uses a degradation chain — we try the highest-fidelity extraction method first and progressively fall back to simpler methods. It's the same pattern as circuit breakers in microservices: graceful degradation over hard failure."*

---

#### Decision 5: Frame-by-Frame vs. Sampled Processing?

**Current approach:** Process every single frame (`frame_skip = 1`).

**Tradeoffs:**

| Approach | Accuracy | Speed | Memory |
|----------|----------|-------|--------|
| Every frame | Highest — never miss the deepest point | Slow (300 frames = 2 min) | High |
| Every 3rd frame | ~95% — might miss exact bottom by 0.1s | 3x faster | 3x less |
| Adaptive (smart) | ~98% — dense around movement, sparse when standing | 2x faster | Variable |

**Why every frame was chosen:** For a form analysis tool, missing the bottom of the squat by even a few frames can mean the difference between "parallel" and "above parallel" — which is a meaningful distinction for users. The tradeoff is processing time.

**What I'd change:** Adaptive sampling. Detect the descent phase (knee angle decreasing), increase density. During standing phases, sample sparsely. This is like how video compression works — more data during high-motion scenes, less during static ones (I-frames vs. P-frames analogy).

---

#### Decision 6: Scoring Architecture — Progressive vs. Final

**The approach:** Scores are calculated **progressively** as frames are processed, using a "sticky" mechanism:
- Depth score can only go UP (tracks best depth achieved)
- Shoulder score can only go DOWN (tracks worst lean)

**Analogy:** Think of it like a track meet. Your depth score is your personal best high jump — once you clear a height, that's your score even if you miss on later attempts. Your shoulder score is like deductions in gymnastics — the worst wobble counts against you.

**Why progressive:** Users watching the playback see their scores update in real-time, which is more engaging than a single final number. It also means the score at any frame represents "the story so far."

**Interview soundbite:** *"We use a progressive scoring model with monotonic constraints — depth is a high-water mark (can only improve), alignment is a low-water mark (tracks worst deviation). This gives users real-time feedback during playback while ensuring scores converge to meaningful final values."*

---

#### Decision 7: Deployment & Cold-Start Handling

**The challenge:** Deployed on Render.com free tier, which spins down after 15 minutes of inactivity. Cold starts take 30-60 seconds (loading ML models into memory).

**The solution — The "Keep-Alive" Pattern:**
```
Frontend loads → Starts warmup pings (every 3s to Render)
                 ↓
Server wakes up → Loads MediaPipe model → Loads MoveNet model
                 ↓
Ping succeeds → UI shows "Server Ready"
                 ↓
Ongoing: Ping every 10 minutes to prevent spin-down
```

**Analogy:** It's like keeping a car engine warm in winter. You periodically start it so it doesn't freeze. The aggressive 3-second pings during startup are like repeatedly turning the key until the engine catches.

**Fallback:** After 3 consecutive failed pings, the frontend switches to "local analysis mode" — though as noted in Part 1, this currently returns fake data rather than running actual client-side inference.

---

### How to Talk About This in an Interview

#### Framework: "Challenge → Options → Decision → Result"

**Example answer for "Walk me through the system architecture":**

> "The core challenge was: how do you analyze human movement from a phone video accurately, in under 2 minutes, on a budget?
>
> The system has three layers. The **frontend** handles video capture using WebRTC and provides live pose preview using TensorFlow.js in the browser — this gives instant visual feedback. The **backend** does the heavy analysis: it extracts frames, runs them through MediaPipe's pose landmarker, and cross-validates with a second model (MoveNet). Then a **scoring engine** calculates four biomechanical metrics and produces a weighted composite score.
>
> The key architectural decisions were:
> 1. **Hybrid inference** — client-side for preview, server-side for accuracy
> 2. **Dual-model validation** — catch unreliable readings before they become bad scores
> 3. **Progressive scoring** — scores update frame-by-frame during playback
> 4. **Graceful degradation** — fallback chains for video processing and server availability
>
> If I were scaling this, I'd add adaptive frame sampling to cut processing time by 60%, move to a queue-based architecture for concurrent requests, and add a proper confidence metric so users know when to re-record."

#### For "What Would You Do Differently?"

> "Three things:
> 1. **Adaptive sampling** instead of processing every frame — like how video codecs allocate more bits to high-motion scenes
> 2. **Request queuing** with a worker pool instead of synchronous processing — the current architecture blocks on each request
> 3. **3D angle calculation** using the Z-axis from MediaPipe — we're currently projecting a 3D movement to 2D, which introduces systematic error depending on camera angle"

#### For "How Does This Scale?"

> "Currently it doesn't — it's a single-server, single-threaded model. To scale:
> - **Horizontal:** Put the analysis behind a task queue (Celery + Redis). Each request becomes a job. Workers pull from the queue. This decouples upload latency from processing time.
> - **Vertical:** Swap CPU MediaPipe for GPU inference using the ONNX Runtime GPU provider we already have for MoveNet.
> - **Caching:** If the same video is re-analyzed, cache the frame extraction step.
> - **CDN:** Serve the 3-5MB TF.js bundle from a CDN with proper cache headers."

---

### Quick-Reference Cheat Sheet

| Component | Technology | Why This Choice |
|-----------|-----------|-----------------|
| Frontend framework | React 19 + Vite | Fast HMR, modern JSX, large ecosystem |
| Styling | Styled Components | Co-located styles, dynamic theming (dark mode) |
| Video capture | WebRTC + MediaRecorder | Native browser API, no plugins needed |
| Client-side AI | TensorFlow.js + MoveNet | Runs in browser for live preview |
| Backend framework | Flask | Lightweight, quick to prototype, good for ML |
| Primary pose model | MediaPipe Pose Landmarker | 33 keypoints, high accuracy, Google-maintained |
| Validation model | MoveNet Thunder (ONNX) | Fast, 17 keypoints, different architecture = independent check |
| Video processing | OpenCV + FFmpeg | Industry standard, handles every codec |
| Deployment | Render.com | Free tier, easy deployment, SSL included |
| State management | React useState/useEffect | Simple, no Redux overhead for this app size |

---

### Memory Aids

1. **"Two Chefs, One Kitchen"** — MediaPipe is the head chef, MoveNet is the sous chef who double-checks the plates
2. **"GPS Fallback"** — Video extraction tries satellite → cell tower → Wi-Fi → dead reckoning
3. **"Track Meet Scoring"** — Depth = personal best (only goes up), Alignment = gymnastics deductions (worst counts)
4. **"Spell Check vs. Grammarly"** — Client-side = fast preview, Server-side = deep analysis
5. **"Keep the Engine Warm"** — Ping service prevents cold starts on free-tier hosting
6. **"Credit Score"** — Overall score is a weighted composite where different factors have different importance
