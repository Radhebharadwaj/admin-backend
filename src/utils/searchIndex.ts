/**
 * Search Index Synchronization Utility
 * 
 * Provides upsert/delete functions for the FTS5 global_search_index table.
 * Called from POST/PATCH/DELETE routes of universities, courses, and subjects.
 * 
 * FTS5 contentless tables use INSERT/DELETE for upsert (delete old + insert new).
 */

type D1 = D1Database;

interface SearchEntity {
  id: string;
  entity_type: 'university' | 'course' | 'subject';
  title: string;
  subtitle: string;
  search_terms: string;
}

/**
 * Upsert a row into the FTS5 search index.
 * Since FTS5 contentless tables don't support UPDATE, we DELETE then INSERT.
 */
export async function upsertSearchIndex(db: D1, entity: SearchEntity): Promise<void> {
  try {
    // Delete existing row first (safe even if it doesn't exist)
    await db.prepare(
      "DELETE FROM global_search_index WHERE id = ?"
    ).bind(entity.id).run();

    // Insert new row
    await db.prepare(
      "INSERT INTO global_search_index (id, entity_type, title, subtitle, search_terms) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      entity.id,
      entity.entity_type,
      entity.title,
      entity.subtitle,
      entity.search_terms
    ).run();
  } catch (error) {
    console.error(`[SearchIndex] Failed to upsert ${entity.entity_type} "${entity.id}":`, error);
  }
}

/**
 * Delete a row from the FTS5 search index.
 */
export async function deleteSearchIndex(db: D1, id: string): Promise<void> {
  try {
    await db.prepare(
      "DELETE FROM global_search_index WHERE id = ?"
    ).bind(id).run();
  } catch (error) {
    console.error(`[SearchIndex] Failed to delete "${id}":`, error);
  }
}

/**
 * Delete all search index entries for a given entity type that match certain IDs.
 * Used for cascade deletes (e.g., deleting a university removes all its courses and subjects from search).
 */
export async function deleteCascadeSearchIndex(db: D1, parentQuery: string, parentId: string): Promise<void> {
  try {
    // Fetch all child IDs that will be cascade-deleted
    const { results } = await db.prepare(parentQuery).bind(parentId).all();
    if (results && results.length > 0) {
      for (const row of results) {
        await db.prepare("DELETE FROM global_search_index WHERE id = ?").bind(row.id as string).run();
      }
    }
  } catch (error) {
    console.error(`[SearchIndex] Failed cascade delete for parent "${parentId}":`, error);
  }
}

// --- Helper builders for each entity type ---

export function buildUniversitySearchEntity(id: string, name: string, acronym?: string | null, searchAliases?: string | null): SearchEntity {
  return {
    id,
    entity_type: 'university',
    title: name,
    subtitle: acronym || '',
    search_terms: [name, acronym, searchAliases].filter(Boolean).join(' '),
  };
}

export function buildCourseSearchEntity(id: string, name: string, acronym?: string | null, universityName?: string | null, searchAliases?: string | null): SearchEntity {
  return {
    id,
    entity_type: 'course',
    title: name,
    subtitle: universityName || '',
    search_terms: [name, acronym, universityName, searchAliases].filter(Boolean).join(' '),
  };
}

export function buildSubjectSearchEntity(id: string, subjectCode: string, name: string, courseName?: string | null, universityName?: string | null, searchAliases?: string | null): SearchEntity {
  return {
    id,
    entity_type: 'subject',
    title: `${subjectCode} — ${name}`,
    subtitle: courseName || '',
    search_terms: [subjectCode, name, courseName, universityName, searchAliases].filter(Boolean).join(' '),
  };
}
