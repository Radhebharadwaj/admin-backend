-- 1. Add acronym column to courses table
ALTER TABLE courses ADD COLUMN acronym TEXT;

-- 2. Update existing FTS index for courses
DELETE FROM global_search_index WHERE entity_type = 'course';

INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
SELECT c.id, 'course', COALESCE(c.acronym, c.name), c.name, COALESCE(c.search_aliases, ''), json_object('slug', c.slug, 'university_slug', u.slug)
FROM courses c
JOIN universities u ON c.university_id = u.id;

-- 3. Drop old triggers
DROP TRIGGER IF EXISTS courses_ai;
DROP TRIGGER IF EXISTS courses_au;

-- 4. Recreate triggers
CREATE TRIGGER courses_ai AFTER INSERT ON courses BEGIN
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  SELECT new.id, 'course', COALESCE(new.acronym, new.name), new.name, COALESCE(new.search_aliases, ''), json_object('slug', new.slug, 'university_slug', u.slug)
  FROM universities u WHERE u.id = new.university_id;
END;

CREATE TRIGGER courses_au AFTER UPDATE ON courses BEGIN
  DELETE FROM global_search_index WHERE entity_id = old.id AND entity_type = 'course';
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  SELECT new.id, 'course', COALESCE(new.acronym, new.name), new.name, COALESCE(new.search_aliases, ''), json_object('slug', new.slug, 'university_slug', u.slug)
  FROM universities u WHERE u.id = new.university_id;
END;
