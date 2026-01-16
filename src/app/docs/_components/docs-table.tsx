interface TableProps {
  children: React.ReactNode;
}

export function Table({ children }: TableProps) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: TableProps) {
  return (
    <thead className="border-b border-neutral-800 bg-neutral-900/50">
      {children}
    </thead>
  );
}

export function Tbody({ children }: TableProps) {
  return <tbody className="divide-y divide-neutral-800">{children}</tbody>;
}

export function Tr({ children }: TableProps) {
  return <tr>{children}</tr>;
}

export function Th({ children }: TableProps) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
      {children}
    </th>
  );
}

export function Td({ children }: TableProps) {
  return <td className="px-4 py-3 text-neutral-300">{children}</td>;
}
