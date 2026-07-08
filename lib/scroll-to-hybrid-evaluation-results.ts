const RESULTS_SECTION_ID = "pre-review-results";
const SCROLL_OFFSET = 120;
const RETRY_MS = 100;
const MAX_ATTEMPTS = 30;

export function scrollToHybridEvaluationResults() {
  let attempts = 0;

  const tryScroll = () => {
    const element = document.getElementById(RESULTS_SECTION_ID);
    if (!element) {
      if (attempts++ < MAX_ATTEMPTS) {
        window.setTimeout(tryScroll, RETRY_MS);
      }
      return;
    }

    const top = element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(tryScroll);
  });
}
