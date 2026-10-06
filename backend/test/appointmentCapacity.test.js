const { getPeakOccupancy } = require('../src/services/appointmentsService');

describe('appointment capacity calculations', () => {
  const windowStart = '2026-10-02T00:00:00.000Z';
  const windowEnd = '2026-10-02T01:00:00.000Z';

  test('counts peak concurrent visits rather than every appointment touching the slot', () => {
    const appointments = [
      { start_time: '2026-10-02T00:00:00.000Z', end_time: '2026-10-02T00:20:00.000Z' },
      { start_time: '2026-10-02T00:20:00.000Z', end_time: '2026-10-02T00:40:00.000Z' },
      { start_time: '2026-10-02T00:40:00.000Z', end_time: '2026-10-02T01:00:00.000Z' },
    ];

    expect(getPeakOccupancy(appointments, windowStart, windowEnd)).toBe(1);
  });

  test('counts simultaneous visits at their shared peak', () => {
    const appointments = [
      { start_time: '2026-10-02T00:00:00.000Z', end_time: '2026-10-02T00:40:00.000Z' },
      { start_time: '2026-10-02T00:15:00.000Z', end_time: '2026-10-02T00:45:00.000Z' },
      { start_time: '2026-10-02T00:40:00.000Z', end_time: '2026-10-02T01:00:00.000Z' },
    ];

    expect(getPeakOccupancy(appointments, windowStart, windowEnd)).toBe(2);
  });
});