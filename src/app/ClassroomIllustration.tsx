/** Decorative scene for the intro. Colors come from the shared design tokens. */
export function ClassroomIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 480 360" role="presentation" aria-hidden="true">
      <defs>
        <clipPath id="aa-intro-window">
          <rect x="44" y="46" width="124" height="134" rx="16" />
        </clipPath>
        <clipPath id="aa-intro-room">
          <rect width="480" height="360" rx="28" />
        </clipPath>
      </defs>
      <g clipPath="url(#aa-intro-room)">
        <rect width="480" height="360" fill="var(--aa-color-background)" />
        <rect y="196" width="480" height="56" fill="var(--aa-color-mint-100)" />
        <rect y="192" width="480" height="6" fill="var(--aa-color-surface)" />
        <rect y="252" width="480" height="108" fill="var(--aa-color-sky-100)" />
        <path d="M0 290H480M0 328H480M90 252 66 290M240 252V290M390 252 414 290M150 290 132 328M330 290 348 328" stroke="var(--aa-color-surface)" strokeWidth="3" />

        <g clipPath="url(#aa-intro-window)">
          <rect x="44" y="46" width="124" height="134" fill="var(--aa-color-sky-200)" />
          <g fill="var(--aa-color-surface)">
            <ellipse cx="96" cy="84" rx="26" ry="13" />
            <ellipse cx="118" cy="76" rx="20" ry="13" />
          </g>
          <ellipse cx="82" cy="188" rx="86" ry="44" fill="var(--aa-color-mint-200)" />
          <ellipse cx="162" cy="194" rx="70" ry="40" fill="var(--aa-color-mint-500)" />
        </g>
        <rect x="44" y="46" width="124" height="134" rx="16" fill="none" stroke="var(--aa-color-surface)" strokeWidth="9" />
        <path d="M106 46V180M44 112H168" stroke="var(--aa-color-surface)" strokeWidth="6" />

        <rect x="212" y="52" width="226" height="124" rx="18" fill="var(--aa-color-board-600)" stroke="var(--aa-color-surface)" strokeWidth="9" />
        <g fill="none" stroke="var(--aa-color-surface)" strokeLinecap="round" strokeWidth="4">
          <path d="M238 90c14-12 22 12 36 0s22 12 36 0" />
          <path d="M238 120h104" />
          <path d="M238 144h66" />
          <path d="m376 132 13 13 25-30" strokeWidth="5" />
        </g>

        <ellipse cx="290" cy="344" rx="150" ry="10" fill="var(--aa-color-ink-900)" opacity="0.08" />
        <rect x="186" y="256" width="18" height="86" rx="9" fill="var(--aa-color-birch-200)" />
        <rect x="376" y="256" width="18" height="86" rx="9" fill="var(--aa-color-birch-200)" />
        <rect x="160" y="238" width="260" height="26" rx="13" fill="var(--aa-color-surface)" />
        <rect x="160" y="256" width="260" height="8" rx="4" fill="var(--aa-color-birch-200)" />

        <rect x="200" y="222" width="76" height="16" rx="6" fill="var(--aa-color-coral-300)" />
        <rect x="208" y="206" width="62" height="16" rx="6" fill="var(--aa-color-lavender-200)" />
        <rect x="216" y="190" width="46" height="16" rx="6" fill="var(--aa-color-sky-200)" />
        <circle cx="344" cy="220" r="17" fill="var(--aa-color-coral-300)" />
        <path d="M344 204c0-7 5-11 11-12" fill="none" stroke="var(--aa-color-primary-600)" strokeWidth="4" strokeLinecap="round" />
        <path d="M348 200c7-7 15-6 19-1-6 6-13 7-19 1Z" fill="var(--aa-color-mint-500)" />

        <ellipse cx="58" cy="350" rx="40" ry="7" fill="var(--aa-color-ink-900)" opacity="0.08" />
        <path d="M28 300h60l-8 48H36Z" fill="var(--aa-color-coral-300)" />
        <rect x="22" y="292" width="72" height="14" rx="7" fill="var(--aa-color-surface)" />
        <g fill="var(--aa-color-mint-500)">
          <ellipse cx="42" cy="266" rx="14" ry="30" transform="rotate(-24 42 266)" />
          <ellipse cx="74" cy="262" rx="14" ry="32" transform="rotate(22 74 262)" />
        </g>
        <ellipse cx="58" cy="254" rx="14" ry="40" fill="var(--aa-color-mint-200)" />
      </g>
    </svg>
  );
}
