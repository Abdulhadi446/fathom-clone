type Provider = "google" | "outlook";

/**
 * Tiny inline-SVG provider marks — no image dependencies, no icon library.
 * Stylised approximations of the Google Calendar / Microsoft Outlook badges,
 * drawn from primitives so the bundle stays asset-free.
 */
export default function ProviderMark({
  provider,
  className = "h-9 w-9",
}: {
  provider: Provider;
  className?: string;
}) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
        <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#ffffff" />
        <path
          d="M1.5 8.5A7 7 0 0 1 8.5 1.5h15a7 7 0 0 1 7 7v3.2H1.5z"
          fill="#4285F4"
        />
        <text
          x="16"
          y="24.6"
          textAnchor="middle"
          fontSize="13.5"
          fontWeight="700"
          fill="#1a73e8"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          31
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#0364B8" />
      <circle cx="15" cy="16" r="8" fill="none" stroke="#ffffff" strokeWidth="4.4" />
      <path
        d="M21.5 11.2 28.6 14.6a.7.7 0 0 1 0 1.2l-7.1 3.4a.7.7 0 0 1-1-.63v-6.74a.7.7 0 0 1 1-.63z"
        fill="#28A8EA"
      />
    </svg>
  );
}
