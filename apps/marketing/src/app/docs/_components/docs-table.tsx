interface TableProps {
  children: React.ReactNode;
}

export function Table({ children }: TableProps) {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl bg-[#141414] border border-white/[0.06] relative">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Thead({ children }: TableProps) {
  return (
    <thead className="border-b border-white/[0.06] bg-white/[0.02]">
      {children}
    </thead>
  );
}

export function Tbody({ children }: TableProps) {
  return <tbody className="divide-y divide-white/[0.04]">{children}</tbody>;
}

export function Tr({ children }: TableProps) {
  return (
    <tr className="transition-colors hover:bg-white/[0.02]">{children}</tr>
  );
}

export function Th({ children }: TableProps) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/50">
      {children}
    </th>
  );
}

export function Td({ children }: TableProps) {
  return <td className="px-4 py-3 text-white/70">{children}</td>;
}
