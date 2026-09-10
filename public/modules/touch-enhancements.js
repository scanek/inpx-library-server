/**
 * Touch and Mobile Navigation Enhancements
 * Handles active tabs on mobile bottom nav and touch-friendly interactions.
 */

export function updateMobileNavActiveTab() {
  const nav = document.querySelector('.mobile-bottom-nav');
  if (!nav) return;

  const path = window.location.pathname;
  const links = nav.querySelectorAll('.mobile-bottom-nav-item');

  links.forEach((item) => {
    const href = item.getAttribute('href');
    if (!href) return;

    let isActive = false;
    if (href === '/' && path === '/') {
      isActive = true;
    } else if (href !== '/' && path.startsWith(href)) {
      isActive = true;
    }

    item.classList.toggle('is-active', isActive);
    item.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

export function initTouchEnhancements() {
  updateMobileNavActiveTab();

  // Re-check active tab on custom navigation events or popstate
  document.addEventListener('inpx:page-navigated', updateMobileNavActiveTab);
  window.addEventListener('popstate', updateMobileNavActiveTab);

  // Focus search input when tapping mobile search nav item with data-focus-search
  document.addEventListener('click', (e) => {
    const searchNav = e.target.closest('[data-action="focus-search"]');
    if (!searchNav) return;

    const searchInput = document.querySelector('input[name="q"], .topbar-search input');
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTouchEnhancements);
  } else {
    initTouchEnhancements();
  }
}
