-- 1. Add acronym column to universities table
ALTER TABLE universities ADD COLUMN acronym TEXT;

-- 2. Update existing FTS index for universities
DELETE FROM global_search_index WHERE entity_type = 'university';

INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
SELECT id, 'university', COALESCE(acronym, name), name, COALESCE(search_aliases, ''), json_object('slug', slug) FROM universities;

-- 3. Drop old triggers
DROP TRIGGER IF EXISTS universities_ai;
DROP TRIGGER IF EXISTS universities_au;

-- 4. Recreate triggers
CREATE TRIGGER universities_ai AFTER INSERT ON universities BEGIN
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  VALUES (new.id, 'university', COALESCE(new.acronym, new.name), new.name, COALESCE(new.search_aliases, ''), json_object('slug', new.slug));
END;

CREATE TRIGGER universities_au AFTER UPDATE ON universities BEGIN
  DELETE FROM global_search_index WHERE entity_id = old.id AND entity_type = 'university';
  INSERT INTO global_search_index(entity_id, entity_type, title, subtitle, search_aliases, route_params)
  VALUES (new.id, 'university', COALESCE(new.acronym, new.name), new.name, COALESCE(new.search_aliases, ''), json_object('slug', new.slug));
END;
