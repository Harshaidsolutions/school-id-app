interface StatStatusPillProps {
  label: string;
  value: number;
  tone: string; // e.g., 'border-[#BBF7D0] bg-[#F0FDF4] text-[#22C55E]'
}

export function StatStatusPill({ label, value, tone }: StatStatusPillProps) {
  const className = ['stat-status-pill', tone].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <div className='text-2xl font-bold'>{value.toLocaleString()}</div>
      <div className='mt-1 text-xs font-semibold uppercase tracking-wide'>{label}</div>
    </div>
  );
}
