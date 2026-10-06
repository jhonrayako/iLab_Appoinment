const http = require('http');
const WebSocket = require('ws');
const { initRealtime, closeAll } = require('../src/realtime/socket');
const { signToken } = require('../src/utils/jwt');
const { notifyNewAppointment } = require('../src/services/notificationsService');

describe('appointment request notifications', () => {
  let server;

  afterEach(async () => {
    closeAll();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
  });

  test('sends new appointment requests to Admin and Staff role clients', async () => {
    server = http.createServer();
    initRealtime(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `ws://127.0.0.1:${server.address().port}/ws`;

    const connect = async (roleName) => {
      const socket = new WebSocket(`${url}?token=${encodeURIComponent(signToken({ sub: `test-${roleName}`, role_name: roleName }))}`);
      await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      return socket;
    };

    const [adminSocket, staffSocket] = await Promise.all([connect('Admin'), connect('Staff')]);
    const waitForRequest = (socket) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for appointment notification')), 2000);
      socket.on('message', (data) => {
        const event = JSON.parse(data.toString());
        if (event.type !== 'new_appointment_request') return;
        clearTimeout(timeout);
        resolve(event.data);
      });
    });
    const adminNotification = waitForRequest(adminSocket);
    const staffNotification = waitForRequest(staffSocket);

    await notifyNewAppointment(
      {
        appointment_id: 'appointment-123',
        status: 'Pending',
        topic: 'Tissue culture visit',
        start_time: '2026-10-02T01:00:00.000Z',
        facility_name: 'Main Research Lab',
      },
      { first_name: 'Jamie', last_name: 'Santos', email: 'jamie@example.com' }
    );

    const [adminEvent, staffEvent] = await Promise.all([adminNotification, staffNotification]);
    expect(adminEvent.appointment_id).toBe('appointment-123');
    expect(staffEvent).toEqual(adminEvent);
    adminSocket.close();
    staffSocket.close();
  });
});