import { useCallback, useEffect, useState } from 'react';
import { formatVisitDate, localDateValue, visitorRequest } from '../visitorApi';

function MyAppointmentsPage({ visitorAuthState }) {
  const [appointments, setAppointments] = useState([]);
  const [rescheduleId, setRescheduleId] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const token = visitorAuthState.token;

  const refresh = useCallback(async () => {
    try {
      const result = await visitorRequest('/visitor/appointments?limit=100', { token });
      setAppointments(result.appointments || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const cancelAppointment = async (appointment) => {
    if (!window.confirm('Cancel this appointment request?')) return;
    setError('');
    setMessage('');
    try {
      await visitorRequest(`/visitor/appointments/${appointment.appointment_id}/cancel`, { token, method: 'DELETE' });
      setMessage('Your appointment has been cancelled. A cancellation notice will be sent to your email.');
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const beginReschedule = async (appointment) => {
    setRescheduleId(appointment.appointment_id);
    setRescheduleDate(localDateValue(new Date(appointment.start_time)));
    setSelectedSlot(null);
    setError('');
  };

  useEffect(() => {
    if (!rescheduleId || !rescheduleDate) return undefined;
    const appointment = appointments.find((item) => item.appointment_id === rescheduleId);
    if (!appointment) return undefined;
    let active = true;
    visitorRequest(`/visitor/availability?facilityId=${encodeURIComponent(appointment.facility_id)}&date=${encodeURIComponent(rescheduleDate)}`)
      .then((result) => { if (active) setSlots(result.slots || []); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [rescheduleId, rescheduleDate, appointments]);

  const saveReschedule = async (appointment) => {
    if (!selectedSlot) return;
    setError('');
    try {
      await visitorRequest(`/visitor/appointments/${appointment.appointment_id}/reschedule`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ newStartTime: selectedSlot.start, newEndTime: selectedSlot.end }),
      });
      setMessage('Your new time was requested. Capacity was checked again before saving.');
      setRescheduleId('');
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="visitor-workflow-page">
      <div className="container visitor-appointments-page">
        <header className="visitor-workflow-heading">
          <span className="visitor-eyebrow">YOUR VISIT HISTORY</span>
          <h1>My appointments</h1>
          <p>Review your requests, change an upcoming time, or open a confirmed visit pass.</p>
        </header>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {message && <div className="success-banner" role="status">{message}</div>}
        <div className="visitor-appointment-list">
          {appointments.map((appointment) => {
            const isFuture = new Date(appointment.start_time) > new Date();
            const canChange = isFuture && ['Pending', 'Confirmed'].includes(appointment.status);
            return (
              <article className="visitor-appointment" key={appointment.appointment_id}>
                <div className="visitor-appointment-main">
                  <span className={`visitor-appointment-status ${appointment.status.toLowerCase()}`}>{appointment.status}</span>
                  <h2>{appointment.facility_name}</h2>
                  <p>{appointment.topic || 'General visit'}</p>
                  <time>{formatVisitDate(appointment.start_time)}</time>
                </div>
                <div className="visitor-appointment-actions">
                  {canChange && <button className="button-ghost" type="button" onClick={() => beginReschedule(appointment)}>Reschedule</button>}
                  {canChange && <button className="visitor-cancel-button" type="button" onClick={() => cancelAppointment(appointment)}>Cancel request</button>}
                </div>
                {rescheduleId === appointment.appointment_id && (
                  <div className="visitor-reschedule">
                    <label htmlFor={`reschedule-date-${appointment.appointment_id}`}>New date</label>
                    <input id={`reschedule-date-${appointment.appointment_id}`} type="date" min={localDateValue()} value={rescheduleDate} onChange={(event) => { setRescheduleDate(event.target.value); setSelectedSlot(null); }} />
                    <div className="visitor-slot-grid">
                      {slots.map((slot) => <button key={slot.start} type="button" className={`visitor-slot${selectedSlot?.start === slot.start ? ' selected' : ''}`} disabled={!slot.available} onClick={() => setSelectedSlot(slot)}>
                        {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(slot.start))}
                      </button>)}
                    </div>
                    <div className="visitor-reschedule-actions">
                      <button className="button" type="button" disabled={!selectedSlot} onClick={() => saveReschedule(appointment)}>Save new time</button>
                      <button className="button-ghost" type="button" onClick={() => setRescheduleId('')}>Keep current time</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {!appointments.length && <p className="visitor-empty">You don’t have appointments yet.</p>}
        </div>
      </div>
    </section>
  );
}

export default MyAppointmentsPage;