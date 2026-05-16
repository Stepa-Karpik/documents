.PHONY: backend-test frontend-typecheck frontend-build migrate verify

backend-test:
	cd backend && .venv/bin/pytest -q

frontend-typecheck:
	cd frontend && npm run typecheck

frontend-build:
	cd frontend && npm run build

migrate:
	cd backend && .venv/bin/alembic upgrade head

verify: backend-test frontend-typecheck frontend-build
