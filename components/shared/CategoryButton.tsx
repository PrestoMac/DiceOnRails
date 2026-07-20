import React from 'react';

/** Props for the CategoryButton component. */
interface CategoryButtonProps {
  active: boolean;
  onClick: () => void;
  icon?: string;
  children: React.ReactNode;
}

/** Toggle-style button for filtering or selecting categories (e.g. feat categories). */
const CategoryButton: React.FC<CategoryButtonProps> = ({ active, onClick, icon, children }) => (
  <button onClick={onClick} className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider transition-all ${active ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30' : 'bg-stone-900 text-stone-500 border border-stone-800 hover:text-stone-300'}`}>
    {icon && <i className={`fas ${icon} mr-1 text-[8px]`}></i>}{children}
  </button>
);

export default CategoryButton;
