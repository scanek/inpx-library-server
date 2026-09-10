/**
 * Catalog View Switcher Module (Grid vs. Compact List)
 * Handles client-side view density switching with persistence in localStorage and server-sync.
 */

const STORAGE_KEY = 'inpx-catalog-view-mode';

export function getSavedViewMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'list' || saved === 'grid') return saved;
  } catch {
    // localStorage not accessible
  }
  return null;
}

export function saveViewMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore quota/security errors
  }
}

export function applyViewMode(mode, targetContainer = document) {
  const effectiveMode = mode === 'list' ? 'list' : 'grid';
  
  // Set attribute on document element and body so global CSS rules can hook into it
  document.documentElement.setAttribute('data-catalog-view', effectiveMode);
  
  // Update all view switch button states
  const buttons = document.querySelectorAll('[data-view-target]');
  buttons.forEach((btn) => {
    const target = btn.getAttribute('data-view-target');
    const isCurrent = target === effectiveMode;
    btn.classList.toggle('is-active', isCurrent);
    btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
  });

  // Update catalog grids in scope
  const grids = targetContainer.querySelectorAll('.grid, .book-grid, [data-catalog-container]');
  grids.forEach((grid) => {
    grid.setAttribute('data-view-mode', effectiveMode);
    grid.classList.toggle('is-list-view', effectiveMode === 'list');
  });
}

export function initCatalogViewSwitcher() {
  // Determine initial mode: URL query param > localStorage > server default on html attr
  const urlParams = new URLSearchParams(window.location.search);
  const queryView = urlParams.get('view');
  const saved = getSavedViewMode();
  const currentAttr = document.documentElement.getAttribute('data-catalog-view');
  
  const initialMode = queryView === 'list' || queryView === 'grid' 
    ? queryView 
    : (saved || currentAttr || 'grid');

  applyViewMode(initialMode);

  // Delegated click handler for view switcher buttons
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-view-target]');
    if (!btn) return;
    
    event.preventDefault();
    const newMode = btn.getAttribute('data-view-target');
    if (!newMode || (newMode !== 'grid' && newMode !== 'list')) return;

    saveViewMode(newMode);
    applyViewMode(newMode);

    // Optional server sync if authenticated and route exists
    if (window.INPX_USER_AUTHENTICATED) {
      try {
        fetch('/api/user/browse-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ catalogView: newMode })
        }).catch(() => {});
      } catch {}
    }
  });
}

// Auto-run if executed in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCatalogViewSwitcher);
  } else {
    initCatalogViewSwitcher();
  }
}
