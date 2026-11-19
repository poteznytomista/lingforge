(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.querySelector('#motion-toggle');
  let paused = false;
  try {
    paused = localStorage.getItem('lingforge-site-motion') === 'paused';
  } catch {
    /* Storage is optional. */
  }
  const motionAllowed = () => !paused && !reduced.matches;
  function applyMotion() {
    root.dataset.motion = motionAllowed() ? 'active' : 'paused';
    if (toggle) {
      toggle.hidden = false;
      toggle.textContent = reduced.matches
        ? 'Reduced motion'
        : paused
          ? 'Enable motion'
          : 'Pause motion';
      toggle.setAttribute('aria-pressed', String(!motionAllowed()));
      toggle.disabled = reduced.matches;
    }
  }
  applyMotion();
  toggle?.addEventListener('click', () => {
    paused = !paused;
    try {
      localStorage.setItem(
        'lingforge-site-motion',
        paused ? 'paused' : 'active',
      );
    } catch {
      /* Session still works. */
    }
    applyMotion();
  });
  reduced.addEventListener('change', applyMotion);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' },
    );
    document
      .querySelectorAll('.reveal')
      .forEach((node) => observer.observe(node));
    root.classList.add('motion-ready');
  }

  const heroArt = document.querySelector('.hero-art');
  let scheduled = false;
  function updateScroll() {
    const height = root.scrollHeight - window.innerHeight;
    root.style.setProperty(
      '--reading',
      String(
        height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0,
      ),
    );
    if (heroArt)
      heroArt.style.setProperty(
        '--parallax',
        motionAllowed() ? `${Math.min(window.scrollY, 900) * 0.08}px` : '0px',
      );
    scheduled = false;
  }
  function scheduleScroll() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(updateScroll);
    }
  }
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  window.addEventListener('resize', scheduleScroll, { passive: true });
  updateScroll();

  const stage = document.querySelector('.workspace-stage');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  stage?.addEventListener('pointermove', (event) => {
    if (!motionAllowed() || !finePointer.matches) return;
    const box = stage.getBoundingClientRect();
    stage.style.setProperty(
      '--tilt-y',
      `${((event.clientX - box.left) / box.width - 0.5) * 3}deg`,
    );
    stage.style.setProperty(
      '--tilt-x',
      `${((event.clientY - box.top) / box.height - 0.5) * -2}deg`,
    );
  });
  stage?.addEventListener('pointerleave', () => {
    stage.style.setProperty('--tilt-x', '0deg');
    stage.style.setProperty('--tilt-y', '0deg');
  });

  const tabs = [...document.querySelectorAll('[data-tab]')];
  const descriptions = {
    words: [
      'LEXICON',
      'Every word has a story.',
      'Meaning, pronunciation and relationships. In one entry.',
    ],
    sounds: [
      'PHONOLOGY',
      'Find the sound of your world.',
      'An inventory shaped by your own linguistic choices.',
    ],
    writing: [
      'WRITING SYSTEMS',
      'A shape for every idea.',
      'Stable characters. Evolving outlines. Experimental tools.',
    ],
  };
  function activateTab(tab) {
    const key = tab.dataset.tab;
    tabs.forEach((item) => {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden =
        !active;
    });
    document
      .querySelectorAll('[data-nav]')
      .forEach((node) =>
        node.classList.toggle('selected', node.dataset.nav === key),
      );
    ['preview-location', 'preview-title', 'preview-subtitle'].forEach(
      (id, index) => {
        document.getElementById(id).textContent = descriptions[key][index];
      },
    );
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft')
        next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs.at(-1);
      if (next) {
        event.preventDefault();
        activateTab(next);
        next.focus();
      }
    });
  });
  document.querySelectorAll('[data-variant]').forEach((button) => {
    button.addEventListener('click', () => {
      const flowing = button.dataset.variant === 'flowing';
      document
        .querySelector('.identity-art')
        .classList.toggle('flowing', flowing);
      document
        .querySelector('#identity-glyph')
        .setAttribute(
          'aria-label',
          `Illustrative ${flowing ? 'flowing' : 'angular'} character`,
        );
      document
        .querySelectorAll('[data-variant]')
        .forEach((node) =>
          node.setAttribute('aria-pressed', String(node === button)),
        );
    });
  });
  const copy = document.querySelector('#copy-checksum');
  if (copy && navigator.clipboard?.writeText) {
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      const status = document.querySelector('#copy-status');
      try {
        await navigator.clipboard.writeText(
          document.querySelector('#checksum').textContent.trim(),
        );
        status.textContent = 'Checksum copied.';
      } catch {
        status.textContent =
          'Copy was unavailable. Select the checksum above to copy it manually.';
      }
    });
  }
})();
