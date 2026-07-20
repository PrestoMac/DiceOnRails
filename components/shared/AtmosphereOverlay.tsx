import React from 'react';

interface AtmosphereOverlayProps {
  url?: string | null;
  enabled: boolean;
}

const AtmosphereOverlay: React.FC<AtmosphereOverlayProps> = ({ url, enabled }) => {
  if (!enabled || !url) return null;
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      <img src={url} key={url} alt="" className="w-full h-full object-cover opacity-20 animate-in fade-in duration-1000" />
      <div className="absolute inset-0 bg-gradient-to-b from-stone-950/70 via-transparent to-stone-950/70" />
    </div>
  );
};

export default AtmosphereOverlay;
