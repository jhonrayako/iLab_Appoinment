# Quick Reference - Backend Commands

## Setup (One-Time)

```bash
cd backend

# Install dependencies
npm install --legacy-peer-deps
# OR Windows: install.bat

# Copy and configure .env
cp .env.example .env
# Edit .env and set DATABASE_URL and JWT_SECRET

# Run migrations (create database schema)
npm run migrate
```

## Development

```bash
# Start dev server (auto-reload on file changes)
npm run dev

# Start production server
npm start

# Re-run migrations (if schema changes)
npm run migrate

# Test API is running
curl http://localhost:5000/api/health
```

## Testing Endpoints

### Health Check
```bash
curl http://localhost:5000/api/health
```

### Register Visitor
```bash
curl -X POST http://localhost:5000/api/auth/visitor/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/visitor/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# Copy token from response
export TOKEN="eyJhbGci..."
```

### Get Current User (Requires Token)
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Get Available Time Slots
```bash
curl "http://localhost:5000/api/visitor/availability?facilityId=FACILITY_UUID&date=2024-12-15"
```

### Create Appointment
```bash
curl -X POST http://localhost:5000/api/visitor/appointments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "facilityId": "FACILITY_UUID",
    "startTime": "2024-12-15T09:00:00Z",
    "endTime": "2024-12-15T10:00:00Z",
    "topic": "Tissue Culture Training"
  }'
```

### Admin: List All Appointments
```bash
curl -X GET http://localhost:5000/api/admin/appointments \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Admin: Get Analytics
```bash
curl -X GET "http://localhost:5000/api/admin/analytics/visitor-stats?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Submit Feedback
```bash
curl -X POST http://localhost:5000/api/visitor/feedback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "Great experience! Very helpful service."}'
```

### Chatbot: Ask FAQ Question (Guest)
```bash
curl -X POST http://localhost:5000/api/chatbot/faq \
  -H "Content-Type: application/json" \
  -d '{"question": "What are your hours of operation?"}'
```

## Troubleshooting

### Server won't start - "Port 5000 already in use"
```bash
# Use different port
PORT=5001 npm run dev

# Or kill process using port 5000
# Windows: netstat -ano | findstr :5000
# macOS/Linux: lsof -i :5000
```

### Database connection error
```bash
# 1. Verify PostgreSQL is running
# 2. Check DATABASE_URL in .env is correct
# 3. Test connection:
psql postgresql://user:password@localhost:5432/ilab_guiguinto -c "SELECT 1;"
```

### Migration fails
```bash
# Make sure database exists
psql -U postgres -c "CREATE DATABASE ilab_guiguinto;"

# Re-run migration
npm run migrate
```

### JWT token expired
- Tokens expire by default after 7 days
- Login again to get a new token

## Environment Variables

```
DATABASE_URL=postgresql://user:password@localhost:5432/ilab_guiguinto
JWT_SECRET=your-super-secret-key-change-this
JWT_EXPIRY=7d
NODE_ENV=development
PORT=5000
FRONTEND_VISITOR_URL=http://localhost:5173
FRONTEND_ADMIN_URL=http://localhost:5173
SENTIMENT_ENGINE=lexicon
```

## Ports

- Backend: 5000
- Frontend (Vite): 5173
- PostgreSQL: 5432
- WebSocket: 5000 (same as backend, path /ws)

## File Locations

- Main entry: `backend/src/server.js`
- Express app: `backend/src/app.js`
- Routes: `backend/src/routes/`
- Services: `backend/src/services/`
- Database: `backend/src/db/schema.sql`
- Config: `backend/.env`

## Useful Documentation

- `README.md` - Full API documentation
- `INSTALLATION.md` - Setup guide with troubleshooting
- `IMPLEMENTATION_SUMMARY.md` - Architecture overview

## Need to Reset Everything?

```bash
# 1. Drop database (WARNING: deletes all data)
psql -U postgres -c "DROP DATABASE ilab_guiguinto;"

# 2. Re-run migration
npm run migrate

# 3. Restart server
npm run dev
```

---

**Backend Server Status**: Running ✅ at http://localhost:5000
**Ready for Frontend Integration**: Yes ✅
