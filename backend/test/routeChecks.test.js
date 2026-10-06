const request = require('supertest');
const app = require('../src/app');
const { signToken } = require('../src/utils/jwt');
const { query } = require('../src/config/db');

describe('Route checks', () => {
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

  test('staff operations require authentication', async () => {
    await request(app).get('/api/staff/dashboard').expect(401);
  });

  test('default seeded staff account can log in', async () => {
    const response = await request(app)
      .post('/api/auth/staff/login')
      .send({ username: 'staff', password: 'staff123' })
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
    const adminUser = await query(`SELECT user_id FROM users WHERE username = 'admin' LIMIT 1`);
    const adminToken = signToken({ sub: adminUser.rows[0].user_id, role_name: 'Admin' });
    const original = await request(app)
      .get('/api/admin/content/site')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updatedTitle = `CMS schema check ${Date.now()}`;
    try {
      const saveResponse = await request(app)
        .put('/api/admin/content/site')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hero_title: updatedTitle })
        .expect(200);
      expect(saveResponse.body.content.hero_title).toBe(updatedTitle);

      const publicResponse = await request(app)
        .get('/api/content/homepage')
        .expect(200);
      expect(publicResponse.body.content.hero_title).toBe(updatedTitle);
    } finally {
      await request(app)
        .put('/api/admin/content/site')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hero_title: original.body.content.hero_title || 'Connecting communities with science-driven plant innovation.' })
        .expect(200);
    }
  });

  test('uploaded CMS slide image is returned to the public homepage carousel', async () => {
    const adminUser = await query(`SELECT user_id FROM users WHERE username = 'admin' LIMIT 1`);
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

      const homepageResponse = await request(app)
        .get('/api/content/homepage')
        .expect(200);
      const publicSlide = homepageResponse.body.slides.find((slide) => slide.slide_id === slideId);

      expect(publicSlide).toBeTruthy();
      expect(publicSlide.image).toBe(imageData);
      expect(publicSlide.image_data).toBe(imageData);
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