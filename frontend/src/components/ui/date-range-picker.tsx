"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

// ============================================================================
// Types
// ============================================================================

interface DateRangePickerProps {
    /** Controlled date range value */
    value?: DateRange;
    /** Callback when date range changes */
    onChange?: (range: DateRange | undefined) => void;
    /** Placeholder text when no dates selected */
    placeholder?: string;
    /** Additional CSS classes */
    className?: string;
    /** Disable the picker */
    disabled?: boolean;
    /** Number of months to show */
    numberOfMonths?: 1 | 2;
}

// ============================================================================
// Component
// ============================================================================

export function DatePickerWithRange({
    value,
    onChange,
    placeholder = "Pick a date range",
    className,
    disabled = false,
    numberOfMonths = 2,
}: DateRangePickerProps) {
    // Support both controlled and uncontrolled modes
    const [internalDate, setInternalDate] = React.useState<DateRange | undefined>();

    const date = value !== undefined ? value : internalDate;

    const handleSelect = (range: DateRange | undefined) => {
        if (onChange) {
            onChange(range);
        } else {
            setInternalDate(range);
        }
    };

    const formatDisplay = () => {
        if (!date?.from) return null;
        if (date.to) {
            return (
                <>
                    {format(date.from, "LLL dd, y")} –{" "}
                    {format(date.to, "LLL dd, y")}
                </>
            );
        }
        return format(date.from, "LLL dd, y");
    };

    const displayContent = formatDisplay();

    return (
        <div className={cn("grid gap-2", className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date-range-picker"
                        variant="outline"
                        disabled={disabled}
                        className={cn(
                            "w-full sm:w-[300px] justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                        <span className="truncate">
                            {displayContent || placeholder}
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={handleSelect}
                        numberOfMonths={numberOfMonths}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}

// ============================================================================
// Exports
// ============================================================================

export type { DateRangePickerProps };
