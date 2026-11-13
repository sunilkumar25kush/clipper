import * as React from "react";
import { cn } from "../lib/utils";

export interface TabsProps {
  value: string;
  onValueChange: (val: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={cn("flex flex-col space-y-4", className)}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{
              activeValue?: string;
              onSelectTab?: (v: string) => void;
            }>,
            {
              activeValue: value,
              onSelectTab: onValueChange,
            },
          );
        }
        return child;
      })}
    </div>
  );
}

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  activeValue?: string;
  onSelectTab?: (v: string) => void;
}

export function TabsList({
  className,
  children,
  activeValue,
  onSelectTab,
  ...props
}: TabsListProps) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-zinc-100 p-1 text-zinc-500",
        className,
      )}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{
              activeValue?: string;
              onSelectTab?: (v: string) => void;
            }>,
            {
              activeValue,
              onSelectTab,
            },
          );
        }
        return child;
      })}
    </div>
  );
}

export interface TabsTriggerProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value"
> {
  value: string;
  activeValue?: string;
  onSelectTab?: (v: string) => void;
}

export function TabsTrigger({
  value,
  activeValue,
  onSelectTab,
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const isSelected = activeValue === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={() => onSelectTab?.(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50",
        isSelected ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  activeValue?: string;
}

export function TabsContent({
  value,
  activeValue,
  className,
  children,
  ...props
}: TabsContentProps) {
  if (value !== activeValue) return null;
  return (
    <div
      role="tabpanel"
      className={cn(
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
