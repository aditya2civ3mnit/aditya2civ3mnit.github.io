# SMC Trade Journal Platform - Feature Overview

## One-Line Pitch
A complete pre-trade to post-trade execution journal for discretionary traders, with setup-driven checklists, media proof, replay, and analytics in one workflow.

## Product Positioning
This platform is built for traders who want consistency, accountability, and measurable improvement.

Instead of generic note-taking, it enforces a structured process:
- Plan with your own setup logic
- Execute with checklist discipline
- Capture evidence with chart media
- Review outcomes with replay and monthly analytics

## Core Value
- Turns subjective trading into a repeatable process
- Reduces impulsive execution with rule-based checklist gates
- Builds a visual trade archive for coaching and self-review
- Connects execution quality to P/L outcomes over time

## Feature Highlights

### 1. Secure User Authentication
- User registration and login
- JWT-based access and refresh token flow
- Session-aware user-scoped data access
- Current-user profile endpoint support

### 2. Setup Canvas (Strategy Builder)
- Create reusable strategy setups
- Build dynamic checklist structures with:
  - Segments
  - Nested child items
  - Conditional If/Else branches
- Drag and reorder support for workflow items
- Mark a setup as default for instant daily use
- Save strategy definitions as structured JSON

### 3. Dynamic Pre-Trade Checklist Engine
- Renders checklist directly from active setup JSON
- Supports nested sub-items and branch logic
- Tracks completion state and progress percentage
- Shows readiness states (ready/not ready)
- Trade identity fields:
  - Trade name
  - Instrument
  - Trade timestamp

### 4. Entry and Risk Planning Tools
- Entry, Stop Loss, and nearest LRL capture
- Auto RR helper with 2R target and nearest-LRL comparison
- Floating minimal Risk and Lot Size Calculator
- Calculator inputs:
  - Instrument
  - Direction
  - Account size
  - Risk percent
  - Entry and Stop Loss
- Live outputs:
  - Risk amount
  - Stop distance
  - Points/pips distance
  - Suggested lot size

### 5. Post-Trade Analysis Board
- Dynamic post-trade segments from setup JSON
- Independent post-trade checklist completion tracking
- Persistent post-trade summary fields:
  - Trade state
  - Outcome
  - Reason/comments
  - P/L amount and unit
  - Review notes

### 6. Media Capture and Evidence System
- Attach images and videos to checklist sections
- Paste screenshots directly into active section
- Per-section media buckets keyed by setup/segment IDs
- Upload only changed/new media files
- Uploaded state badge shown for persisted assets
- Supports local data URL mode and hosted URL mode

### 7. Trade Save and Retrieval Architecture
- Create and update trade records
- Full snapshot persistence of:
  - Setup metadata
  - Checklist completion IDs
  - Branch selections
  - Prices and notes
  - Section media mappings
- Works in API mode and local storage fallback mode

### 8. Trade History Dashboard
- List all saved trades with rich cards
- Displays:
  - Setup name
  - Instrument
  - Trade time
  - Progress
  - Bias
  - Outcome/state badges
  - P/L summary
- Search and filter by:
  - Text query
  - Bias
  - Date range
  - Archived visibility

### 9. Replay Presentation Mode
- Slide-by-slide trade playback
- Slides generated from setup segments (pre-trade and post-trade)
- Includes media showcase for each segment
- Checklist item state replay (checked vs unchecked)
- Post-trade summary replay
- In-slide media lightbox for detailed review

### 10. Monthly Performance Analytics
- Backend-computed monthly summary endpoint
- Calendar-style day boxes (green/red/flat)
- Daily and weekly aggregation cards
- Month navigation controls
- Summary metrics for consistency tracking

### 11. Trade Lifecycle Management
- Archive instead of hard delete workflow
- Restore archived trades
- Clear all records when needed

### 12. Responsive Multi-Page UI
- Dedicated pages for:
  - Checklist execution
  - Setup management
  - Trade list and replay
  - Sign-in
- Mobile-friendly responsive layouts
- Floating quick actions for speed during execution

## API and Integration Readiness
- Structured REST API contract for auth, trades, setups, uploads, and health checks
- User ownership enforced server-side
- Extensible model for future broker/chart-data integrations

## Why Traders Choose This
- It combines planning, execution discipline, evidence capture, and review in one loop
- It is setup-driven, so your process evolves without rewriting app logic
- It produces a practical decision trail that can be audited and improved over time
