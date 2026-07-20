import React from 'react';

/** Props for the SectionH component. */
interface SectionHProps {
  children: React.ReactNode;
}

/** Section heading with a left amber border accent. */
const SectionH: React.FC<SectionHProps> = ({ children }) => (
  <h3 className="text-xs font-bold text-amber-800 uppercase tracking-widest border-l-2 border-amber-800 pl-3">{children}</h3>
);

export default SectionH;
