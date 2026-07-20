import React from 'react';

interface SectionHProps {
  children: React.ReactNode;
}

const SectionH: React.FC<SectionHProps> = ({ children }) => (
  <h3 className="text-xs font-bold text-amber-800 uppercase tracking-widest border-l-2 border-amber-800 pl-3">{children}</h3>
);

export default SectionH;
