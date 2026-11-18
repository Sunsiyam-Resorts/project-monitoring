import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Portal theme: small solid status chips with dark text, the same in both appearances.
// The status is always written in the chip, so colour is never the only signal.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-[11px] leading-[1.5] font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-chip-grey text-chip-grey-foreground",
        success: "bg-chip-green text-chip-foreground",
        info: "bg-chip-blue text-chip-foreground",
        warning: "bg-chip-amber text-chip-foreground",
        danger: "bg-chip-red text-chip-foreground",
        secondary: "bg-muted text-muted-foreground",
        destructive: "bg-chip-red text-chip-foreground",
        outline: "border-border text-foreground",
        ghost: "text-muted-foreground",
        link: "text-link underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
