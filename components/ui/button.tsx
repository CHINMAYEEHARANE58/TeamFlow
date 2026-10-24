import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const styles=cva('inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',{variants:{variant:{default:'bg-violet-600 text-white hover:bg-violet-700 focus-visible:outline-violet-500',outline:'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}},defaultVariants:{variant:'default'}});
export function Button({className,variant,...props}:React.ComponentProps<'button'>&VariantProps<typeof styles>){return <button className={cn(styles({variant}),className)} {...props}/>}
