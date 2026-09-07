-- Create FTS5 Virtual Table for Global Search
CREATE VIRTUAL TABLE IF NOT EXISTS global_search_index USING fts5(
  entity_id UNINDEXED, 
  entity_type, 
  title, 
  subtitle, 
  search_aliases,
  route_params UNINDEXED,
  tokenize='porter'
);

-- Initial population of Universities
INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
SELECT id, 'university', name, '', COALESCE(search_aliases, ''), json_object('slug', slug) FROM universities;

-- Initial population of Courses
INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
SELECT c.id, 'course', c.name, c.slug, COALESCE(c.search_aliases, ''), json_object('slug', c.slug, 'university_slug', u.slug)
FROM courses c
JOIN universities u ON c.university_id = u.id;

-- Initial population of Subjects
INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
SELECT s.id, 'subject', s.name, s.subject_code, COALESCE(s.search_aliases, ''), json_object('subject_code', s.subject_code, 'course_slug', c.slug, 'university_slug', u.slug)
FROM subjects s
JOIN courses c ON s.course_id = c.id
JOIN universities u ON c.university_id = u.id;


-- ==========================================
-- TRIGGERS FOR UNIVERSITIES
-- ==========================================
CREATE TRIGGER universities_ai AFTER INSERT ON universities BEGIN
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  VALUES (new.id, 'university', new.name, '', COALESCE(new.search_aliases, ''), json_object('slug', new.slug));
END;

CREATE TRIGGER universities_ad AFTER DELETE ON universities BEGIN
  DELETE FROM global_search_index WHERE entity_id = old.id AND entity_type = 'university';
END;

CREATE TRIGGER universities_au AFTER UPDATE ON universities BEGIN
  DELETE FROM global_search_index WHERE entity_id = old.id AND entity_type = 'university';
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  VALUES (new.id, 'university', new.name, '', COALESCE(new.search_aliases, ''), json_object('slug', new.slug));
END;


-- ==========================================
-- TRIGGERS FOR COURSES
-- ==========================================
CREATE TRIGGER courses_ai AFTER INSERT ON courses BEGIN
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  SELECT new.id, 'course', new.name, new.slug, COALESCE(new.search_aliases, ''), json_object('slug', new.slug, 'university_slug', u.slug)
  FROM universities u WHERE u.id = new.university_id;
END;

CREATE TRIGGER courses_ad AFTER DELETE ON courses BEGIN
  DELETE FROM global_search_index WHERE entity_id = old.id AND entity_type = 'course';
END;

CREATE TRIGGER courses_au AFTER UPDATE ON courses BEGIN
  DELETE FROM global_search_index WHERE entity_id = old.id AND entity_type = 'course';
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  SELECT new.id, 'course', new.name, new.slug, COALESCE(new.search_aliases, ''), json_object('slug', new.slug, 'university_slug', u.slug)
  FROM universities u WHERE u.id = new.university_id;
END;


-- ==========================================
-- TRIGGERS FOR SUBJECTS
-- ==========================================
CREATE TRIGGER subjects_ai AFTER INSERT ON subjects BEGIN
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  SELECT new.id, 'subject', new.name, new.subject_code, COALESCE(new.search_aliases, ''), json_object('subject_code', new.subject_code, 'course_slug', c.slug, 'university_slug', u.slug)
  FROM courses c
  JOIN universities u ON c.university_id = u.id
  WHERE c.id = new.course_id;
END;

CREATE TRIGGER subjects_ad AFTER DELETE ON subjects BEGIN
  DELETE FROM global_search_index WHERE entity_id = old.id AND entity_type = 'subject';
END;

CREATE TRIGGER subjects_au AFTER UPDATE ON subjects BEGIN
  DELETE FROM global_search_index WHERE entity_id = old.id AND entity_type = 'subject';
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  SELECT new.id, 'subject', new.name, new.subject_code, COALESCE(new.search_aliases, ''), json_object('subject_code', new.subject_code, 'course_slug', c.slug, 'university_slug', u.slug)
  FROM courses c
  JOIN universities u ON c.university_id = u.id
  WHERE c.id = new.course_id;
END;
