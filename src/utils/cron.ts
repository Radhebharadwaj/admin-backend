import { Bindings } from '../index';
import { extractMediaKeys } from './mediaSync';

/**
 * Runs a Garbage Collection sweep across the entire R2 bucket.
 * Compares physical R2 objects with database records.
 * Deletes any file older than 24 hours that is not referenced in the DB.
 */
export async function runGarbageCollection(env: Bindings) {
  if (!env.BUCKET) {
    console.error('[CRON] R2 Bucket is not configured.');
    return;
  }
  if (!env.DB) {
    console.error('[CRON] Database is not configured.');
    return;
  }

  console.log('[CRON] Starting Zero-Bloat R2 Garbage Collection...');
  const startTime = Date.now();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  try {
    // 1. Build a Master Set of all active keys from the database
    const allResources = await env.DB.prepare('SELECT rich_text_content, thumbnail_url, r2_object_key FROM subject_resources').all();
    
    const activeKeys = new Set<string>();

    for (const res of allResources.results) {
      if (res.rich_text_content) {
        const keys = extractMediaKeys(res.rich_text_content as string);
        keys.forEach(k => activeKeys.add(k));
      }
      
      if (res.thumbnail_url) {
        let k = res.thumbnail_url as string;
        if (k.startsWith('http')) {
          try {
            const urlObj = new URL(k);
            if (urlObj.hostname.includes('cdn.qudu.in') || urlObj.hostname.includes('r2.dev')) {
              k = decodeURIComponent(urlObj.pathname.replace(/^\//, ''));
            } else if (urlObj.pathname.includes('/api/media/')) {
              k = decodeURIComponent(urlObj.pathname.split('/api/media/')[1]);
            }
          } catch(e) {}
        }
        if (k) activeKeys.add(k);
      }

      if (res.r2_object_key) {
        let k = res.r2_object_key as string;
        if (k.startsWith('http')) {
          try { k = new URL(k).pathname.replace(/^\//, ''); } catch(e){}
        }
        if (k) activeKeys.add(k);
      }
    }

    console.log(`[CRON] DB Scan complete. Found ${activeKeys.size} active media keys.`);

    // 2. Paginate through R2 bucket
    let cursor: string | undefined = undefined;
    let totalScanned = 0;
    let totalDeleted = 0;
    let isTruncated = true;
    const bucket = env.BUCKET;

    while (isTruncated) {
      const listResponse = await bucket.list({ limit: 1000, cursor });
      
      const keysToDelete: string[] = [];

      for (const object of listResponse.objects) {
        totalScanned++;
        
        // Skip if object is referenced in DB
        if (activeKeys.has(object.key)) {
          continue;
        }

        // Object is orphaned. Check its age.
        const uploadedTime = object.uploaded.getTime();
        if (startTime - uploadedTime > TWENTY_FOUR_HOURS_MS) {
          keysToDelete.push(object.key);
        }
      }

      if (keysToDelete.length > 0) {
        console.log(`[CRON] Deleting ${keysToDelete.length} orphaned files in this batch...`);
        // Note: R2 currently doesn't have a batch delete in its Worker API.
        // We delete them concurrently using Promise.all
        await Promise.all(
          keysToDelete.map(key => bucket.delete(key).catch(e => console.error(`[CRON] Failed to delete ${key}:`, e)))
        );
        totalDeleted += keysToDelete.length;
      }

      isTruncated = listResponse.truncated;
      cursor = listResponse.truncated ? listResponse.cursor : undefined;
    }

    console.log(`[CRON] Garbage Collection finished! Scanned ${totalScanned} files. Deleted ${totalDeleted} orphans.`);
  } catch (error) {
    console.error('[CRON] Garbage Collection failed:', error);
  }
}
