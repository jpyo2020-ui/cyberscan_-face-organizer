
import React from 'react';

interface NeonButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  disabled?: boolean;
}

export const NeonButton: React.FC<NeonButtonProps> = ({ onClick, children, variant = 'primary', className = '', disabled }) => {
  // Se añade 'flex items-center justify-center text-center' para garantizar el centrado absoluto
  const baseStyles = "px-4 py-2 font-cyber text-[10px] md:text-xs uppercase tracking-widest transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-center min-h-[40px]";
  
  const variants = {
    primary: "neon-border neon-text hover:bg-[#64e1f2] hover:text-[#020617] hover:shadow-[0_0_20px_rgba(100,225,242,0.6)] bg-transparent",
    secondary: "border border-slate-700 text-slate-400 hover:border-[#64e1f2] hover:text-[#64e1f2] bg-slate-900/40",
    danger: "border border-red-500 text-red-500 hover:bg-red-500 hover:text-white bg-transparent"
  };

  return (
    <button 
      onClick={onClick} 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
};
