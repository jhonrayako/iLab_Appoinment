import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatVisitDate, localDateValue, visitorRequest } from '../visitorApi';

function BookingPage({ visitorAuthState }) {
  const [facilities, setFacilities] = useState([]);
  const [facilityId, setFacilityId] = useState('');
  const [date, setDate] = useState(localDateValue());
  const [topic, setTopic] = useState('');
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    visitorRequest('/facilities')
      .then((result) => {
        const activeFacilities = (result.facilities || []).filter((facility) => facility.is_active);
        setFacilities(activeFacilities);
        setFacilityId(activeFacilities[0]?.facility_id || '');
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!facilityId || !date) return undefined;
    let active = true;
    setSelectedSlot(null);
    visitorRequest(`/visitor/availability?facilityId=${encodeURIComponent(facilityId)}&date=${encodeURIComponent(date)}`)
      .then((result) => { if (active) setSlots(result.slots || []); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [facilityId, date]);

  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.facility_id === facilityId),
    [facilities, facilityId]
  );

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!selectedSlot) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await visitorRequest('/visitor/appointments', {
        token: visitorAuthState.token,
        method: 'POST',
        body: JSON.stringify({
          facilityId,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          topic: topic.trim(),
        }),
      });
      setAppointment(result.appointment);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (appointment) {
    return (
      <section className="visitor-workflow-page">
        <div className="container">
          <div className="booking-confirmation">
            <span className="visitor-eyebrow">REQUEST RECEIVED</span>
            <h1>Your visit request is in.</h1>
            <p>We’ll email you when the iLAB team confirms your appointment.</p>
            <dl>
              <div><dt>Facility</dt><dd>{selectedFacility?.facility_name}</dd></div>
              <div><dt>When</dt><dd>{formatVisitDate(appointment.start_time)}</dd></div>
              <div><dt>Visit topic</dt><dd>{appointment.topic || topic}</dd></div>
              <div><dt>Status</dt><dd>{appointment.status}</dd></div>
            </dl>
            <Link className="button" to="/my-appointments">View my appointments</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="visitor-workflow-page">
      <div className="container visitor-booking-layout">
        <header className="visitor-workflow-heading">
          <span className="visitor-eyebrow">PLAN A VISIT / ILAB GUIGUINTO</span>
          <h1>Make room for a closer look.</h1>
          <p>Choose a facility and a time. Your request is checked against live appointment capacity when you submit.</p>
        </header>
        <form className="visitor-booking-form" onSubmit={submitBooking}>
          <div className="visitor-form-section">
            <span className="visitor-step">01</span>
            <div className="visitor-form-fields">
              <label htmlFor="booking-facility">Facility</label>
              <select id="booking-facility" value={facilityId} onChange={(event) => setFacilityId(event.target.value)} disabled={loading || !facilities.length} required>
                {facilities.map((facility) => <option key={facility.facility_id} value={facility.facility_id}>{facility.facility_name}</option>)}
              </select>
              {selectedFacility && <small>{selectedFacility.location}</small>}
            </div>
          </div>
          <div className="visitor-form-section">
            <span className="visitor-step">02</span>
            <div className="visitor-form-fields">
              <label htmlFor="booking-date">Preferred date</label>
              <input id="booking-date" type="date" min={localDateValue()} value={date} onChange={(event) => setDate(event.target.value)} required />
            </div>
          </div>
          <div className="visitor-form-section visitor-time-section">
            <span className="visitor-step">03</span>
            <div className="visitor-form-fields">
              <span className="visitor-field-label">Available times</span>
              <div className="visitor-slot-grid" aria-label="Available appointment times">
                {slots.filter((slot) => slot.available).map((slot) => (
                  <button
                    className={`visitor-slot${selectedSlot?.start === slot.start ? ' selected' : ''}`}
                    disabled={!slot.available}
                    key={slot.start}
                    onClick={() => setSelectedSlot(slot)}
                    type="button"
                  >
                    {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(slot.start))}
                  </button>
                ))}
                {(!slots.length || !slots.some((slot) => slot.available)) && <p className="visitor-empty">{loading ? 'Loading available facilities...' : 'No time slots are available for this date.'}</p>}
              </div>
            </div>
          </div>
          <div className="visitor-form-section">
            <span className="visitor-step">04</span>
            <div className="visitor-form-fields">
              <label htmlFor="booking-topic">What would you like to explore?</label>
              <textarea id="booking-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength="255" placeholder="For example, tissue culture or ornamental planting" required />
              <small>{topic.length}/255</small>
            </div>
          </div>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="visitor-booking-submit">
            <p>Requests are pending until the iLAB team confirms your visit.</p>
            <button className="button" type="submit" disabled={!selectedSlot || !topic.trim() || submitting}>
              {submitting ? 'Sending request...' : 'Request appointment'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default BookingPage;