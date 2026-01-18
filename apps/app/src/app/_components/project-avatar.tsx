interface ProjectAvatarProps {
  name: string;
  size?: "sm" | "md";
}

export function ProjectAvatar({ name, size = "md" }: ProjectAvatarProps) {
  const letter = name.charAt(0).toUpperCase();
  const sizeClasses = size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-base";

  return (
    <div
      className={`${sizeClasses} flex items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 font-medium text-neutral-300`}
    >
      {letter}
    </div>
  );
}
