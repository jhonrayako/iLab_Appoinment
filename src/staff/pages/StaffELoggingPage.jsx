import { useCallback, useEffect, useRef, useState } from 'react';
import { formatStaffDate, localDateValue, staffRequest } from '../staffApi';

function QrCamera({ onScan, onClose }) {
  const videoRef = useRef(null);
  const callbackRef = useRef(onScan);
  const [cameraError, setCameraError] = useState('');
  callbackRef.current = onScan;

  useEffect(() => {
    let stream;
    let timer;
    let detecting = false;
    let active = true;
    const start = async () => {
      if (!('BarcodeDetector' in window)) {
        setCameraError('QR camera scanning is not supported in this browser. Enter the pass code below instead.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access requires a secure connection. Enter the pass code below instead.');
        return;
      }
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        timer = window.setInterval(async () => {
          if (detecting || !videoRef.current?.videoWidth) return;
          detecting = true;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length && active) {
              active = false;
              callbackRef.current(codes[0].rawValue);
              onClose();
            }
          } catch {
            setCameraError('Could not read this QR code. Hold the pass steady and try again.');
          } finally {
            detecting = false;
          }
        }, 350);
      } catch {
        setCameraError('Camera permission was unavailable. Enter the pass code below instead.');
      }
    };
    start();
    return () => {
      active = false;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onClose]);

  return (
    <div className="staff-camera-panel">
      <video ref={videoRef} muted playsInline aria-label="Live QR code camera view" />
      {cameraError && <p role="status">{cameraError}</p>}
      {!cameraError && <p>Position the visitor pass inside the camera view.</p>}
    </div>
  );
}

function getQrToken(rawValue) {
  const match = rawValue.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0] || rawValue.trim();
}

function StaffELoggingPage() {
  const [date, setDate] = useState(localDateValue());
  const [appointments, setAppointments] = useState([]);
  const [passCode, setPassCode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const result = await staffRequest(`/appointments?date=${date}`);
      setAppointments(result.appointments || []);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [date]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const performAction = async (appointment, action, qrToken = null) => {
    const id = appointment?.appointment_id || appointment?.qr_token || qrToken;
    setBusyId(id);
    setFeedback('');
    setError('');
    try {
      const body = qrToken ? { qrToken } : { appointmentId: appointment.appointment_id };
      const result = await staffRequest(action === 'check-in' ? '/check-in' : '/check-out', {
        method: 'POST', body: JSON.stringify(body),
      });
      const visitorName = appointment ? `${appointment.first_name} ${appointment.last_name}` : 'Visitor';
      const timestamp = action === 'check-in' ? result.log?.check_in_time : result.log?.check_out_time;
      setFeedback(`${visitorName} ${action === 'check-in' ? 'checked in' : 'checked out'} at ${formatStaffDate(timestamp)}.`);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  const resolveQr = async (rawValue) => {
    const qrToken = getQrToken(rawValue);
    try {
      const result = await staffRequest('/resolve-pass', {
        method: 'POST', body: JSON.stringify({ qrToken }),
      });
      await performAction(result.appointment, result.action, qrToken);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const activeCount = appointments.filter((appointment) => appointment.check_in_time && !appointment.check_out_time).length;

  return (
    <section className="staff-page">
      <div className="staff-page-heading">
        <div><span className="staff-overline">ARRIVAL / DEPARTURE</span><h1>Visitor log</h1></div>
        <label className="staff-date-picker">Log date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
      {error && <div className="staff-error" role="alert">{error}</div>}
      {feedback && <div className="staff-success" role="status">{feedback}</div>}
      <div className="staff-logging-grid">
        <section className="staff-section staff-scan-section">
          <div className="staff-section-heading">
            <div><span className="staff-overline">DIGITAL PASS</span><h2>Scan visitor pass</h2></div>
            <span className="staff-scan-icon" aria-hidden="true">⌗</span>
          </div>
          {cameraOpen ? <QrCamera onScan={resolveQr} onClose={() => setCameraOpen(false)} /> : (
            <div className="staff-scan-placeholder"><span aria-hidden="true">▦</span><p>Use the camera or enter the pass code.</p></div>
          )}
          <div className="staff-scan-actions">
            <button className="staff-primary-button" type="button" onClick={() => { setError(''); setCameraOpen((open) => !open); }}>
              {cameraOpen ? 'Close camera' : 'Open camera'}
            </button>
            <form onSubmit={(event) => { event.preventDefault(); if (passCode.trim()) resolveQr(passCode); }}>
              <label className="visually-hidden" htmlFor="staff-pass-code">Pass code</label>
              <input id="staff-pass-code" value={passCode} onChange={(event) => setPassCode(event.target.value)} placeholder="Paste or scan pass code" />
              <button type="submit" className="staff-filter-reset">Match pass</button>
            </form>
          </div>
        </section>
        <section className="staff-section staff-flow-summary">
          <span className="staff-overline">TODAY / CHECKED IN</span>
          <strong>{activeCount}</strong>
          <p>Visitors currently on site from this day’s appointment list.</p>
        </section>
      </div>
      <section className="staff-section staff-log-section">
        <div className="staff-section-heading">
          <div><span className="staff-overline">{appointments.length} SCHEDULED RECORDS</span><h2>Today’s arrivals</h2></div>
        </div>
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead><tr><th>Visitor</th><th>Appointment</th><th>Check-in</th><th>Check-out</th><th>Action</th></tr></thead>
            <tbody>
              {appointments.map((appointment) => {
                const isActive = Boolean(appointment.check_in_time && !appointment.check_out_time);
                const canCheckIn = appointment.status === 'Confirmed' && !appointment.check_in_time;
                const canCheckOut = isActive;
                return (
                  <tr key={appointment.appointment_id}>
                    <td><strong>{appointment.first_name} {appointment.last_name}</strong><small>{appointment.email}</small></td>
                    <td>{appointment.topic || 'General visit'}<small>{appointment.status} · {formatStaffDate(appointment.start_time)}</small></td>
                    <td>{formatStaffDate(appointment.check_in_time)}</td>
                    <td>{formatStaffDate(appointment.check_out_time)}</td>
                    <td>{canCheckIn || canCheckOut ? <button className="staff-row-action staff-log-action" type="button" disabled={busyId === appointment.appointment_id} onClick={() => performAction(appointment, canCheckIn ? 'check-in' : 'check-out')}>
                      {busyId === appointment.appointment_id ? 'Saving...' : canCheckIn ? 'Check in' : 'Check out'} <span>→</span>
                    </button> : <span className="staff-log-closed">{appointment.check_out_time ? 'Complete' : appointment.status === 'Confirmed' ? 'Checked in' : 'Not eligible'}</span>}</td>
                  </tr>
                );
              })}
              {!appointments.length && <tr><td colSpan="5" className="staff-table-empty">No appointments scheduled for this date.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default StaffELoggingPage;