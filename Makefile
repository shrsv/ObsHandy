.PHONY: install build dev check clean release

install:
	npm install

build:
	npm run build

dev:
	npm run dev

check:
	npx tsc -noEmit -skipLibCheck

clean:
	rm -f main.js src/sqlWasmBase64.ts

# Usage: make release VERSION=0.1.1
release:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=x.y.z"; exit 1; fi
	npm --no-git-tag-version version $(VERSION)
	git add -A
	lrc review --staged --skip
	git commit -m "Release v$(VERSION)"
	git tag v$(VERSION)
	git push
	git push --tags
