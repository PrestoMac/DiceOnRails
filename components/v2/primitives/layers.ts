/** Single z-ladder for the entire V2 UI. Never use ad-hoc z-index utilities. */
export const Z = {
  base: 'z-0',
  content: 'z-10',
  dock: 'z-20',
  nav: 'z-30',
  menu: 'z-40',
  sheet: 'z-50',
  modal: 'z-[70]',
  toast: 'z-[80]',
  dice: 'z-[90]',
  tour: 'z-[100]',
} as const;

export type ZLayer = keyof typeof Z;
