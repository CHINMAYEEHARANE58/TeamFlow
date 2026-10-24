'use client';
import * as React from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
export const Dialog=Primitive.Root;
export const DialogTrigger=Primitive.Trigger;
export const DialogTitle=Primitive.Title;
export const DialogDescription=Primitive.Description;
export const DialogClose=Primitive.Close;
export function DialogContent({className,children,...props}:React.ComponentProps<typeof Primitive.Content>){return <Primitive.Portal><Primitive.Overlay className="modal-backdrop"/><Primitive.Content className={cn('modal',className)} {...props}>{children}</Primitive.Content></Primitive.Portal>}
