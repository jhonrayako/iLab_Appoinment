/**
 * Stub notification service with stable interface
 * Can be swapped for SendGrid, Twilio, etc. without changing callers
 */
const { query } = require('../config/db');
const { broadcastToRole } = require('../realtime/socket');

const sendEmail = async ({ to, subject, body }) => {
  if (!to || !subject || !body) {
    throw new Error('Missing email parameters: to, subject, body');
  }

  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
    if (!response.ok) throw new Error(`SendGrid rejected the message (${response.status})`);
    return { success: true, messageId: response.headers.get('x-message-id') || 'sendgrid' };
  }

  // Development fallback when notification credentials are not configured.
  console.log(`📧 [Email] To: ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Body: ${body}`);

  // TODO: Integrate with SendGrid/SES
  // const sgMail = require('@sendgrid/mail');
  // await sgMail.send({ to, from: 'noreply@ilab.gov.ph', subject, html: body });

  return { success: true, messageId: 'stub-' + Date.now() };
};

const sendSms = async ({ to, message }) => {
  if (!to || !message) {
    throw new Error('Missing SMS parameters: to, message');
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    const credentials = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const body = new URLSearchParams({ From: process.env.TWILIO_FROM_NUMBER, To: to, Body: message });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) throw new Error(`Twilio rejected the message (${response.status})`);
    const result = await response.json();
    return { success: true, messageId: result.sid };
  }

  // Development fallback when notification credentials are not configured.
  console.log(`📱 [SMS] To: ${to}`);
  console.log(`   Message: ${message}`);

  // TODO: Integrate with Twilio/Semaphore
  // const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // await twilio.messages.create({ body: message, from: '+1234567890', to });

  return { success: true, messageId: 'stub-' + Date.now() };
};

/**
 * Notify on booking confirmation
 */
const notifyBookingConfirmation = async (appointment, user) => {
  const subject = 'Appointment Confirmed - iLAB Guiguinto';
  const body = `
Dear ${user.first_name},

Your appointment has been confirmed!

Date: ${new Date(appointment.start_time).toLocaleString()}
Topic: ${appointment.topic || 'General Visit'}
Facility: ${appointment.facility_name || 'iLAB Guiguinto'}

Your visit pass is available in your iLAB account and expires after the appointment schedule.

Thank you for visiting iLAB Guiguinto.

Best regards,
iLAB Guiguinto Management
  `;

  await sendEmail({
    to: user.email,
    subject,
    body,
  });

  if (user.phone) {
    await sendSms({
      to: user.phone,
      message: `Your appointment at iLAB Guiguinto on ${new Date(appointment.start_time).toLocaleDateString()} is confirmed. Open your iLAB account to view your visit pass.`,
    });
  }
};

/**
 * Notify on booking cancellation
 */
const notifyBookingCancellation = async (appointment, user) => {
  const subject = 'Appointment Cancelled - iLAB Guiguinto';
  const body = `
Dear ${user.first_name},

Your appointment has been cancelled.

Original Date: ${new Date(appointment.start_time).toLocaleString()}

If you have any questions, please contact us.

Best regards,
iLAB Guiguinto Management
  `;

  await sendEmail({
    to: user.email,
    subject,
    body,
  });
};

/**
 * Notify admin of new appointment
 */
const notifyNewAppointment = async (appointment, user) => {
  const payload = {
    appointment_id: appointment.appointment_id,
    status: appointment.status || 'Pending',
    type: 'new',
    topic: appointment.topic,
    start_time: appointment.start_time,
    facility_name: appointment.facility_name || appointment.facility?.facility_name,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
  };

  broadcastToRole('Admin', 'new_appointment_request', payload);
  broadcastToRole('Staff', 'new_appointment_request', payload);

  const subject = 'New Appointment - iLAB Guiguinto';
  const body = `
New appointment created:

Visitor: ${user.first_name} ${user.last_name}
Email: ${user.email}
Date: ${new Date(appointment.start_time).toLocaleString()}
Topic: ${appointment.topic || 'General Visit'}
Facility: ${appointment.facility_name || 'iLAB Guiguinto'}

Please confirm if needed.
  `;

  console.log(`\n🔔 [In-App Notification] Admin: ${subject}`);
  console.log(`   ${body}`);
};

const getRecentAppointmentNotifications = async () => {
  const result = await query(
    `SELECT a.appointment_id, a.status, a.topic, a.start_time,
            COALESCE(a.updated_at, a.created_at) AS occurred_at,
            u.first_name, u.last_name, u.email, f.facility_name
     FROM appointments a
     JOIN users u ON u.user_id = a.user_id
     JOIN facilities f ON f.facility_id = a.facility_id
     WHERE a.status IN ('Pending', 'Confirmed', 'Cancelled')
       AND COALESCE(a.updated_at, a.created_at) >= NOW() - INTERVAL '7 days'
     ORDER BY COALESCE(a.updated_at, a.created_at) DESC
     LIMIT 50`
  );

  return result.rows.map((appointment) => ({
    ...appointment,
    type: appointment.status === 'Pending' ? 'new' : appointment.status.toLowerCase(),
  }));
};

/**
 * Capacity threshold alert
 */
const notifyCapacityThreshold = async (facility, currentCount, maxCapacity) => {
  const message = `Facility '${facility.facility_name}' is at capacity: ${currentCount}/${maxCapacity}`;
  console.log(`\n⚠️  [Capacity Alert] ${message}`);
  
  // TODO: Send in-app notification to Admin
};

/**
 * Appointment reminder (pre-visit)
 */
const notifyAppointmentReminder = async (appointment, user) => {
  const subject = 'Reminder: Your Appointment at iLAB Guiguinto';
  const body = `
Dear ${user.first_name},

This is a reminder about your upcoming appointment:

Date: ${new Date(appointment.start_time).toLocaleString()}
Topic: ${appointment.topic || 'General Visit'}

Please arrive 5 minutes early.

Best regards,
iLAB Guiguinto Management
  `;

  await sendEmail({
    to: user.email,
    subject,
    body,
  });
};

module.exports = {
  sendEmail,
  sendSms,
  notifyBookingConfirmation,
  notifyBookingCancellation,
  notifyNewAppointment,
  getRecentAppointmentNotifications,
  notifyCapacityThreshold,
  notifyAppointmentReminder,
};
