import React from 'react';
import { cx } from './cx';
import { Z } from './layers';

/** Full-screen ambience wrapper: obsidian base + ember aura gradients + grain + content slot. */
interface ScreenProps {
  children: React.ReactNode;
  className?: string;
  /** Centers children in the viewport (same as flex items-center justify-center). */
  center?: boolean;
}

const Screen: React.FC<ScreenProps> = ({ children, className, center = false }) => (
  <div
    className={cx(
      'relative min-h-[100dvh] w-full bg-obsidian-950 text-parchment font-body overflow-hidden',
      className,
    )}
  >
    <div className="absolute inset-0 bg-ember-aura pointer-events-none" aria-hidden="true" />
    <div className="absolute inset-0 bg-dotgrid opacity-60 pointer-events-none" aria-hidden="true" />
    <div className="absolute inset-0 bg-grain pointer-events-none" aria-hidden="true" />
    <div
      className={cx(
        'relative',
        Z.content,
        'h-full min-h-[100dvh] flex flex-col',
        center && 'items-center justify-center',
      )}
    >
      {children}
    </div>
  </div>
);

export default Screen;
