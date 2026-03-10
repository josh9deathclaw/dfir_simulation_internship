CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  teacher_id UUID REFERENCES users(id),
  enrolment_code VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE class_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id),
  student_id UUID REFERENCES users(id),
  enrolled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(class_id, student_id)
);

CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  is_published BOOLEAN DEFAULT FALSE
);

CREATE TABLE phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  unlock_time_minutes INTEGER DEFAULT 0
);

CREATE TABLE injects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES phases(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_path VARCHAR(500),
  file_type VARCHAR(50),
  min_delay_minutes INTEGER DEFAULT 0,
  max_delay_minutes INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE,
  description TEXT NOT NULL
);

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID REFERENCES phases(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id),
  student_id UUID REFERENCES users(id),
  answer TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  score DECIMAL(5,2)
);

CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id),
  scenario_id UUID REFERENCES scenarios(id),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active' 
    CHECK (status IN ('active', 'completed', 'abandoned'))
);