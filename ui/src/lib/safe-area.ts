/** Raw viewport bounds for overlays that escape the application container. */
export function getSafeAreaPadding(gap = 0) {
  const style = getComputedStyle(document.documentElement);
  return {
    top: (Number.parseFloat(style.getPropertyValue("--safe-area-top")) || 0) + gap,
    right: (Number.parseFloat(style.getPropertyValue("--safe-area-right")) || 0) + gap,
    bottom: (Number.parseFloat(style.getPropertyValue("--safe-area-bottom")) || 0) + gap,
    left: (Number.parseFloat(style.getPropertyValue("--safe-area-left")) || 0) + gap,
  };
}
