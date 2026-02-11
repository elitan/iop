interface DemoModeAlertProps {
  text?: string;
}

export function DemoModeAlert({ text }: DemoModeAlertProps) {
  return (
    <div className="rounded-md border border-amber-800/50 bg-amber-900/20 px-3 py-2 text-sm text-amber-300">
      {text ?? "Demo mode is active. Some settings and actions are locked."}
    </div>
  );
}
