const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const visitorRoutes = require('./visitorRoutes');
const adminRoutes = require('./adminRoutes');
const staffRoutes = require('./staffRoutes');
const chatbotRoutes = require('./chatbotRoutes');
const facilityService = require('../services/facilityService');
const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Mount all route groups under /api
 */

// Sample route checks
router.get('/visitors', (req, res) => {
  res.status(200).json({ status: 200, message: 'Visitors endpoint OK' });
});

router.get('/admin', (req, res) => {
  res.status(200).json({ status: 200, message: 'Admin endpoint OK' });
});

// Auth routes (public for visitor/admin login)
router.use('/auth', authRoutes);

// Visitor portal routes
router.use('/visitor', visitorRoutes);

// Admin portal routes
router.use('/admin', adminRoutes);

// Staff portal routes are restricted to Staff accounts at the route boundary.
router.use('/staff', staffRoutes);

// Chatbot routes
router.use('/chatbot', chatbotRoutes);

router.get('/content/homepage', asyncHandler(async (req, res) => {
  const defaultContent = {
    hero_title: 'Connecting communities with science-driven plant innovation.',
    hero_description: 'iLAB Guiguinto advances tissue culture, ornamental planting, and sustainable agriculture through research, field support, and public access programs in Bulacan.',
    mission_title: 'Supporting farmers, growers, and communities through accessible agricultural science.',
    mission_summary: 'iLAB Guiguinto helps local agricultural stakeholders and the public understand modern plant propagation, nursery systems, and science-based practices that can improve productivity and resilience.',
    phone_number: '0955 593 4054',
    email_address: 'ilabguiguinto@gmail.com',
    location: 'Guiguinto, Bulacan',
  };

  let customContent = {};
  let announcementRows = { rows: [] };
  let slideRows = { rows: [] };

  try {
    const contentResult = await query(
      `SELECT content FROM site_content WHERE page_key IN ('home', 'about', 'contact') ORDER BY page_key`
    );
    customContent = Object.assign({}, ...contentResult.rows.map((row) => row.content || {}));
  } catch (error) {
    customContent = {};
  }

  try {
    announcementRows = await query(
      `SELECT announcement_id, label, title, detail, created_at
       FROM announcements
       WHERE is_published = true
       ORDER BY created_at DESC`
    );
  } catch (error) {
    announcementRows = { rows: [] };
  }

  try {
    slideRows = await query(
      `SELECT slide_id, title, description, image_url, image_data, is_active, sort_order
       FROM homepage_slides
       WHERE is_active = true
       ORDER BY sort_order ASC, created_at DESC`
    );
  } catch (error) {
    slideRows = { rows: [] };
  }

  res.status(200).json({
    success: true,
    content: { ...defaultContent, ...customContent },
    announcements: announcementRows.rows,
    slides: slideRows.rows.map((slide) => ({
      slide_id: slide.slide_id,
      title: slide.title,
      description: slide.description,
      image: slide.image_url || slide.image_data,
      image_url: slide.image_url,
      image_data: slide.image_data,
    })),
  });
}));

router.get('/content/announcements', asyncHandler(async (req, res) => {
  try {
    const result = await query(
      `SELECT announcement_id, label, title, detail, created_at
       FROM announcements
       WHERE is_published = true
       ORDER BY created_at DESC`
    );
    res.status(200).json({ success: true, announcements: result.rows });
  } catch (error) {
    res.status(200).json({ success: true, announcements: [] });
  }
}));

// Public facility list used by visitor support workflows
router.get('/facilities', asyncHandler(async (req, res) => {
  const result = await facilityService.getAllFacilities({ isActive: true });
  res.status(200).json({ success: true, ...result });
}));

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
