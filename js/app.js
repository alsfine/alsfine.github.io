/**
 * ClearVoice DSP - Main Application Script
 * Mobile interactions, smooth animations, and scroll-triggered metric bars
 */

document.addEventListener('DOMContentLoaded', () => {
  initScoreBarAnimations();
  initFaqAccordion();
});

/**
 * Animate score bars when they enter viewport on mobile scroll
 */
function initScoreBarAnimations() {
  const bars = document.querySelectorAll('.meter-fill, .score-fill');
  
  if (!('IntersectionObserver' in window)) {
    // Fallback: fill immediately
    bars.forEach(bar => {
      const target = bar.getAttribute('data-width') || '100%';
      bar.style.width = target;
    });
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const bar = entry.target;
        const target = bar.getAttribute('data-width');
        if (target) {
          bar.style.width = target;
        }
        obs.unobserve(bar);
      }
    });
  }, { threshold: 0.2 });

  bars.forEach(bar => observer.observe(bar));
}

/**
 * Optional collapsible details for technical footnotes
 */
function initFaqAccordion() {
  const toggles = document.querySelectorAll('.collapsible-toggle');
  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const content = toggle.nextElementSibling;
      if (!content) return;
      const isOpen = content.style.display === 'block';
      content.style.display = isOpen ? 'none' : 'block';
      toggle.setAttribute('aria-expanded', !isOpen);
    });
  });
}
