const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "select:not([disabled])",
  "input:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type Direction = "left" | "right" | "up" | "down";

function activeScope() {
  return document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']") ?? document.body;
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
}

function focusables(scope = activeScope()) {
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

function focusElement(element: HTMLElement | undefined) {
  if (!element) return false;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

function preferredTarget(scope: HTMLElement) {
  const mainTarget = scope === document.body
    ? scope.querySelector<HTMLElement>("main [data-tv-default]:not([disabled])")
    : null;
  const target = mainTarget ?? scope.querySelector<HTMLElement>("[data-tv-default]:not([disabled])");
  return target && isVisible(target) ? target : undefined;
}

export function focusTvDefault() {
  if (!document.body.hasAttribute("data-tv-navigation")) return false;
  const scope = activeScope();
  const items = focusables(scope);
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && items.includes(active)) return false;
  return focusElement(preferredTarget(scope) ?? items[0]);
}

function intervalGap(startA: number, endA: number, startB: number, endB: number) {
  if (endA < startB) return startB - endA;
  if (endB < startA) return startA - endB;
  return 0;
}

function nextInDirection(current: HTMLElement, candidates: HTMLElement[], direction: Direction) {
  const origin = current.getBoundingClientRect();
  const originX = origin.left + origin.width / 2;
  const originY = origin.top + origin.height / 2;

  return candidates
    .filter((candidate) => candidate !== current)
    .map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const horizontal = direction === "left" || direction === "right";
      const primary = direction === "left" ? originX - x
        : direction === "right" ? x - originX
          : direction === "up" ? originY - y
            : y - originY;
      const secondary = horizontal ? Math.abs(y - originY) : Math.abs(x - originX);
      const overlapGap = horizontal
        ? intervalGap(origin.top, origin.bottom, rect.top, rect.bottom)
        : intervalGap(origin.left, origin.right, rect.left, rect.right);
      return { candidate, primary, score: primary + secondary * 2.2 + overlapGap * 4 };
    })
    .filter(({ primary }) => primary > 1)
    .sort((a, b) => a.score - b.score)[0]?.candidate;
}

export function installTvNavigation() {
  const handlePointer = () => document.body.removeAttribute("data-tv-navigation");
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === "Tab") {
      document.body.setAttribute("data-tv-navigation", "");
      const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
      if (!dialog) return;
      const items = focusables(dialog);
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      if (currentIndex === -1 || (!event.shiftKey && currentIndex === items.length - 1) || (event.shiftKey && currentIndex === 0)) {
        event.preventDefault();
        focusElement(event.shiftKey ? items.at(-1) : items[0]);
      }
      return;
    }

    const direction = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const)[event.key];
    if (!direction) return;
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches("input[type='range']") && (direction === "left" || direction === "right")) return;

    document.body.setAttribute("data-tv-navigation", "");
    const scope = activeScope();
    const items = focusables(scope);
    if (!active || active === document.body || !scope.contains(active) || !isVisible(active)) {
      event.preventDefault();
      focusElement(preferredTarget(scope) ?? items[0]);
      return;
    }

    const next = nextInDirection(active, items, direction);
    if (next) {
      event.preventDefault();
      focusElement(next);
    }
  };

  window.addEventListener("pointerdown", handlePointer, true);
  window.addEventListener("keydown", handleKeyDown, true);
  return () => {
    window.removeEventListener("pointerdown", handlePointer, true);
    window.removeEventListener("keydown", handleKeyDown, true);
    document.body.removeAttribute("data-tv-navigation");
  };
}
