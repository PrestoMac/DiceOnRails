import React from 'react';
import { cx } from './cx';

interface EntityIconProps {
  /** Font Awesome icon class (e.g., 'fa-shield-halved'). */
  icon?: string;
  /** Custom image URL (overrides FA icon when set). */
  iconUrl?: string;
  /** Additional CSS classes. */
  className?: string;
  /** Alt text for image icons. */
  alt?: string;
}

/**
 * Renders either a Font Awesome icon or a custom image URL.
 * Use this for class/race/entity icons that may have custom artwork.
 */
export const EntityIcon: React.FC<EntityIconProps> = ({
  icon,
  iconUrl,
  className,
  alt = '',
}) => {
  const sizeClass = 'w-10 h-10 text-base';

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
