// Light / Dark / System appearance. public/theme.js owns the preference (it runs before the
// styles load); React reads it from <html> and changes it through window.portalAppearance.
import { useEffect, useState } from "react";

const read = () => ({
  theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  preference: document.documentElement.dataset.themePreference || "system",
});

export function useAppearance() {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setValue(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-preference"] });
    return () => observer.disconnect();
  }, []);
  return value;
}

export const setAppearance = (preference) => window.portalAppearance?.set(preference);
export const toggleAppearance = () => setAppearance(read().theme === "dark" ? "light" : "dark");
