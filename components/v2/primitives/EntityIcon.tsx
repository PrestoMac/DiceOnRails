import React from 'react';
import { cx } from './cx';

interface EntityIconProps {
  /** Font Awesome icon class (e.g., 'fa-shield-halved'). */
  icon?: string;
  /** Custom image URL (overrides FA icon when set). */
  iconUrl?: string;
  /** Size in Tailwind classes. */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Additional CSS classes. */
  className?: string;
  /** Alt text for image icons. */
  alt?: string;
}

const SIZE_CLASSES: Record<NonNullable<EntityIconProps['size']>, string> = {
  xs: 'w-4 h-4 text-[10px]',
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

/**
 * Renders either a Font Awesome icon or a custom image URL.
 * Use this for class/race/entity icons that may have custom artwork.
 */
export const EntityIcon: React.FC<EntityIconProps> = ({
  icon,
  iconUrl,
  size = 'md',
  className,
  alt = '',
}) => {
  const sizeClass = SIZE_CLASSES[size];

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={alt}
        className={cx(
          'rounded-full object-contain',
          sizeClass,
          className,
        )}
        aria-hidden={!alt}
      />
    );
  }

  return (
    <i
      className={cx('fas', icon, sizeClass, className)}
      aria-hidden="true"
    />
  );
};

export default EntityIcon;
