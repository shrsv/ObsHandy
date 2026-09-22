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
	rm -f main.js sql-wasm.wasm

# Usage: make release VERSION=0.1.1
release:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=x.y.z"; exit 1; fi
	npm version $(VERSION) -m "Release v%s"
	git push
	git push --tags
