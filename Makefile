# Makefile for Crosswords Generated Project
# This project contains a static frontend and a Flask backend service

.PHONY: help start stop frontend backend install clean dev logs

# Default port configurations
FRONTEND_PORT ?= 8000
BACKEND_PORT ?= 5001

help: ## Show this help message
	@echo "Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install backend dependencies
	@echo "Installing backend dependencies..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "Error: uv is required but not installed. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"; \
		exit 1; \
	fi
	cd scoretracker && uv sync

start: ## Start both frontend and backend services
	@echo "Starting crossword services..."
	@$(MAKE) backend &
	@sleep 2
	@$(MAKE) frontend &
	@echo ""
	@echo "🚀 Services started successfully!"
	@echo "   Frontend: http://localhost:$(FRONTEND_PORT)"
	@echo "   Backend:  http://localhost:$(BACKEND_PORT)"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@wait

frontend: ## Start the frontend web server
	@echo "Starting frontend server on port $(FRONTEND_PORT)..."
	@if command -v python3 >/dev/null 2>&1; then \
		python3 -m http.server $(FRONTEND_PORT); \
	else \
		echo "Error: Python 3 is required but not installed"; \
		exit 1; \
	fi

backend: ## Start the Flask backend service
	@echo "Starting backend service on port $(BACKEND_PORT)..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "Error: uv is required but not installed. Run 'make install' first."; \
		exit 1; \
	fi
	cd scoretracker && uv run python app.py

dev: ## Start services in development mode with auto-reload
	@echo "Starting services in development mode..."
	@$(MAKE) backend-dev &
	@sleep 2
	@$(MAKE) frontend &
	@echo ""
	@echo "🔧 Development services started!"
	@echo "   Frontend: http://localhost:$(FRONTEND_PORT)"
	@echo "   Backend:  http://localhost:$(BACKEND_PORT) (with auto-reload)"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@wait

backend-dev: ## Start backend in development mode with debug enabled
	@echo "Starting backend in development mode..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "Error: uv is required but not installed. Run 'make install' first."; \
		exit 1; \
	fi
	cd scoretracker && FLASK_ENV=development FLASK_DEBUG=1 uv run python app.py

stop: ## Stop all running services
	@echo "Stopping services..."
	@pkill -f "python.*app.py" 2>/dev/null || true
	@pkill -f "python.*http.server.*$(FRONTEND_PORT)" 2>/dev/null || true
	@echo "Services stopped."

logs: ## Show logs from backend service (if running with systemd)
	@if [ -f "scoretracker/scoretracker.service" ]; then \
		echo "Showing backend service logs..."; \
		journalctl -u scoretracker -f; \
	else \
		echo "No systemd service found. Logs are shown in terminal when running 'make start'"; \
	fi

clean: ## Clean up temporary files and caches
	@echo "Cleaning up..."
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type f -name ".DS_Store" -delete
	@echo "Cleanup complete."

# Production deployment helpers
prod-install: ## Install production dependencies
	@echo "Installing production dependencies..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "Error: uv is required but not installed. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"; \
		exit 1; \
	fi
	cd scoretracker && uv sync

prod-backend: ## Start backend with gunicorn for production
	@echo "Starting backend with gunicorn..."
	cd scoretracker && uv run gunicorn --bind 0.0.0.0:$(BACKEND_PORT) --workers 4 app:app

# Health checks
health: ## Check if services are running
	@echo "Checking service health..."
	@echo -n "Frontend (port $(FRONTEND_PORT)): "
	@curl -s http://localhost:$(FRONTEND_PORT) >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Not running"
	@echo -n "Backend (port $(BACKEND_PORT)): "
	@curl -s http://localhost:$(BACKEND_PORT)/health >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Not running"
