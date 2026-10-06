-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
    CREATE TYPE user_role_enum AS ENUM ('Admin', 'Visitor', 'Researcher');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status_enum') THEN
    CREATE TYPE appointment_status_enum AS ENUM ('Pending', 'Confirmed', 'Cancelled', 'Completed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sentiment_label_enum') THEN
    CREATE TYPE sentiment_label_enum AS ENUM ('Positive', 'Neutral', 'Negative');
  END IF;
END $$;

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
  role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(role_id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  reset_token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- Facilities Table
CREATE TABLE IF NOT EXISTS facilities (
  facility_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  max_capacity INT NOT NULL CHECK (max_capacity > 0),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facilities_is_active ON facilities(is_active);

-- Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
  appointment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  facility_id UUID NOT NULL REFERENCES facilities(facility_id),
  topic VARCHAR(255),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status appointment_status_enum DEFAULT 'Pending',
  qr_token UUID,
  qr_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_appointments_facility_time ON appointments(facility_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_qr_token ON appointments(qr_token);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS qr_expires_at TIMESTAMPTZ;
ALTER TABLE appointments ALTER COLUMN qr_token DROP DEFAULT;
UPDATE appointments SET qr_expires_at = end_time WHERE qr_token IS NOT NULL AND qr_expires_at IS NULL;

-- Logs Table (Check-in/out)
CREATE TABLE IF NOT EXISTS logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(appointment_id),
  check_in_time TIMESTAMPTZ NOT NULL,
  check_out_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_appointment_id ON logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_logs_check_in_time ON logs(check_in_time);

-- Feedback Table
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  raw_message TEXT NOT NULL,
  sentiment_label sentiment_label_enum NOT NULL,
  sentiment_score NUMERIC(4, 3),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_sentiment_label ON feedback(sentiment_label);
CREATE INDEX IF NOT EXISTS idx_feedback_submitted_at ON feedback(submitted_at);

-- Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  action_performed VARCHAR(100) NOT NULL,
  extended_details JSONB,
  ip_address VARCHAR(45),
  recorded_timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_performed ON audit_log(action_performed);
CREATE INDEX IF NOT EXISTS idx_audit_log_recorded_timestamp ON audit_log(recorded_timestamp);

CREATE TABLE IF NOT EXISTS chatbot_faq (
  faq_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL UNIQUE,
  answer TEXT NOT NULL,
  keywords TEXT[] DEFAULT ARRAY[]::TEXT[],
  training_phrases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  category VARCHAR(50) DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chatbot_faq
  ADD COLUMN IF NOT EXISTS training_phrases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_chatbot_faq_category ON chatbot_faq(category);
CREATE INDEX IF NOT EXISTS idx_chatbot_faq_active ON chatbot_faq(is_active);

CREATE TABLE IF NOT EXISTS chat_conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  session_id VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message ON chat_conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('visitor', 'bot', 'admin')),
  sender_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS site_content (
  page_key VARCHAR(80) PRIMARY KEY CHECK (page_key IN ('home', 'about', 'contact')),
  content JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO site_content (page_key, content)
VALUES
  ('home', '{
    "hero_title": "Connecting communities with science-driven plant innovation.",
    "hero_description": "iLAB Guiguinto advances tissue culture, ornamental planting, and sustainable agriculture through research, field support, and public access programs in Bulacan."
  }'::JSONB),
  ('about', '{
    "mission_title": "Supporting farmers, growers, and communities through accessible agricultural science.",
    "mission_summary": "iLAB Guiguinto helps local agricultural stakeholders and the public understand modern plant propagation, nursery systems, and science-based practices that can improve productivity and resilience."
  }'::JSONB),
  ('contact', '{
    "phone_number": "0955 593 4054",
    "email_address": "ilabguiguinto@gmail.com",
    "location": "Guiguinto, Bulacan"
  }'::JSONB)
ON CONFLICT (page_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS announcements (
  announcement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  detail TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(is_published, created_at DESC);

CREATE TABLE IF NOT EXISTS homepage_slides (
  slide_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(500),
  image_data TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homepage_slides_active ON homepage_slides(is_active, sort_order, created_at);

INSERT INTO announcements (label, title, detail, is_published)
SELECT seed.label, seed.title, seed.detail, true
FROM (VALUES
  ('Facility update', 'Tissue culture laboratory orientation is available for public groups.', 'Ask the support desk for the latest access and safety information.'),
  ('Community note', 'Local growers can learn about ornamental planting support programs.', 'Bring your growing questions to the public information desk.'),
  ('Service notice', 'Automated iLAB chatbot support is available 24/7.', 'Visitor messages are also shared with an administrator during office hours.')
) AS seed(label, title, detail)
WHERE NOT EXISTS (
  SELECT 1 FROM announcements existing WHERE existing.title = seed.title
);

INSERT INTO homepage_slides (title, description, image_url, is_active, sort_order)
SELECT seed.title, seed.description, seed.image_url, true, seed.sort_order
FROM (VALUES
  ('iLAB Guiguinto opens new tissue culture laboratory', 'Supporting ornamental plants, local growers, and agricultural innovation in Bulacan.', '/images/ilab-news.jpg', 0),
  ('Growing ornamental plants in Guiguinto', 'Learn how local growers care for and develop plants for the community.', '/images/ilab-news.webp', 1),
  ('Growing healthy plants through tissue culture', 'Discover the laboratory work behind stronger ornamental plants and sustainable growing.', '/images/ilab-tissue-culture.webp', 2),
  ('Welcome to the iLAB Guiguinto facility', 'Explore the welcoming spaces and plant laboratory facilities supporting local innovation.', '/images/ilab-carousel-1.jpg', 3),
  ('Where science and community meet', 'See tissue culture research in action at iLAB Guiguinto.', '/images/ilab-carousel-2.jpg', 4)
) AS seed(title, description, image_url, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM homepage_slides existing WHERE existing.title = seed.title
);

INSERT INTO chatbot_faq (question, answer, keywords, category, is_active) VALUES
('What are your opening hours?', 'The public support desk is available Monday to Saturday, 7:00 AM to 6:00 PM. The iLAB chatbot is available 24/7.', ARRAY['hours','open','time','close','schedule'], 'general', true),
('Where are you located?', 'iLAB Guiguinto is located in Guiguinto, Bulacan, Philippines.', ARRAY['location','where','address','map'], 'general', true),
('What is the facility address?', 'The iLAB Guiguinto facility is at RVQ7+938, Spur Road, Guiguinto, Bulacan.', ARRAY['address','location','spur','road','direction'], 'contact', true),
('How can I contact iLAB Guiguinto?', 'You can call 0955 593 4054 or email ilabguiguinto@gmail.com. The facility address is RVQ7+938, Spur Road, Guiguinto, Bulacan.', ARRAY['contact','phone','telephone','email','call','message'], 'contact', true),
('How can I request a visit?', 'Log in and ask the iLAB chatbot to create a visit letter with your preferred facility, date, time, and purpose.', ARRAY['book','appointment','schedule','visit','letter'], 'visit-letter', true),
('How do I visit iLAB?', 'Hello _____! Thank you for reaching out and for your interest in our services. To further assist you, please submit your letter of intent through the Office of the Municipal Mayor, Hon. Ambrosio C. Cruz Jr., via mayorsofficegto@gmail.com.', ARRAY['visit','ilab','tour','letter','mayor'], 'visit-letter', true),
('How do I create a visit letter?', 'The iLAB chatbot will collect your visit details and download a letter that you can print and send to the public support desk for confirmation.', ARRAY['letter','request','visit','chatbot'], 'visit-letter', true),
('What services do you offer?', 'iLAB Guiguinto supports tissue culture, ornamental plant development, sustainable agriculture, public learning, technical assistance, and agriculture-related innovation.', ARRAY['service','program','tissue','plant','agriculture','research'], 'general', true),
('Who can use iLAB services?', 'iLAB Guiguinto provides public learning, technical assistance, and agriculture support for students and teachers, growers and farmers, community organizations, and other relevant stakeholders.', ARRAY['public','student','teacher','grower','farmer','community','who'], 'general', true),
('What is iLAB Guiguinto?', 'iLAB Guiguinto is a DOST-backed facility focused on tissue culture, ornamental plant development, and agriculture-related innovation for communities in Bulacan and nearby areas.', ARRAY['about','dost','facility','mission','research'], 'general', true),
('What can I ask the iLAB chatbot?', 'I can help with questions about iLAB Guiguinto services and programs, hours and location, contact details, who can use our services, and how to request a visit or appointment. I cannot reliably answer questions outside iLAB topics.', ARRAY['chatbot topics','supported topics','chatbot capabilities'], 'general', true)
ON CONFLICT (question) DO NOTHING;

UPDATE chatbot_faq
SET training_phrases = ARRAY(
  SELECT DISTINCT phrase
  FROM unnest(
    ARRAY(
      SELECT phrase
      FROM unnest(chatbot_faq.training_phrases) AS existing(phrase)
      WHERE phrase !~* E'\\m(ano|anong|paano|saan|nasaan|kayo|ninyo|ba|ang|mga|puwede|pwede|maaari|sino|bukas|gusto|serbisyo|halaman|pagsasaka|estudyante|guro|magsasaka|komunidad|liham|oras|banda|opisina|kalsada|kailangan|tumatanggap|puwedeng|makontak|tumawag|bumisita|magpa|mag-request|pumunta|pahingi|layunin|namin|natin|niyo|mong|tayo|kami|naming|ito|dito|mo|ako|atin|ninyo|niya|para sa|pwede|daw|po|rito|doon|inyo|ninyo|amin|ating|paki|gusto|kailangan|puwede|maaaring|maari|sino-sino|bakit|alin|ilan|saan|kanino|ano ang|pakiusap|pumunta|pagbisita|pagbisita|magpa-appointment|magpa-schedule|mag-book|makakontak|kokontakin|ipapasa|pag-aaralan|ninyong|ninyo)\\M'
    ) || CASE question
  WHEN 'What are your opening hours?' THEN ARRAY[
    'What are the public desk hours?', 'When is the public desk open?',
    'What time do you close?', 'What time does the support desk open?',
    'Are you open on Sundays?', 'Can I contact the public desk on weekends?',
    'What are the iLAB office hours?', 'When can I call iLAB?',
    'What days can visitors contact the public desk?', 'Is the facility open on Saturday?',
    'What time does the public desk start?', 'When does the office close?'
  ]::TEXT[]
  WHEN 'Where are you located?' THEN ARRAY[
    'Where can I find iLAB?', 'Where is the iLAB facility?',
    'How do I get to the iLAB site?', 'What town is iLAB in?',
    'Can you tell me where iLAB is?', 'What is the location of the laboratory?',
    'Which municipality is iLAB in?', 'Where is the iLAB office?',
    'How can I find your facility?', 'Is iLAB located in Guiguinto?',
    'Where is your laboratory based?', 'Please share the iLAB location.'
  ]::TEXT[]
  WHEN 'What is the facility address?' THEN ARRAY[
    'What is the street address?', 'What address should I enter in my map?',
    'Can you share the facility location code?', 'What is the iLAB address in Guiguinto?',
    'What is the plus code for iLAB?', 'Please provide the exact facility address.',
    'What road is the facility on?', 'Can you give me directions to the facility?',
    'What is the complete address?', 'Where is Spur Road?',
    'What address should I use for navigation?', 'Is there a map location for iLAB?'
  ]::TEXT[]
  WHEN 'How can I contact iLAB Guiguinto?' THEN ARRAY[
    'What is your email address?', 'How can I reach the iLAB team?',
    'What number can I call for information?', 'Who should I contact for help?',
    'What is the office phone number?', 'How do I send an inquiry?',
    'Can I call the iLAB office?', 'How do I message iLAB?',
    'What is the iLAB contact number?', 'Where can I send my question?',
    'How can I get in touch with the facility?', 'Please share your contact details.'
  ]::TEXT[]
  WHEN 'How can I request a visit?' THEN ARRAY[
    'How do I schedule a visit?', 'Can I reserve a time to visit?',
    'I want to arrange a visit to iLAB.', 'Can I book a visit to the facility?',
    'How can I request a visit schedule?', 'Can I make an appointment online?',
    'How do I request an appointment?', 'Can I schedule a tour of the laboratory?',
    'How do I book a facility visit?', 'I would like to arrange a visit.',
    'Where can I book an appointment?', 'Can visitors reserve a time slot?'
  ]::TEXT[]
  WHEN 'How do I visit iLAB?' THEN ARRAY[
    'How can our group visit the iLAB facility?', 'Where do I send a letter of intent?',
    'Can our school arrange a laboratory tour?', 'How do I arrange a group visit?',
    'Where should we submit our visit request?', 'What is the process for visiting iLAB?',
    'What requirements are needed for a visit?', 'Do I need a letter of intent?',
    'How can I request permission to visit?', 'What should we do before visiting iLAB?',
    'How can a school group visit the facility?', 'Who should I contact to arrange a visit?'
  ]::TEXT[]
  WHEN 'How do I create a visit letter?' THEN ARRAY[
    'Can the chatbot prepare my visit letter?', 'How do I submit my letter for a visit?',
    'Can I generate a letter for my appointment?', 'What details go in the visit letter?',
    'How can I get a visit intent letter?', 'Where can I prepare my letter of intent?',
    'How do I create a letter of intent?', 'Can I download a visit request letter?',
    'What information should I include in my request letter?', 'How do I prepare a visit letter?',
    'Can the chatbot create a letter for me?', 'Where can I get a visit letter?'
  ]::TEXT[]
  WHEN 'What services do you offer?' THEN ARRAY[
    'What programs are available for local growers?', 'Do you provide agriculture technical assistance?',
    'What plants are studied at the facility?', 'Are there educational activities at iLAB?',
    'What agricultural research does iLAB support?', 'Do you provide plant propagation support?',
    'What programs do you offer for ornamental plants?', 'Does iLAB have a tissue culture lab?',
    'What services are available to farmers?', 'Can I learn about plant science at iLAB?',
    'What does the tissue culture laboratory do?', 'Do you offer agricultural training?',
    'What services and programs does iLAB have?'
  ]::TEXT[]
  WHEN 'Who can use iLAB services?' THEN ARRAY[
    'Can students visit or use your services?', 'Who do you support in the community?',
    'Are your programs open to teachers?', 'Who can request technical assistance?',
    'Do you accept school groups?', 'Can local growers access your services?',
    'Who is eligible to use iLAB services?', 'Are the programs open to community groups?',
    'Can farmers request support?', 'Are iLAB services only for farmers?',
    'Who can participate in your programs?', 'Can teachers use the facility?'
  ]::TEXT[]
  WHEN 'What is iLAB Guiguinto?' THEN ARRAY[
    'What does iLAB do?', 'Tell me about the iLAB facility.',
    'What is the purpose of iLAB?', 'Can you introduce iLAB Guiguinto?',
    'What kind of laboratory is iLAB?', 'What organization supports iLAB?',
    'What kind of research happens at iLAB?', 'What is the iLAB facility for?',
    'What does the name iLAB mean?', 'Can you tell me about iLAB Guiguinto?',
    'What is the mission of the facility?', 'What is iLAB focused on?'
  ]::TEXT[]
  WHEN 'What can I ask the iLAB chatbot?' THEN ARRAY[
    'What can I ask the iLAB chatbot?', 'What topics can you answer?',
    'What can you help me with?', 'What information do you have?',
    'Can you answer questions about other topics?', 'What questions are supported?',
    'What topics are within your scope?', 'What kinds of questions can I ask?',
    'Can you help with non-iLAB questions?', 'What do you know about iLAB?',
    'Which topics can this chatbot answer?', 'What can I ask you about?'
  ]::TEXT[]
  ELSE ARRAY[]::TEXT[]
  END
  ) AS examples(phrase)
  WHERE phrase <> ''
),
updated_at = NOW()
WHERE question IN (
    'What are your opening hours?',
    'Where are you located?',
    'What is the facility address?',
    'How can I contact iLAB Guiguinto?',
    'How can I request a visit?',
    'How do I visit iLAB?',
    'How do I create a visit letter?',
    'What services do you offer?',
    'Who can use iLAB services?',
    'What is iLAB Guiguinto?',
    'What can I ask the iLAB chatbot?'
  );

UPDATE chatbot_faq
SET answer = 'I can help with questions about iLAB Guiguinto services and programs, hours and location, contact details, who can use our services, and how to request a visit or appointment. I cannot reliably answer questions outside iLAB topics.',
    updated_at = NOW()
WHERE question = 'What can I ask the iLAB chatbot?'
  AND answer <> 'I can help with questions about iLAB Guiguinto services and programs, hours and location, contact details, who can use our services, and how to request a visit or appointment. I cannot reliably answer questions outside iLAB topics.';

-- Keep original seed answers aligned when an existing installation is migrated.
UPDATE chatbot_faq
SET answer = 'The public support desk is available Monday to Saturday, 7:00 AM to 6:00 PM. The iLAB chatbot is available 24/7.',
    keywords = ARRAY['hours','open','time','close','schedule'],
    updated_at = NOW()
WHERE question = 'What are your opening hours?'
  AND answer IN (
    'We are open Monday to Friday, 8:00 AM to 5:00 PM. Closed on weekends and holidays.',
    'The public support desk is available Monday to Saturday, 7:00 AM to 6:00 PM. Automated chatbot replies are available from 6:00 PM to 7:00 AM.'
  );

UPDATE chatbot_faq
SET answer = 'iLAB Guiguinto supports tissue culture, ornamental plant development, sustainable agriculture, public learning, technical assistance, and agriculture-related innovation.',
    keywords = ARRAY['service','program','tissue','plant','agriculture','research'],
    updated_at = NOW()
WHERE question = 'What services do you offer?'
  AND answer = 'We support tissue culture, ornamental planting, and agricultural research support programs.';

-- Seed roles
INSERT INTO roles (role_name, description) VALUES
('Admin', 'System administrator with full access'),
('Visitor', 'General public visitor'),
('Researcher', 'Visiting researcher'),
('Staff', 'Front-desk operations and visitor check-in')
ON CONFLICT (role_name) DO NOTHING;

-- Seed a default administrator account for system access
INSERT INTO users (username, password_hash, email, first_name, last_name, role_id, is_active)
VALUES (
  'admin',
  crypt('admin123', gen_salt('bf')),
  'admin@ilabguiguinto.ph',
  'System',
  'Administrator',
  (SELECT role_id FROM roles WHERE role_name = 'Admin'),
  true
)
ON CONFLICT (username) DO NOTHING;

-- Seed a default staff account for front-desk access
INSERT INTO users (username, password_hash, email, first_name, last_name, role_id, is_active)
VALUES (
  'staff',
  crypt('staff123', gen_salt('bf')),
  'staff@ilabguiguinto.ph',
  'Front Desk',
  'Staff',
  (SELECT role_id FROM roles WHERE role_name = 'Staff'),
  true
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (username, password_hash, email, first_name, last_name, role_id, is_active)
VALUES (
  'visitor',
  crypt('visitor123', gen_salt('bf')),
  'visitor@ilabguiguinto.ph',
  'Demo',
  'Visitor',
  (SELECT role_id FROM roles WHERE role_name = 'Visitor'),
  true
)
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role_id = EXCLUDED.role_id,
  is_active = EXCLUDED.is_active;

-- Seed a default facility
INSERT INTO facilities (facility_name, location, max_capacity, description, is_active)
SELECT seed.facility_name, seed.location, seed.max_capacity, seed.description, true
FROM (VALUES
  ('Main Research Lab', 'Building A, Level 2', 30, 'Primary tissue culture and plant propagation facility'),
  ('Consultation Room', 'Building A, Level 1', 5, 'Private consultation and meeting space'),
  ('Training Center', 'Building B', 25, 'Educational demonstrations and training sessions')
) AS seed(facility_name, location, max_capacity, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM facilities existing
  WHERE existing.facility_name = seed.facility_name
);
