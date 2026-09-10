/**
 * Page Transitions Module using native View Transitions API
 * Provides seamless, flicker-free client navigation for library catalog and browse pages.
 */

function shouldHandleNavigation(event, anchor) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return false;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;

  try {
    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin) return false;

    const path = url.pathname;
    // Skip reader, auth, downloads, api, static assets, admin operations
    if (
      path.startsWith('/reader') ||
      path.startsWith('/download') ||
      path.startsWith('/api') ||
      path.startsWith('/opds') ||
      path.startsWith('/auth') ||
      path.startsWith('/admin') ||
      path.includes('/download/') ||
      /\.(zip|fb2|epub|mobi|pdf|png|jpg|svg|css|js)$/i.test(path)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: { 'X-Page-Transition': '1' }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

function updatePageContent(htmlText, newUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  // Update title
  if (doc.title) document.title = doc.title;

  // Swap main container
  const newMain = doc.querySelector('.shell-main') || doc.querySelector('main') || doc.querySelector('#main');
  const currentMain = document.querySelector('.shell-main') || document.querySelector('main') || document.querySelector('#main');

  if (newMain && currentMain) {
    currentMain.replaceWith(newMain);
  } else {
    // Fallback: replace body content if main not found
    document.body.innerHTML = doc.body.innerHTML;
  }

  // Update breadcrumbs and topbar if present
  const newBreadcrumbs = doc.querySelector('.breadcrumbs');
  const currentBreadcrumbs = document.querySelector('.breadcrumbs');
  if (newBreadcrumbs && currentBreadcrumbs) {
    currentBreadcrumbs.replaceWith(newBreadcrumbs);
  }

  // Update active states on sidebar navigation
  const newSidebar = doc.querySelector('.shell-nav, .sidebar-nav');
  const currentSidebar = document.querySelector('.shell-nav, .sidebar-nav');
  if (newSidebar && currentSidebar) {
    currentSidebar.innerHTML = newSidebar.innerHTML;
  }

  // Re-apply catalog view mode on new content
  if (window.INPX_VIEW_SWITCHER && typeof window.INPX_VIEW_SWITCHER.applyViewMode === 'function') {
    const savedMode = window.INPX_VIEW_SWITCHER.getSavedViewMode();
    window.INPX_VIEW_SWITCHER.applyViewMode(savedMode || 'grid');
  }

  // Dispatch custom event so app.js can re-bind listeners
  document.dispatchEvent(new CustomEvent('inpx:page-navigated', { detail: { url: newUrl } }));
}

export function navigateWithTransition(url, isPopState = false) {
  if (!document.startViewTransition) {
    if (!isPopState) window.location.href = url;
    return;
  }

  const progressBar = document.getElementById('nav-progress');
  if (progressBar) progressBar.classList.add('active');

  fetchPage(url)
    .then((html) => {
      document.startViewTransition(() => {
        updatePageContent(html, url);
        if (!isPopState) {
          window.history.pushState({}, '', url);
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      });
    })
    .catch(() => {
      if (!isPopState) window.location.href = url;
    })
    .finally(() => {
      if (progressBar) progressBar.classList.remove('active');
    });
}

export function initPageTransitions() {
  // Intercept local catalog links
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || !shouldHandleNavigation(event, anchor)) return;

    event.preventDefault();
    navigateWithTransition(anchor.href, false);
  });

  // Handle browser Back/Forward buttons
  window.addEventListener('popstate', () => {
    navigateWithTransition(window.location.href, true);
  });
}

// Auto-run if executed in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageTransitions);
  } else {
    initPageTransitions();
  }
}
