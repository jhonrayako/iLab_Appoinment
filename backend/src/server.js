const http = require('http');
const app = require('./app');
const { initRealtime, getStats, closeAll } = require('./realtime/socket');
const { startAppointmentReminderWorker } = require('./services/appointmentReminderWorker');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Attach WebSocket server
const wss = initRealtime(server);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received. Gracefully shutting down...');
  closeAll();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received. Gracefully shutting down...');
  closeAll();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
server.listen(PORT, () => {
  startAppointmentReminderWorker();
  console.log(`
╔════════════════════════════════════════════╗
║  iLAB Guiguinto Backend Server             ║
║  Environment: ${process.env.NODE_ENV || 'development'}                    ║
║  Port: ${PORT}                                   ║
║  Status: ✅ Running                         ║
╚════════════════════════════════════════════╝
  `);

  // Log WebSocket stats periodically
  setInterval(() => {
    const stats = getStats();
    if (stats.total_connections > 0) {
      console.log(`📊 WebSocket stats:`, stats);
    }
  }, 60000); // Every minute
});

// Expose for testing/external control
module.exports = { server, wss };
