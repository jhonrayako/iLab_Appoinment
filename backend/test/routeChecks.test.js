const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const { signToken } = require('../src/utils/jwt');
const { query, pool } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');

describe('Route checks', () => {
  const testUsers = {
    admin: { username: 'test_route_admin', email: 'test-route-admin@example.invalid' },
    staff: { username: 'test_route_staff', email: 'test-route-staff@example.invalid' },
  };
  let staffPassword;

  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Route checks must not run against a production database');
    }

    const rolesResult = await query(
      `SELECT role_name, role_id FROM roles WHERE role_name IN ('Admin', 'Staff')`
    );
    const roleIds = new Map(rolesResult.rows.map(({ role_name, role_id }) => [role_name, role_id]));
    if (!roleIds.has('Admin') || !roleIds.has('Staff')) {
      throw new Error('Run the database schema migration before route checks');
    }

    staffPassword = `route-test-${crypto.randomBytes(24).toString('hex')}`;
    const adminPassword = `route-test-${crypto.randomBytes(24).toString('hex')}`;
    const adminPasswordHash = await hashPassword(adminPassword);
    const staffPasswordHash = await hashPassword(staffPassword);

    await query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role_id)
       VALUES ($1, $2, $3, 'Route', 'Test Admin', $4)
       ON CONFLICT (username) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role_id = EXCLUDED.role_id,
         is_active = true`,
      [testUsers.admin.username, testUsers.admin.email, adminPasswordHash, roleIds.get('Admin')]
    );
    await query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role_id)
       VALUES ($1, $2, $3, 'Route', 'Test Staff', $4)
       ON CONFLICT (username) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role_id = EXCLUDED.role_id,
         is_active = true`,
      [testUsers.staff.username, testUsers.staff.email, staffPasswordHash, roleIds.get('Staff')]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  test.each([
    ['/', { message: 'Welcome to iLAB Guiguinto Backend API' }],
    ['/api/visitors', { status: 200, message: 'Visitors endpoint OK' }],
    ['/api/admin', { status: 200, message: 'Admin endpoint OK' }],
  ])('GET %s returns HTTP 200 with confirmation JSON', async (path, body) => {
    await request(app)
      .get(path)
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(body);
  });

  test('requests from unconfigured browser origins receive an explicit CORS rejection', async () => {
    await request(app)
      .get('/api/health')
      .set('Origin', 'https://unconfigured-origin.example')
      .expect(403);
  });

  test('readiness checks the database and required application tables', async () => {
    await request(app)
      .get('/ready')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect(({ body }) => {
        expect(body.status).toBe('ready');
        expect(body.timestamp).toBeTruthy();
      });
  });

  test('staff operations require authentication', async () => {
    await request(app).get('/api/staff/dashboard').expect(401);
  });

  test('staff account can log in', async () => {
    const response = await request(app)
      .post('/api/auth/staff/login')
      .send({ username: testUsers.staff.username, password: staffPassword })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.user.role_name).toBe('Staff');
    expect(response.body.token).toBeTruthy();
  });

  test.each(['Visitor', 'Admin'])(
    'staff operations reject %s role tokens',
    async (roleName) => {
      const token = signToken({ sub: 'test-user', role_name: roleName });
      await request(app)
        .get('/api/staff/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
  );

  test('staff role cannot access admin analytics', async () => {
    const token = signToken({ sub: 'test-staff', role_name: 'Staff' });
    await request(app)
      .get('/api/admin/analytics/visitor-stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  test.each(['Visitor', 'Staff'])('admin notifications reject %s role tokens', async (roleName) => {
    const token = signToken({ sub: `test-${roleName}`, role_name: roleName });
    await request(app)
      .get('/api/admin/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  test('password reset never accepts an email and new password as direct proof', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'visitor@example.com', newPassword: 'new-password-123' })
      .expect(404);
  });

  test('password reset rejects invalid recovery requests before database access', async () => {
    await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: 'not-an-email' })
      .expect(400);
    await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token: '', newPassword: 'short' })
      .expect(400);
  });

  test('contact submissions require valid visitor contact details', async () => {
    await request(app)
      .post('/api/visitor/contact')
      .send({ name: 'A', email: 'invalid', message: 'Hi' })
      .expect(400);
  });

  test('public homepage content is available without admin authentication', async () => {
    const response = await request(app)
      .get('/api/content/homepage')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.success).toBe(true);
    expect(response.body.content).toBeTruthy();
    expect(response.body.content.hero_title).toBeTruthy();
    expect(Array.isArray(response.body.announcements)).toBe(true);
  });

  test('CMS reads and writes site content using the page JSON schema', async () => {
    const adminUser = await query(
      `SELECT user_id FROM users WHERE username = $1 LIMIT 1`,
      [testUsers.admin.username]
    );
    const adminToken = signToken({ sub: adminUser.rows[0].user_id, role_name: 'Admin' });
    const original = await request(app)
      .get('/api/admin/content/site')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updatedContent = {
      hero_title: `CMS schema check ${Date.now()}`,
      hero_description: 'This homepage description is managed in the CMS.',
      mission_title: 'CMS-managed mission headline.',
      mission_summary: 'This mission summary should be visible to visitors.',
      phone_number: '0917 123 4567',
      email_address: 'cms-check@example.invalid',
      location: 'CMS Test Location',
    };
    try {
      const saveResponse = await request(app)
        .put('/api/admin/content/site')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatedContent)
        .expect(200);
      for (const [key, value] of Object.entries(updatedContent)) {
        expect(saveResponse.body.content[key]).toBe(value);
      }

      const publicResponse = await request(app)
        .get('/api/content/homepage')
        .expect(200);
      for (const [key, value] of Object.entries(updatedContent)) {
        expect(publicResponse.body.content[key]).toBe(value);
      }
    } finally {
      await request(app)
        .put('/api/admin/content/site')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(original.body.content)
        .expect(200);
    }
  });

  test('uploaded CMS slide image is returned to the public homepage carousel', async () => {
    const adminUser = await query(
      `SELECT user_id FROM users WHERE username = $1 LIMIT 1`,
      [testUsers.admin.username]
    );
    const adminToken = signToken({ sub: adminUser.rows[0].user_id, role_name: 'Admin' });
    const imageData = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    let slideId;

    try {
      const createResponse = await request(app)
        .post('/api/admin/content/slides')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `CMS image check ${Date.now()}`,
          description: 'Temporary carousel image regression check.',
          imageData,
          isActive: true,
        })
        .expect(201);
      slideId = createResponse.body.slide.slide_id;
      expect(createResponse.body.slide.image_data).toBeUndefined();
      expect(createResponse.body.slide.image_url).toMatch(new RegExp(`/api/content/slides/${slideId}/image`));

      const homepageResponse = await request(app)
        .get('/api/content/homepage')
        .expect(200);
      const publicSlide = homepageResponse.body.slides.find((slide) => slide.slide_id === slideId);

      expect(publicSlide).toBeTruthy();
      expect(publicSlide.image).toMatch(new RegExp(`/api/content/slides/${slideId}/image`));
      expect(publicSlide.image_data).toBeUndefined();

      const imageResponse = await request(app)
        .get(publicSlide.image)
        .expect(200)
        .expect('Content-Type', /image\/gif/);
      expect(imageResponse.body).toEqual(Buffer.from(imageData.split(',')[1], 'base64'));

      const replacementImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WioAAAAASUVORK5CYII=';
      await request(app)
        .put(`/api/admin/content/slides/${slideId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageUrl: '', imageData: replacementImageData })
        .expect(200);

      const updatedHomepage = await request(app)
        .get('/api/content/homepage')
        .expect(200);
      const updatedSlide = updatedHomepage.body.slides.find((slide) => slide.slide_id === slideId);
      const updatedImageResponse = await request(app)
        .get(updatedSlide.image)
        .expect(200)
        .expect('Content-Type', /image\/png/);
      expect(updatedImageResponse.body).toEqual(Buffer.from(replacementImageData.split(',')[1], 'base64'));
    } finally {
      if (slideId) {
        await request(app)
          .delete(`/api/admin/content/slides/${slideId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      }
    }
  });
});