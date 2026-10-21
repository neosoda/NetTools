# TESTS

- Spec ID: nettools-v1-5-improvements
- Status: draft
- Owner: unassigned
- Last reviewed: pending

## Verification strategy

- Backend: Tests unitaires Go sur `internal/...` (`go test ./internal/... -count=1`).
- Frontend: Vérification statique TypeScript (`npx tsc --noEmit -p frontend/tsconfig.json`) et build Vite (`npm --prefix frontend run build`).
- Integration: Compilation complète Wails (`wails build`).
