/** Small inline icon set (stroke icons, 24px grid). No external icon dependency. */
const PATHS = {
  dashboard: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 8h6V4h-6z',
  resume: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  job: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  interview: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  code: 'M9 8l-5 4 5 4M15 8l5 4-5 4',
  book: 'M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h10',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 8v5l3 2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  x: 'M7 7l10 10M17 7L7 17',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 11v6M12 7.5v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  refresh: 'M20 11a8 8 0 0 0-14.8-4M4 13a8 8 0 0 0 14.8 4M5 3v4h4M19 21v-4h-4',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  play: 'M7 5l12 7-12 7z',
  send: 'M4 12l16-8-6 16-2-7z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
};

export default function Icon({ name, size = 18, className, title }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
