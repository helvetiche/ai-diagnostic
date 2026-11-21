import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-[background-color,color,opacity,transform] duration-[120ms] ease-soft active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        quiet: "bg-surface-muted text-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        danger: "bg-critical-soft text-critical hover:bg-critical-soft/75",
      },
      size: {
        md: "h-10 px-3 text-[12px]",
        wide: "h-10 px-4 text-[12px]",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "quiet",
      size: "md",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
