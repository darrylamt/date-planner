/**
 * The admin's icons: one stroke set, drawn here rather than pulled from a
 * package, so the sidebar costs no extra download. 24-unit grid, 1.8 stroke.
 */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  store: "M3.5 9 5 4h14l1.5 5M3.5 9h17M4 9v11h16V9M9.5 20v-5.5h5V20",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  calendar: "M4 6h16v14H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4",
  bus: "M5.5 4h13v12h-13zM5.5 11h13M8 16v3M16 16v3M8.5 13.5h.01M15.5 13.5h.01",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3.5-5.5-3.5-5 0M12 7c1.5-3.5 5.5-3.5 5 0",
  bag: "M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  flag: "M5 21V4M5 4h11.5l-2 4 2 4H5",
  bug: "M8.5 9a3.5 3.5 0 0 1 7 0v5a3.5 3.5 0 0 1-7 0zM12 11v6.5M4 13h4.5M15.5 13H20M5 7.5l3.5 2M19 7.5l-3.5 2M5 18.5l3.5-2M19 18.5l-3.5-2",
  phone: "M5 4h3.5l2 5-2.4 1.5a11 11 0 0 0 5.4 5.4L15 13.5l5 2V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1",
  tag: "M3.5 12.5V4h8.5l9 9-8.5 8.5zM7.75 7.75h.01",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  pencil: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  chef: "M6.5 14h11v6h-11zM6.5 14a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.4 0A4 4 0 0 1 17.5 14M10 17h4",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V4.5M7 9l5-5 5 5M4.5 20h15",
  sparkles: "M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  chart: "M4.5 20V11M10 20V5M15.5 20v-6M21 20H3",
  share: "M4.5 12.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-6.5M12 3.5v11M8 7.5l4-4 4 4",
  vote: "M4 4h16v16H4zM8 12.5l2.8 2.8L16 9.5",
  bookmark: "M6.5 3.5h11v17l-5.5-4-5.5 4z",
  key: "M15 7.5a4 4 0 1 1-3.9 5H3.5v3.5h3v-2h3v-1.5h1.6A4 4 0 0 1 15 7.5zM15.5 11h.01",
  users: "M9 11a3.8 3.8 0 1 0 0-7.6A3.8 3.8 0 0 0 9 11zM2.5 20.5a6.5 6.5 0 0 1 13 0M16 3.6a3.8 3.8 0 0 1 0 7.3M21.5 20.5a6.5 6.5 0 0 0-3.7-5.9",
  pulse: "M3 12h4l3-7.5 4 15 3-7.5h4",
  search: "M11 18.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM20.5 20.5l-4.2-4.2",
  menu: "M4 7h16M4 12h16M4 17h16",
  x: "M6 6l12 12M18 6 6 18",
  logout: "M14.5 4.5H19a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4.5M10 16.5 14.5 12 10 7.5M14.5 12H3.5",
  external: "M14 4.5h5.5V10M19.5 4.5 11 13M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 8.5v5M12 16.5h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  camera: "M4 8h3l1.5-2.5h7L17 8h3v11H4zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
} as const;

export type IconName = keyof typeof PATHS;

export function AdminIcon({ name, size = 17, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
