.PHONY: dev build build-windows test test-app test-cover fmt lint vet vet-desktop clean install-tools frontend-deps frontend-build frontend-lint docs docs-pdf docs-check ci

WAILS ?= wails
WAILS_VERSION := v2.17.0

install-tools:
	go install github.com/wailsapp/wails/v2/cmd/wails@$(WAILS_VERSION)

frontend-deps:
	npm ci --prefix frontend --legacy-peer-deps

dev:
	$(WAILS) dev

build:
	$(WAILS) build -m

build-windows:
	$(WAILS) build -m -platform windows/amd64

frontend-build:
	npm run build:frontend

# Portable backend and facade checks; no GUI or real device credentials needed.
test:
	go test -mod=readonly ./internal/... -count=1
	$(MAKE) test-app

test-app:
	go test -mod=readonly app.go app_inventory_test.go app_groups_test.go -count=1

test-cover:
	go test -mod=readonly ./internal/... -coverprofile=coverage.out -count=1
	go tool cover -html=coverage.out -o coverage.html

fmt:
	go fmt ./...

vet:
	go vet -mod=readonly ./internal/...

# Requires the platform's Wails desktop prerequisites.
vet-desktop:
	go vet -mod=readonly ./...

frontend-lint:
	npm run typecheck

lint: vet frontend-lint

docs:
	python3 tools/generate_notice_pdf.py

docs-check: docs
	python3 tools/check_docs.py
	git diff --exit-code -- Notice_NetTools_page.html tools/notice_rendered.html

docs-pdf:
	python3 tools/generate_notice_pdf.py --pdf

clean:
	rm -rf build/bin
	rm -f coverage.out coverage.html

# Portable checks; GitHub also compiles Windows and scans security/licenses.
ci: lint frontend-build test
