import { cn } from "@/lib/utils";

export function TypewriterText({
  text,
  stagger = 0,
  className,
}: {
  text: string;
  stagger?: number;
  className?: string;
}) {
  return (
    <span className={cn("whitespace-pre-wrap", className)} aria-label={text}>
      {Array.from(text).map((character, index) =>
        character === "\n" ? (
          <br key={index} />
        ) : (
          <span
            key={index}
            aria-hidden="true"
            className="typewriter-char"
            style={stagger > 0 ? { animationDelay: `${index * stagger}ms` } : undefined}
          >
            {character === " " ? "\u00a0" : character}
          </span>
        ),
      )}
    </span>
  );
}
