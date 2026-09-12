export function extractMediaKeys(jsonStr: string | null | undefined): string[] {
  const keys: string[] = [];
  if (!jsonStr) return keys;

  try {
    let parsed: any;
    if (typeof jsonStr === 'string') {
      parsed = JSON.parse(jsonStr);
    } else if (typeof jsonStr === 'object') {
      parsed = jsonStr;
    } else {
      return keys;
    }

    function traverse(node: any) {
      if (!node || typeof node !== 'object') return;

      // Extract src only from our designated custom nodes
      if (node.type === 'customImage' || node.type === 'customVideo') {
        const src = node.attrs?.src;
        if (typeof src === 'string' && src) {
          try {
            const urlObj = new URL(src);
            // Example: http://localhost:8787/api/media/uploads/editor/...
            if (urlObj.pathname.includes('/api/media/')) {
              const key = decodeURIComponent(urlObj.pathname.split('/api/media/')[1]);
              if (key) keys.push(key);
            } 
            // Handle CDN domain directly
            else if (urlObj.hostname.includes('cdn.qudu.in')) {
              const key = decodeURIComponent(urlObj.pathname.replace(/^\//, ''));
              if (key) keys.push(key);
            }
            // Handle any legacy direct r2.dev URLs if they exist
            else if (urlObj.hostname.includes('r2.dev')) {
              const key = decodeURIComponent(urlObj.pathname.replace(/^\//, ''));
              if (key) keys.push(key);
            }
          } catch (e) {
            // Invalid URL string, ignore safely
          }
        }
      }

      // Recursively traverse children
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          traverse(child);
        }
      }
    }

    traverse(parsed);
  } catch (error) {
    console.error("[MediaSync] Failed to parse Tiptap JSON:", error);
  }

  // Return unique keys
  return [...new Set(keys)];
}

export function findOrphanedKeys(oldJsonStr: string | null | undefined, newJsonStr: string | null | undefined): string[] {
  const oldKeys = extractMediaKeys(oldJsonStr);
  const newKeys = extractMediaKeys(newJsonStr);

  const newKeysSet = new Set(newKeys);
  const orphanedKeys = oldKeys.filter(key => !newKeysSet.has(key));
  
  return orphanedKeys;
}
