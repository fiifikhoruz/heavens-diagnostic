'use client';

interface Props {
  synced: boolean;
  className?: string;
}

export function SyncStatusBadge({ synced, className = '' }: Props) {
  if (synced) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium ${className}`}
      title="Pending sync to server"
    >
      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
      Pending sync
    </span>
  );
}
