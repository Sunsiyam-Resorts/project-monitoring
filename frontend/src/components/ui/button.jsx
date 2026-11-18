import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Portal theme: pills; primary is sage with dark text; secondary is a white pill with a
// hairline (Light) or a #262626 pill (Dark); 44px touch targets; icon buttons are circles.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent text-[13px] font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive:
          "border-danger/40 bg-card text-danger hover:bg-danger-soft dark:border-danger/30 dark:bg-secondary",
        outline:
          "border-input/60 bg-card text-foreground hover:bg-accent dark:border-secondary dark:bg-secondary dark:hover:bg-secondary-hover",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover dark:border-secondary",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "h-auto rounded-md px-0 font-semibold text-link underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        default: "h-11 px-4 has-[>svg]:px-3.5",
        xs: "h-7 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-12 px-6 text-sm has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    // A link reads as text in a sentence or a table cell: no button height or padding.
    compoundVariants: [{ variant: "link", class: "h-auto px-0 has-[>svg]:px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
