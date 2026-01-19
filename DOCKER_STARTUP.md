# Docker Startup Guide for Whister

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- No local services running on ports 5432, 6379, 8000

### Start the Application

```bash
# From project root
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f backend
```

### What Gets Started

1. **PostgreSQL** (port 5432)
   - Database: `whist_db`
   - User: `whist`
   - Password: `whistpass123`

2. **Redis** (port 6379)
   - Cache and session store

3. **Backend API** (port 8000)
   - FastAPI application
   - Available at `http://localhost:8000`
   - API docs at `http://localhost:8000/docs`

### Environment Variables

Create a `.env` file to override defaults:

```bash
# PostgreSQL
POSTGRES_USER=whist
POSTGRES_PASSWORD=whistpass123
POSTGRES_DB=whist_db

# JWT
JWT_SECRET_KEY=your-super-secret-key-change-in-production

# Environment
DEBUG=true
ENVIRONMENT=development
```

### Common Commands

```bash
# Stop services
docker-compose down

# Remove all data (fresh start)
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# Run migrations
docker-compose exec backend alembic upgrade head

# Run tests in container
docker-compose exec backend pytest tests/ -v

# Access PostgreSQL
docker-compose exec postgres psql -U whist -d whist_db

# Access Redis
docker-compose exec redis redis-cli

# View service status
docker-compose ps

# Restart a service
docker-compose restart backend
```

### Accessing the API

**Base URL**: `http://localhost:8000`

**Health Check**:
```bash
curl http://localhost:8000/api/v1/health
```

**Interactive API Docs**:
```
http://localhost:8000/docs
```

**Create User**:
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPass123",
    "display_name": "Test User"
  }'
```

### Troubleshooting

**Port Already in Use**:
```bash
# Find and stop container using port
docker ps | grep 8000
docker stop <container_id>
```

**Database Connection Error**:
```bash
# Check PostgreSQL health
docker-compose ps postgres

# View logs
docker-compose logs postgres
```

**Backend Won't Start**:
```bash
# Check backend logs
docker-compose logs backend

# Rebuild image
docker-compose build --no-cache backend
docker-compose up backend
```

**Redis Connection Issues**:
```bash
# Restart Redis
docker-compose restart redis

# Check Redis health
docker-compose exec redis redis-cli ping
```

### Development Workflow

#### Local Development (Recommended)

```bash
# Keep Docker services running
docker-compose up postgres redis

# In another terminal, run backend locally
cd backend
.venv/bin/python -m uvicorn app.main:app --reload
```

**Advantages**:
- Faster code reload (no container rebuild)
- Easier debugging
- IDE integration

#### Containerized Development

```bash
# Run everything in containers
docker-compose up

# Make code changes locally
# Changes will be reflected immediately (due to volume mounts)

# View logs
docker-compose logs -f backend
```

### Production Deployment

For production, update the Dockerfile:

```dockerfile
# Remove --reload flag
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Use production SECRET_KEY
ENV JWT_SECRET_KEY=your-production-key-here
```

Update docker-compose.yml:
- Remove `--reload` from command
- Set `ENVIRONMENT=production`
- Set `DEBUG=false`
- Use strong `JWT_SECRET_KEY`

## Performance

### Build Time
- First build: ~2-3 minutes (downloading dependencies)
- Subsequent builds: ~30 seconds

### Startup Time
- PostgreSQL: ~3 seconds
- Redis: ~1 second
- Backend: ~2-3 seconds
- **Total**: ~10 seconds

### Image Size
- Base image: ~150 MB
- With dependencies: ~400 MB

## Security Notes

⚠️ **Development Only**:
- Credentials hardcoded in docker-compose.yml
- `DEBUG=true` enabled
- No SSL/TLS configured

🔒 **For Production**:
- Use environment variables from secrets manager
- Disable `DEBUG`
- Enable SSL/TLS
- Use strong random `JWT_SECRET_KEY`
- Add authentication to Redis
- Configure firewall rules

## Further Help

See main [README.md](README.md) for:
- Frontend setup
- Development guidelines
- Testing procedures
- Architecture overview
