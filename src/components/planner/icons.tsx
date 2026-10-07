/**
 * The handful of icons the planner pages use, drawn inline: a library for
 * twelve glyphs would be most of the page's weight.
 */

type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconCalendar = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="4.5" width="18" height="17" rx="3" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </svg>
);
export const IconPin = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
export const IconUser = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);
export const IconHelp = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 4M12 17.5h.01" />
  </svg>
);
export const IconPlus = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconBack = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const IconArrow = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconCheck = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className} strokeWidth={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IconClose = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconEdit = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
  </svg>
);
export const IconCopy = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="8" y="8" width="13" height="13" rx="2.5" />
    <path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8" />
  </svg>
);
export const IconTrash = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const IconTicket = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path d="M14 6v12" strokeDasharray="2 2.5" />
  </svg>
);
export const IconImage = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="2" />
    <path d="M21 16l-5-5-9 10" />
  </svg>
);
export const IconSearch = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
export const IconSparkle = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
  </svg>
);
export const IconClock = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconWarn = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l9.5 17H2.5L12 3zM12 10v4M12 17.2h.01" />
  </svg>
);
export const IconHome = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 10.5L12 3.5l8.5 7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-9.5z" />
  </svg>
);
export const IconFork = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.2 1.2-3.5 3.8-3.5 7v3H17" />
  </svg>
);
export const IconChart = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </svg>
);
export const IconStore = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 9.5V20h16V9.5M3 4h18l-1.5 5.5a2.6 2.6 0 0 1-5 0 2.6 2.6 0 0 1-5 0 2.6 2.6 0 0 1-5 0L3 4zM9.5 20v-5h5v5" />
  </svg>
);
export const IconMusic = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </svg>
);
export const IconPhone = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 3.5h3.5l1.8 4.5-2.3 1.5a11 11 0 0 0 6.5 6.5l1.5-2.3 4.5 1.8V19a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" />
  </svg>
);
export const IconChevron = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const IconEye = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconStar = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" />
  </svg>
);
