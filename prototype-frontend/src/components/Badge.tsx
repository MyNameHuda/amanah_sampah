import { memo, type ReactNode } from 'react';

type Tone = 'green' | 'red' | 'yellow' | 'gray' | 'blue';

const TONES: Record<Tone, string> = {
  green: 'bg-green-100 text-green-800 ring-green-200',
  red: 'bg-red-100 text-red-800 ring-red-200',
  yellow: 'bg-amber-100 text-amber-800 ring-amber-200',
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-100 text-blue-800 ring-blue-200',
};

export const Badge = memo(function Badge({
  tone = 'gray',
  children,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {icon}
      {children}
    </span>
  );
});

export const PoinBadge = memo(function PoinBadge({ value }: { value: number }) {
  const tone: Tone = value < 0 ? 'red' : value > 0 ? 'green' : 'gray';
  const display = value > 0 ? `+${value}` : `${value}`;
  return <Badge tone={tone}>{display}</Badge>;
});
