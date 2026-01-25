# Whister - Service Restart Guide

Quick reference for restarting backend and frontend services during development.

---

## 🚀 Quick Reference

### Local Development (No Docker)
```bash
# Backend (from project root)
cd backend
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (from project root)
cd frontend
npm run dev
```

### Docker Development
```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart backend
docker-compose restart postgres
docker-compose restart redis

# Full rebuild and restart
docker-compose down
docker-compose up --build
```

---

## 🔧 Backend Restart (Local)

### Prerequisites
- Python 3.11+ installed
- Virtual environment created and activated
- Dependencies installed (`pip install -r requirements.txt`)
- PostgreSQL running (locally or via Docker)
- Redis running (locally or via Docker)

### Steps

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Activate virtual environment**
   ```bash
   # macOS/Linux
   source .venv/bin/activate

   # Windows
   .venv\Scripts\activate
   ```

3. **Start the server**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. **Verify**
   - Backend should be running at: `http://localhost:8000`
   - API docs available at: `http://localhost:8000/docs`
   - Health check: `http://localhost:8000/health`

### Alternative: Using Python module syntax
```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 🎨 Frontend Restart (Local)

### Prerequisites
- Node.js 18+ installed
- Dependencies installed (`npm install`)

### Steps

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Start the development server**
   ```bash
   npm run dev
   ```

3. **Verify**
   - Frontend should be running at: `http://localhost:3000`
   - Hot reload is enabled for instant updates

### Alternative Commands
```bash
# Start with different port
npm run dev -- --port 3001

# Start with turbo mode (faster rebuilds)
npm run dev --turbo
```

---

## 🐳 Docker Restart

### Full Stack Restart

```bash
# Restart all services (preserves data)
docker-compose restart

# Stop all services
docker-compose down

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Individual Service Restart

```bash
# Restart only backend
docker-compose restart backend

# Restart database services
docker-compose restart postgres
docker-compose restart redis
```

### Clean Restart (with rebuild)

Use this when you've made changes to Dockerfile or dependencies:

```bash
# Stop and remove containers
docker-compose down

# Rebuild images and start
docker-compose up --build -d

# Or for specific service
docker-compose up --build backend -d
```

### Nuclear Option (Complete Reset)

⚠️ **Warning**: This will delete all data (database, redis cache)

```bash
# Stop containers and remove volumes
docker-compose down -v

# Rebuild and start fresh
docker-compose up --build -d
```

---

## 🔍 Troubleshooting

### Backend Issues

**Port Already in Use (8000)**
```bash
# Find process using port 8000
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill the process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Or use a different port
uvicorn app.main:app --reload --port 8001
```

**Database Connection Error**
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check connection manually
psql -h localhost -U whist -d whist_db

# Restart database
docker-compose restart postgres
```

**Redis Connection Error**
```bash
# Check if Redis is running
docker-compose ps redis

# Test Redis connection
redis-cli ping

# Restart Redis
docker-compose restart redis
```

**Module Not Found Error**
```bash
# Reinstall dependencies
cd backend
pip install -r requirements.txt

# Or with Docker
docker-compose up --build backend
```

### Frontend Issues

**Port Already in Use (3000)**
```bash
# Find and kill process
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Or use different port
npm run dev -- --port 3001
```

**Module Not Found / Dependencies Error**
```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules
rm package-lock.json
npm install
```

**Build Cache Issues**
```bash
# Clear Next.js cache
cd frontend
rm -rf .next
npm run dev
```

### Docker Issues

**Container Won't Start**
```bash
# Check container status and logs
docker-compose ps
docker-compose logs backend

# Check for port conflicts
docker-compose down
docker-compose up -d
```

**Out of Sync / Stale Data**
```bash
# Restart with fresh build
docker-compose down
docker-compose up --build --force-recreate
```

**Database Migration Needed**
```bash
# Run migrations
docker-compose exec backend alembic upgrade head

# Or locally
cd backend
alembic upgrade head
```

---

## 📊 Service Ports

| Service | Port | URL |
|---------|------|-----|
| Backend API | 8000 | http://localhost:8000 |
| Backend Docs | 8000 | http://localhost:8000/docs |
| Frontend | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | postgresql://localhost:5432 |
| Redis | 6379 | redis://localhost:6379 |

---

## 💡 Tips

1. **Use `--reload` flag** for backend during development - auto-restarts on code changes
2. **Frontend hot reload** is automatic - just save files and see changes
3. **Docker logs** are your friend: `docker-compose logs -f` to debug issues
4. **Health checks**: Both services have health endpoints you can ping
5. **Kill stuck processes**: Don't forget to check for zombie processes on your ports

---

## 🔗 Related Documentation

- [Backend API Documentation](./backend-api-lld.md)
- [Frontend Setup](../frontend/README.md)
- [Docker Configuration](../docker-compose.yml)
