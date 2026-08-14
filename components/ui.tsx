import { type HTMLAttributes, forwardRef } from 'react'

/**
 * Minimal Card primitive — a white rounded panel with a border.
 * Extend it by passing extra `className` strings from the call site.
 */
export const Card = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className = '', ...props }, ref) => (
  <div
    ref={ref}
    className={`rounded-xl border border-border bg-surface shadow-sm ${className}`}
    {...props}
  />
))

Card.displayName = 'Card'
