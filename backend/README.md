# iLAB Guiguinto Backend

Complete Node.js/Express + PostgreSQL backend for the iLAB Guiguinto Visitor Management & Appointment Scheduling System.

## Features

- ✅ **Two Role-Based Portals**: Visitor and Admin with separate authentication flows
- ✅ **Concurrent-Safe Appointment Booking**: Transaction-level capacity checking prevents overbooking
- ✅ **Visitor E-Logging**: Check-in/check-out with QR code support
- ✅ **Real-Time Sync**: WebSocket server for live appointment and capacity updates
- ✅ **Sentiment Analysis**: NLP-driven feedback classification (Lexicon, VADER, HuggingFace)
- ✅ **Analytics & Reporting**: Visitor stats, capacity utilization, attendance, demographics
- ✅ **Audit Logging**: Complete audit trail for all sensitive actions
- ✅ **Notification System**: Email/SMS stubs (ready for SendGrid, Twilio integration)

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** 12+
- **.env file** with DATABASE_URL and JWT_SECRET

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:
- `DATABASE_URL=postgresql://user:password@localhost:5432/ilab_guiguinto`
- `JWT_SECRET=your-super-secret-key`

### 3. Create Database & Run Migrations

```bash
npm run migrate
```

This creates all tables, indexes, and seeds initial roles and test users.

### 4. Start Development Server

```bash
npm run dev
```

Server runs at `http://localhost:5000`

## API Endpoints

### Auth (Public)
- `POST /api/auth/visitor/register` - Register new visitor
- `POST /api/auth/visitor/login` - Visitor login
- `POST /api/auth/admin/login` - Admin login
- `GET /api/auth/me` - Get current user (requires auth)

### Visitor Portal
- `GET /api/visitor/availability?facilityId=X&date=Y` - Get available slots
- `POST /api/visitor/appointments` - Create appointment
- `GET /api/visitor/appointments` - List own appointments
- `PUT /api/visitor/appointments/:id/reschedule` - Reschedule
- `DELETE /api/visitor/appointments/:id/cancel` - Cancel
- `POST /api/visitor/feedback` - Submit feedback

### Admin Portal
- `GET /api/admin/appointments` - List all appointments
- `POST /api/admin/appointments` - Create appointment
- `PUT /api/admin/appointments/:id` - Update appointment
- `DELETE /api/admin/appointments/:id/cancel` - Cancel
- `GET /api/admin/analytics/*` - Visitor stats, capacity, attendance, demographics
- `GET /api/admin/sentiment/*` - Sentiment summary and trends
- `GET /api/admin/feedback` - List feedback
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `GET /api/admin/facilities` - List facilities
- `POST /api/admin/facilities` - Create facility
- `GET /api/admin/audit-log` - View audit log

### Chatbot
- `POST /api/chatbot/faq` - Answer general questions (guest)
- `GET /api/chatbot/gated-action-response` - Registration prompt
- `POST /api/chatbot/book` - Book via chatbot (authenticated)
- `POST /api/chatbot/feedback` - Submit feedback via chatbot (authenticated)

The FAQ matcher supports English questions about iLAB hours, location, contact details, visits, and services. Admins can train each FAQ by adding example questions in the chatbot knowledge form; the matcher gives those examples extra weight. Greetings receive a friendly response, and questions about the bot's capabilities list its supported topics. Unrelated questions get a clear scope notice and iLAB contact details rather than a guessed answer.

Automated chatbot replies are always enabled 24/7. During office hours, visitor messages and automated replies are also shared with the iLAB administrator for follow-up; there is no on/off switch.

### Real-Time
- `WS /ws?token=JWT` - WebSocket connection for live updates

## Project Structure

