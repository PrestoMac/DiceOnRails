import React from 'react';

/** Props for the Toggle component. */
interface ToggleProps {
  on: boolean;
  onClick: () => void;
}

/** Switch-style toggle for boolean settings. */
const Toggle: React.FC<ToggleProps> = ({ on, onClick }) => (
  <button onClick={onClick} className={`w-10 h-6 rounded-full transition-all relative flex items-center p-1 ${on ? 'bg-amber-700' : 'bg-stone-800'}`}>
    <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 ease-in-out ${on ? 'translate-x-4' : 'translate-x-0'}`} />
  </button>
);

export default Toggle;
