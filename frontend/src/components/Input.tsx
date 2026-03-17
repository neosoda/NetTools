import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-slate-400">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-600',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-red-600',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
export default Input
