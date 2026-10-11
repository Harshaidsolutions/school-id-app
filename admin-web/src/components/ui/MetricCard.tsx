import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  cardClass?: string;
  linkTo?: string;
  suffix?: string;
  spanTwo?: boolean;
}

export function MetricCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  cardClass = '',
  linkTo,
  suffix,
  spanTwo = false,
}: MetricCardProps) {
  const rootClassName = ['metric-card h-full', cardClass, spanTwo ? 'metric-card-span-2' : ''].filter(Boolean).join(' ');
  const iconClassName = ['flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconBg, iconColor].filter(Boolean).join(' ');
  return (
    <div className={rootClassName}>
      <div className={iconClassName}>
        {icon}
      </div>
      <div className='min-w-0 flex-1'>
        <div className='text-xs text-muted'>{label}</div>
        <div className='mt-0.5 text-xl font-bold text-foreground'>
          {typeof value === 'number' ? value.toLocaleString() : value}
          {suffix ? <span className='text-base'>{suffix}</span> : null}
        </div>
        {linkTo && (
          <Link
            to={linkTo}
            className='mt-1 inline-block text-sm font-semibold text-primary hover:underline'
          >
            View all
          </Link>
        )}
      </div>
    </div>
  );
}
