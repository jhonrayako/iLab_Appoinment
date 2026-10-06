const { query } = require('../config/db');
const { notifyAppointmentReminder } = require('./notificationsService');

let running = false;

async function sendDueReminders() {
  if (running) return;
  running = true;
  try {
    const result = await query(
      `SELECT a.appointment_id, a.topic, a.start_time, f.facility_name,
              u.email, u.first_name
       FROM appointments a
       JOIN facilities f ON f.facility_id = a.facility_id
       JOIN users u ON u.user_id = a.user_id
       WHERE a.status = 'Confirmed'
         AND a.reminder_sent_at IS NULL
         AND a.start_time > NOW()
         AND a.start_time <= NOW() + INTERVAL '24 hours'
       ORDER BY a.start_time
       LIMIT 50`
    );

    for (const appointment of result.rows) {
      const claimed = await query(
        `UPDATE appointments SET reminder_sent_at = NOW()
         WHERE appointment_id = $1 AND reminder_sent_at IS NULL
         RETURNING appointment_id`,
        [appointment.appointment_id]
      );
      if (!claimed.rows.length) continue;

      try {
        await notifyAppointmentReminder(appointment, appointment);
      } catch (error) {
        await query(
          'UPDATE appointments SET reminder_sent_at = NULL WHERE appointment_id = $1',
          [appointment.appointment_id]
        );
        console.error('Unable to send appointment reminder:', error.message);
      }
    }
  } catch (error) {
    console.error('Appointment reminder worker failed:', error.message);
  } finally {
    running = false;
  }
}

async function startAppointmentReminderWorker() {
  try {
    await query('SELECT reminder_sent_at FROM appointments LIMIT 0');
  } catch (error) {
    console.warn('Appointment reminder worker is disabled until the database migration is applied.');
    return null;
  }

  const timer = setInterval(sendDueReminders, 60 * 1000);
  timer.unref();
  sendDueReminders();
  return timer;
}

module.exports = { sendDueReminders, startAppointmentReminderWorker };