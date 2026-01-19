# Whister

An Israeli Whist score-keeping and game analysis platform built with a modern monorepo structure.

## Project Structure

This is a monorepo containing both the backend API and frontend application:

```
/Whister/
├── backend/                 # FastAPI backend
│   ├── app/                 # FastAPI application code
│   ├── tests/               # Backend test suite
│   ├── alembic/             # Database migrations
│   ├── pyproject.toml       # Python dependencies
│   ├── .env.example         # Environment variables template
│   └── .venv/               # Python virtual environment (created locally)
│
├── frontend/                # Next.js React frontend
│   ├── app/                 # Next.js app directory (routes, pages)
│   ├── components/          # React components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities (API client, WebSocket, validation)
│   ├── stores/              # Zustand state management
│   ├── types/               # TypeScript type definitions
│   ├── package.json         # Node.js dependencies
│   └── .env.local.example   # Environment variables template
│
├── docs/                    # Project documentation
│   ├── BACKEND_IMPLEMENTATION_COMPLETE.md
│   ├── FRONTEND_SETUP_SUMMARY.md
│   ├── GROUP_MANAGEMENT_AND_ANALYTICS_SPECIFICATIONS.md
│   ├── whist-platform-hld.md
│   ├── backend-api-lld.md
│   ├── frontend-lld.md
│   ├── websocket-events-lld.md
│   ├── database-schema-lld.md
│   └── game-rules-reference.md
│
├── docker-compose.yml       # Docker orchestration (postgres, redis, backend)
├── .gitignore              # Git ignore rules
└── LICENSE                 # MIT License
```

## Tech Stack

### Backend
- **Framework**: FastAPI
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Cache**: Redis
- **Real-time**: Socket.IO for WebSocket communication
- **Testing**: pytest
- **Code Quality**: mypy (type checking), ruff (linting)

### Frontend
- **Framework**: Next.js 16 with TypeScript
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Real-time**: Socket.IO client
- **Components**: Custom component library with Radix UI inspiration

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (optional, for containerized setup)

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Run migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload

# Run tests
python -m pytest tests/ -v

# Run type checking
python -m mypy app/

# Run linting
python -m ruff check app/
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Type checking
npm run type-check

# Build for production
npm run build
```

### Using Docker Compose

```bash
# Start all services (postgres, redis, backend)
docker-compose up --build

# Services:
# - Backend: http://localhost:8000
# - PostgreSQL: localhost:5432
# - Redis: localhost:6379
```

Then in another terminal:

```bash
cd frontend
npm install
npm run dev
# Frontend: http://localhost:3000
```

## Environment Variables

### Backend (`backend/.env`)
```env
DATABASE_URL=postgresql+asyncpg://whist:whistpass123@localhost:5432/whist_db
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=your-secret-key-here
DEBUG=true
ENVIRONMENT=development
```

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_WS_URL=http://localhost:8000
```

## Development Workflow

### Running Everything Locally

**Terminal 1 - Backend:**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
# Backend runs on http://localhost:8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Frontend runs on http://localhost:3000
```

### Running with Docker

```bash
docker-compose up --build
# All services run in containers
```

## API Documentation

- **API Docs**: http://localhost:8000/docs (Swagger UI)
- **ReDoc**: http://localhost:8000/redoc

Comprehensive API documentation is available in `docs/backend-api-lld.md`

## WebSocket Events

Real-time game updates use Socket.IO. Event definitions are in `docs/websocket-events-lld.md`

## Game Rules

Rules for the Israeli Whist variant are documented in `docs/game-rules-reference.md`

## Project Documentation

| Document | Purpose |
|----------|---------|
| `docs/whist-platform-hld.md` | High-level architecture overview |
| `docs/backend-api-lld.md` | Backend API endpoint specifications |
| `docs/frontend-lld.md` | Frontend component structure and flows |
| `docs/websocket-events-lld.md` | Real-time event definitions |
| `docs/database-schema-lld.md` | Database design and relationships |
| `docs/game-rules-reference.md` | Game rules and scoring logic |
| `docs/BACKEND_IMPLEMENTATION_COMPLETE.md` | Backend implementation details |
| `docs/FRONTEND_SETUP_SUMMARY.md` | Frontend setup and component guide |
| `docs/GROUP_MANAGEMENT_AND_ANALYTICS_SPECIFICATIONS.md` | Groups and analytics features |

## Testing

### Backend Tests
```bash
cd backend
python -m pytest tests/ -v
```

### Frontend Tests (if configured)
```bash
cd frontend
npm test
```

## Building for Production

### Backend
```bash
cd backend
# Build Docker image
docker build -t whister-backend:latest .

# Or using docker-compose
docker-compose -f docker-compose.yml build
```

### Frontend
```bash
cd frontend
npm run build
npm run start
```

## Troubleshooting

### Backend won't start
1. Check PostgreSQL is running
2. Run migrations: `alembic upgrade head`
3. Verify Python version: `python --version` (should be 3.10+)
4. Check dependencies: `pip install -e ".[dev]"`

### Frontend won't start
1. Clear node_modules and cache: `rm -rf node_modules .next`
2. Reinstall: `npm install`
3. Check Node version: `node --version` (should be 18+)

### WebSocket connection fails
1. Ensure backend is running on http://localhost:8000
2. Check `frontend/.env.local` has correct `NEXT_PUBLIC_WS_URL`
3. Verify Redis is running (used for Socket.IO sessions)

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Ensure tests pass and code quality checks pass
4. Commit with clear messages
5. Open a pull request

## License

MIT License - see LICENSE file for details

## Useful Commands

### Quick start (local development)
```bash
# Terminal 1
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2
cd frontend && npm run dev
```

### Quick Docker start
```bash
docker-compose up && cd frontend && npm install && npm run dev
```

### Database management
```bash
cd backend
alembic current                    # Show current migration
alembic upgrade head               # Apply all migrations
alembic downgrade -1               # Rollback last migration
```

### Type checking all
```bash
# Backend
cd backend && python -m mypy app/

# Frontend
cd frontend && npm run type-check
```

---

Built with ❤️ as an Israeli Whist scoring platform.
