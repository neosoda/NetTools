import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-slate-400">{label}</label>}
      <select
        ref={ref}
        className={cn(
          'bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-600',
          className
        )}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
)
Select.displayName = 'Select'
export default Select
