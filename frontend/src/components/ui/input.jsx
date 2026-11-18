import * as React from "react"
import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  ...props
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2 text-[13px] text-foreground transition-[color,border-color,box-shadow] outline-none file:mr-3 file:inline-flex file:h-8 file:cursor-pointer file:rounded-full file:border file:border-input file:bg-card file:px-3 file:text-xs file:font-semibold file:text-foreground placeholder:text-muted-foreground read-only:bg-muted disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 max-md:text-base",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none",
        "aria-invalid:border-danger aria-invalid:bg-danger-soft",
        className
      )}
      {...props}
    />
  )
}

export { Input }
