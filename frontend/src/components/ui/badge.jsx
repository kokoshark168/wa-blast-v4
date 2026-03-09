import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
        secondary: "border-transparent bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]",
        destructive: "border-transparent bg-red-600 text-white",
        outline: "text-[hsl(var(--foreground))]",
        success: "border-transparent bg-green-600/20 text-green-400",
        warning: "border-transparent bg-yellow-600/20 text-yellow-400",
        error: "border-transparent bg-red-600/20 text-red-400",
        info: "border-transparent bg-blue-600/20 text-blue-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
