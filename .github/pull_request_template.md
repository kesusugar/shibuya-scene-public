## Summary

- What changed:
- Stage and camera affected:
- Why this approach:

## Validation

- [ ] `npm run typecheck`
- [ ] `npm run test:ci` or relevant targeted tests
- [ ] Full `npm test` for integration changes (portable build plus current suite)
- [ ] No new browser console or shader errors
- [ ] HIGH day inspected after startup settled
- [ ] HIGH night inspected after startup settled

## Visual evidence

- Before:
- After:
- Camera, tier, time, viewport:
- FPS/draw calls after settling, if measured:

## Safety and handoff

- [ ] No unrelated working-tree changes were staged
- [ ] New repeated objects reuse bounded geometry/materials
- [ ] New resources and asynchronous work dispose safely
- [ ] Evidence changes, if any, were intentionally regenerated and committed separately
- [ ] Known limitations are documented
