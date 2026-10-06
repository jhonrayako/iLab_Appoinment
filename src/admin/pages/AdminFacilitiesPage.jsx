const facilities = [
  { name: 'iLAB Guiguinto Main Facility', location: 'Bulacan', capacity: '120', status: 'Active' },
  { name: 'Propagation Lab', location: 'Bulacan', capacity: '25', status: 'Active' },
  { name: 'Ornamental Demo Area', location: 'Bulacan', capacity: '18', status: 'Inactive' },
];

function AdminFacilitiesPage() {
  return (
    <div className="admin-page">
      <div className="section-header">
        <div>
          <span className="kicker">Facilities</span>
          <h1>Facility management</h1>
        </div>
      </div>

      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Capacity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((facility) => (
              <tr key={facility.name}>
                <td>{facility.name}</td>
                <td>{facility.location}</td>
                <td>{facility.capacity}</td>
                <td><span className={`badge ${facility.status.toLowerCase() === 'active' ? 'confirmed' : 'cancelled'}`}>{facility.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminFacilitiesPage;
