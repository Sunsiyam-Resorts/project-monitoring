import * as React from "react"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-xl border px-4 py-3 text-xs leading-relaxed has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        // Notices: a hairline all round (no thick coloured edge), tinted by meaning.
        default: "border-border bg-muted text-muted-foreground",
        success: "border-transparent bg-success-soft text-success *:data-[slot=alert-description]:text-success",
        info: "border-transparent bg-info-soft text-info *:data-[slot=alert-description]:text-info",
        warning: "border-warning/30 bg-warning-soft text-warning *:data-[slot=alert-description]:text-warning",
        destructive: "border-danger/30 bg-danger-soft text-danger *:data-[slot=alert-description]:text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 min-h-4 font-semibold",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-xs text-muted-foreground [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
