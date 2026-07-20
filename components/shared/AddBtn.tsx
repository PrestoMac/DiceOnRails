import React from 'react';

/** Props for the AddBtn component. */
interface AddBtnProps {
  onClick: () => void;
  disabled?: boolean;
}

/** Small plus-button used to increment a value (e.g. skill ranks, stat points). */
const AddBtn: React.FC<AddBtnProps> = ({ onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} className="w-7 h-7 flex items-center justify-center rounded bg-stone-800 hover:bg-amber-950 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-stone-400 hover:text-amber-400 text-xs border border-stone-700"><i className="fas fa-plus text-[9px]"></i></button>
);

export default AddBtn;
