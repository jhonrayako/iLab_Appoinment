# Backend Installation & Setup Guide

Complete step-by-step instructions to get the iLAB Guiguinto backend running.

## Prerequisites

Before you start, ensure you have:

- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org)
- **PostgreSQL 12+** - Download from [postgresql.org](https://www.postgresql.org/download)
- A **code editor** (VS Code recommended)
- **Git** (optional, for version control)

### Verify Installation

Open a terminal/command prompt and verify:

```bash
node --version      # Should be v18.0.0 or higher
npm --version       # Should be 9.0.0 or higher
psql --version      # Should be PostgreSQL 12 or higher
```

---

## Step 1: Set Up PostgreSQL Database

### Create Database

Using `psql` command line or a PostgreSQL client:

```sql
CREATE DATABASE ilab_guiguinto;
```

### Verify Connection

Test your connection string:

```bash
psql -U postgres -h localhost -d ilab_guiguinto -c "SELECT 1;"
```

Note the connection details:
- **User**: (usually `postgres`)
- **Password**: (what you set during PostgreSQL installation)
- **Host**: `localhost`
- **Port**: `5432` (default)
- **Database**: `ilab_guiguinto`

---

## Step 2: Install Backend Dependencies

### On Windows (Using Batch Script)

1. Navigate to the backend folder:
   ```
   cd c:\Users\YourUsername\iLab_Guiguinto-website\backend
   ```

2. Run the installation script:
   ```
   install.bat
   ```

### On macOS/Linux

```bash
cd ~/iLab_Guiguinto-website/backend
npm install --legacy-peer-deps
```

### Manual Installation (if script fails)

```bash
cd backend
npm install
```

**Wait for it to complete** — this may take 2-5 minutes. You should see:
```
added XXX packages in X.XXs
```

Verify success by checking if `node_modules` folder exists:
```bash
ls node_modules     # macOS/Linux
dir node_modules    # Windows
```

---

## Step 3: Configure Environment Variables

### Create .env File

Copy the example file:

```bash
cp .env.example .env    # macOS/Linux
copy .env.example .env  # Windows
```

### Edit .env

Open `.env` in your editor and update these values:

```env
# Database - MOST IMPORTANT
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/ilab_guiguinto

# Replace YOUR_PASSWORD with your actual PostgreSQL password

# JWT - Change this to a long random string for security
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-recommended

# Server
NODE_ENV=development
PORT=5000

# Frontend URLs (these are correct for local development with Vite on port 5173)
FRONTEND_VISITOR_URL=http://localhost:5173
FRONTEND_ADMIN_URL=http://localhost:5173

# Optional: Notifications (can leave as-is for now)
SENDGRID_API_KEY=your-sendgrid-api-key
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token

# Sentiment Engine (lexicon is the default, works without external APIs)
SENTIMENT_ENGINE=lexicon
```

**⚠️ CRITICAL**: Make sure `DATABASE_URL` points to your actual PostgreSQL installation. Test it:

```bash
psql postgresql://postgres:YOUR_PASSWORD@localhost:5432/ilab_guiguinto -c "SELECT 1;"
```

---

## Step 4: Run Database Migrations

This creates all tables, indexes, and seeds initial data.

```bash
npm run migrate
```

You should see:
```
✅ Database schema created/updated successfully

📋 Created tables:
  - roles
  - users
  - facilities
  - appointments
  - logs
  - feedback
  - audit_log
```

### Troubleshooting Migration Errors

**Error: "ECONNREFUSED"**
- PostgreSQL is not running
- Fix: Start PostgreSQL (check System Tray on Windows, or `brew services start postgresql` on macOS)

**Error: "password authentication failed"**
- Database password in .env is wrong
- Fix: Update `DATABASE_URL` with correct password

**Error: "database 'ilab_guiguinto' does not exist"**
- Database wasn't created
- Fix: Run `CREATE DATABASE ilab_guiguinto;` in PostgreSQL

---

## Step 5: Start Development Server

```bash
npm run dev
```

You should see:
```
╔════════════════════════════════════════════╗
║  iLAB Guiguinto Backend Server             ║
║  Environment: development                  ║
║  Port: 5000                                ║
║  Status: ✅ Running                        ║
╚════════════════════════════════════════════╝
```

The server is now running at `http://localhost:5000`

### Test the Server

Open a new terminal/command prompt and run:

```bash
curl http://localhost:5000/api/health
```

You should see:
```json
{"status":"ok","timestamp":"2024-XX-XXTXX:XX:XX.XXXZ"}
```

---

## Step 6: Test Authentication Endpoints

### Register a Visitor

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

### Login as Visitor

```bash
curl -X POST http://localhost:5000/api/auth/visitor/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

**Save the JWT token** from the response, you'll need it for testing protected endpoints.

### Get Current User

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

---

## Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

---

## Development Commands

```bash
# Start development server (with auto-reload)
npm run dev

# Start production server
npm start

# Run database migrations
npm run migrate

# Run tests (if added)
npm test
```

---

## Next Steps

1. **Frontend Setup**: Install and run the React frontend (it runs on port 5173 by default)
2. **Test All Endpoints**: Use VS Code REST Client or Postman to test all APIs
3. **WebSocket Testing**: Connect to `ws://localhost:5000/ws?token=YOUR_JWT_TOKEN`
4. **Database Inspection**: Use pgAdmin or DBeaver to view database contents

---

## Troubleshooting

### Server Won't Start

**Issue**: "Port 5000 already in use"
```bash
# Find what's using port 5000
lsof -i :5000              # macOS/Linux
netstat -ano | findstr :5000 # Windows

# Kill it or use a different port
PORT=5001 npm run dev
```

**Issue**: "EACCES: permission denied"
- Your Node.js installation may need permissions adjusted
- Try: `sudo npm install` (macOS/Linux)

### Database Connection Issues

**Issue**: "Cannot connect to database"
1. Verify PostgreSQL is running
2. Verify connection string in .env
3. Test with: `psql postgresql://user:pass@localhost:5432/db_name`

### JWT Token Issues

**Issue**: "Invalid token" when testing endpoints
- JWT tokens expire (default: 7 days)
- Get a new token by logging in again
- Verify token is passed with `Authorization: Bearer TOKEN`

---

## Common Curl Examples

### Create an Appointment
```bash
curl -X POST http://localhost:5000/api/visitor/appointments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "facilityId": "FACILITY_UUID",
    "startTime": "2024-12-01T09:00:00Z",
    "endTime": "2024-12-01T10:00:00Z",
    "topic": "Tissue Culture Training"
  }'
```

### Get Available Slots
```bash
curl "http://localhost:5000/api/visitor/availability?facilityId=FACILITY_UUID&date=2024-12-01"
```

### List All Appointments (Admin)
```bash
curl -X GET http://localhost:5000/api/admin/appointments \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

---

## Production Deployment

When deploying to production:

1. Set `NODE_ENV=production`
2. Use strong JWT_SECRET (min 32 characters, random)
3. Use database URL from production PostgreSQL
4. Set proper CORS origins for frontend URLs
5. Add real notification API keys (SendGrid, Twilio)
6. Use a process manager (PM2, systemd)
7. Set up SSL/TLS certificates
8. Enable logging and monitoring
9. Run: `npm start` (not `npm run dev`)

---

## Support

For detailed API documentation, see `README.md` in the backend folder.

For issues:
1. Check the console output for error messages
2. Verify `.env` file is correctly configured
3. Check that PostgreSQL is running
4. Run: `npm run migrate` again to ensure database schema is created

---

## Quick Checklist

- [ ] Node.js and npm installed
- [ ] PostgreSQL running
- [ ] `.env` file created and configured
- [ ] `npm install` completed successfully
- [ ] `npm run migrate` completed successfully
- [ ] `npm run dev` server starts without errors
- [ ] `curl http://localhost:5000/api/health` returns `{"status":"ok"}`
- [ ] Test visitor registration and login work
- [ ] Ready to connect frontend!

You're all set! 🚀
