import React from 'react';

/** Props for the BaseModal component. */
interface BaseModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/** Reusable modal dialog with backdrop blur, optional title, and custom class. */
const BaseModal: React.FC<BaseModalProps> = ({ isOpen, title, children, className = '' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`bg-stone-900 border border-stone-700 rounded-xl p-8 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200 ${className}`}>
        {title && <h2 className="text-2xl font-bold text-amber-500 mb-4">{title}</h2>}
        {children}
      </div>
    </div>
  );
};

export default BaseModal;
