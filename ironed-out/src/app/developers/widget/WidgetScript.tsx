'use client';

import { useEffect } from 'react';

/**
 * Loads the embed script after React has hydrated the page, the way a partner's single-page app
 * would. (Loading it during hydration works too, but React then re-renders the changed markup.)
 */
export function WidgetScript() {
  useEffect(() => {
    if (document.querySelector('script[data-ironed-out-loader]')) return;
    const s = document.createElement('script');
    s.src = '/widget/v1.js';
    s.async = true;
    s.dataset.ironedOutLoader = '';
    document.body.appendChild(s);
  }, []);
  return null;
}