```
src/
  app.js                    Express app setup
  server.js                 HTTP + WebSocket server entry point
  config/
    db.js                   Database connection pool & transaction helper
  db/
    schema.sql              Complete DDL + seed data
    migrate.js              Migration runner
  middleware/
    auth.js                 JWT verification & role checking
    errorHandler.js         Centralized error handling
  utils/
    jwt.js                  Token signing/verification
    password.js             Bcrypt hashing/verification
    audit.js                Audit logging helper
  services/
    authService.js          User registration & authentication
    appointmentsService.js  Booking, capacity checking, rescheduling
    notificationsService.js Email/SMS stubs
    eloggingService.js      Check-in/check-out
    analyticsService.js     Reports and statistics
    sentimentEngine.js      Sentiment classification (pluggable)
    feedbackService.js      Feedback persistence & sentiment
    userRoleService.js      Admin user/role management
    facilityService.js      Admin facility management
    auditService.js         Audit log queries
  routes/
    authRoutes.js
    visitorRoutes.js
    adminRoutes.js
    chatbotRoutes.js
    index.js                Route mounting
  realtime/
    socket.js               WebSocket server & broadcasting
```

## Key Architecture Decisions

### 1. Capacity Checking (§5 of spec)
The critical `assertCapacityAvailable` function:
- Runs inside a database transaction with `FOR UPDATE` lock
- Counts overlapping appointments
- Rejects if capacity is reached
- Used by create, reschedule, and chatbot booking endpoints
- **Never duplicated** — single source of truth

### 2. Authentication
Separate login endpoints prevent cross-role authentication:
- `/auth/visitor/login` - Visitor role only
- `/auth/admin/login` - Admin role only

JWT contains `role_id` and `role_name`. Every protected endpoint verifies both.

### 3. Sentiment Engine
Pluggable architecture supports multiple implementations:
- **Lexicon** (default): Rule-based with negation handling
- **VADER**: Valence Aware Dictionary and sEntiment Reasoner
- **HuggingFace**: Remote API classifier

Selected via `SENTIMENT_ENGINE` env var. Stable interface: `classifySentiment(text) -> {label, score}`

### 4. Real-Time Sync
WebSocket server broadcasts events:
- `appointment_created`
- `appointment_updated`
- `appointment_cancelled`
- `capacity_threshold_alert`
- `visitor_checked_in`
- `visitor_checked_out`
- `new_feedback`

Clients subscribe via `/ws?token=JWT`.

## Testing

### Manual Testing with cURL

```bash
# Register visitor
curl -X POST http://localhost:5000/api/auth/visitor/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"password123","firstName":"John","lastName":"Doe"}'

# Login
curl -X POST http://localhost:5000/api/auth/visitor/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"password123"}'

# Get token from response, then:
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer TOKEN_HERE"
```

### WebSocket Testing

```javascript
// In browser console or Node.js
const ws = new WebSocket('ws://localhost:5000/ws?token=YOUR_JWT_TOKEN');
ws.onmessage = (event) => console.log(JSON.parse(event.data));
```

## Production Deployment

### Environment Variables (Set in .env or secrets manager)
```
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=<long-random-string>
SENDGRID_API_KEY=<your-sendgrid-key>
TWILIO_ACCOUNT_SID=<your-twilio-sid>
TWILIO_AUTH_TOKEN=<your-twilio-token>
SENTIMENT_ENGINE=lexicon
```

### Health Checks
- `GET /live` - Liveness probe
- `GET /ready` - Readiness probe (includes DB check)
- `GET /api/health` - API health

### Docker (Example Dockerfile)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src ./src
EXPOSE 5000
CMD ["npm", "start"]
```

## Next Steps

1. **Frontend Integration**: Connect React portals to these endpoints
2. **Real-World Notifications**: Integrate SendGrid, Twilio, SMS providers
3. **AI/NLP Enhancement**: Upgrade sentiment engine; improve chatbot intents
4. **Testing**: Add unit and integration tests
5. **Load Testing**: Verify concurrent booking safety under high load
6. **Monitoring**: Add metrics, logging, error tracking (New Relic, Datadog, etc.)

## Support

For issues or questions, contact: support@ilab.gov.ph
