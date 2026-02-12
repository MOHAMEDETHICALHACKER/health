
import React from 'react';

interface RecordCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onAdd?: () => void;
  className?: string;
  isLoading?: boolean;
  loadingMessage?: string;
}

const RecordCard: React.FC<RecordCardProps> = ({ 
  title, 
  icon, 
  children, 
  onAdd, 
  className = "", 
  isLoading = false,
  loadingMessage = "Analyzing..."
}) => {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden card-expand-transition hover:shadow-md hover:scale-[1.005] ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs font-bold text-indigo-600">{loadingMessage}</p>
        </div>
      )}

      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">
            {icon}
          </div>
          <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        </div>
        {onAdd && !isLoading && (
          <button 
            onClick={onAdd}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-indigo-50 transition-all"
          >
            <i className="fas fa-plus"></i>
            Add New
          </button>
        )}
      </div>
      <div className={`p-5 flex-grow ${isLoading ? 'blur-[1px]' : ''}`}>
        {children}
      </div>
    </div>
  );
};

export default RecordCard;
