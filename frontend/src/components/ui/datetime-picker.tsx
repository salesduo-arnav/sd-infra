"use client";

import * as React from "react";
import { CalendarIcon, Clock, RotateCcw, Timer } from "lucide-react";
import { format } from "date-fns";

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

type TimeFormat = "12h" | "24h";

interface DateTimePickerProps {
    /** Currently selected date/time */
    value?: Date;
    /** Callback when date/time changes */
    onChange?: (date: Date | undefined) => void;
    /** Placeholder text when no date selected */
    placeholder?: string;
    /** Additional CSS classes */
    className?: string;
    /** Disable the picker */
    disabled?: boolean;
    /** Time format mode */
    timeFormat?: TimeFormat;
    /** Minimum selectable minute interval (1, 5, 10, 15, 30) */
    minuteInterval?: 1 | 5 | 10 | 15 | 30;
    /** Show seconds picker */
    showSeconds?: boolean;
}

interface DateTimeRangePickerProps {
    /** Start date/time */
    from?: Date;
    /** End date/time */
    to?: Date;
    /** Callback when start date changes */
    onFromChange?: (date: Date | undefined) => void;
    /** Callback when end date changes */
    onToChange?: (date: Date | undefined) => void;
    /** Additional CSS classes */
    className?: string;
    /** Disable the picker */
    disabled?: boolean;
    /** Time format mode */
    timeFormat?: TimeFormat;
    /** Minimum selectable minute interval */
    minuteInterval?: 1 | 5 | 10 | 15 | 30;
}

// ============================================================================
// Constants
// ============================================================================

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const PERIODS = ["AM", "PM"] as const;
const TIME_ITEM_HEIGHT = 32;

// ============================================================================
// Utility Hooks
// ============================================================================

function useTimeOptions(minuteInterval: number, showSeconds: boolean) {
    return React.useMemo(() => {
        const minutes = Array.from(
            { length: Math.floor(60 / minuteInterval) },
            (_, i) => i * minuteInterval
        );
        const seconds = showSeconds
            ? Array.from({ length: 60 }, (_, i) => i)
            : [];
        return { minutes, seconds };
    }, [minuteInterval, showSeconds]);
}

function useTimeState(value: Date | undefined) {
    return React.useMemo(() => {
        if (!value) {
            return {
                hour24: 12,
                hour12: 12,
                minute: 0,
                second: 0,
                period: "PM" as const,
            };
        }

        const hour24 = value.getHours();
        const hour12 = hour24 % 12 || 12;
        const period = hour24 >= 12 ? ("PM" as const) : ("AM" as const);

        return {
            hour24,
            hour12,
            minute: value.getMinutes(),
            second: value.getSeconds(),
            period,
        };
    }, [value]);
}

// ============================================================================
// Sub-Components
// ============================================================================

interface TimeColumnProps {
    items: (number | string)[];
    selectedValue: number | string;
    onSelect: (value: number | string) => void;
    formatItem?: (item: number | string) => string;
    className?: string;
    isOpen?: boolean;
}

function TimeColumn({
    items,
    selectedValue,
    onSelect,
    formatItem = (v) => String(v).padStart(2, "0"),
    className,
    isOpen,
}: TimeColumnProps) {
    const listRef = React.useRef<HTMLDivElement>(null);

    // Scroll to selected item when popover opens or selection changes
    React.useEffect(() => {
        if (!isOpen || !listRef.current) return;

        const selectedIndex = items.findIndex((item) => item === selectedValue);
        if (selectedIndex >= 0) {
            requestAnimationFrame(() => {
                if (listRef.current) {
                    listRef.current.scrollTop =
                        selectedIndex * TIME_ITEM_HEIGHT - TIME_ITEM_HEIGHT * 2;
                }
            });
        }
    }, [isOpen, items, selectedValue]);

    return (
        <div
            ref={listRef}
            className={cn(
                "flex-1 min-w-[48px] overflow-y-auto overscroll-contain scrollbar-thin",
                className
            )}
        >
            {items.map((item) => {
                const isSelected = item === selectedValue;
                return (
                    <button
                        key={item}
                        type="button"
                        onClick={() => onSelect(item)}
                        className={cn(
                            "w-full h-8 text-sm flex items-center justify-center transition-colors",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                            isSelected
                                ? "bg-primary text-primary-foreground font-medium"
                                : "hover:bg-accent hover:text-accent-foreground"
                        )}
                    >
                        {formatItem(item)}
                    </button>
                );
            })}
        </div>
    );
}

interface TimeSelectorProps {
    value: Date | undefined;
    onChange: (date: Date) => void;
    timeFormat: TimeFormat;
    minuteInterval: number;
    showSeconds: boolean;
    isOpen: boolean;
}

function TimeSelector({
    value,
    onChange,
    timeFormat,
    minuteInterval,
    showSeconds,
    isOpen,
}: TimeSelectorProps) {
    const { minutes, seconds } = useTimeOptions(minuteInterval, showSeconds);
    const timeState = useTimeState(value);

    const hours = timeFormat === "12h" ? HOURS_12 : HOURS_24;

    const handleTimeChange = (
        type: "hour" | "minute" | "second" | "period",
        newValue: number | string
    ) => {
        // If no date selected yet, default to today
        const baseDate = value ? new Date(value.getTime()) : new Date();

        // If no date was selected, set to today at noon first
        if (!value) {
            const now = new Date();
            baseDate.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
            baseDate.setHours(12, 0, 0, 0);
        }

        if (type === "hour") {
            if (timeFormat === "12h") {
                const hour = newValue as number;
                const isPM = timeState.period === "PM";
                baseDate.setHours((hour % 12) + (isPM ? 12 : 0));
            } else {
                baseDate.setHours(newValue as number);
            }
        } else if (type === "minute") {
            baseDate.setMinutes(newValue as number);
        } else if (type === "second") {
            baseDate.setSeconds(newValue as number);
        } else if (type === "period") {
            const currentHour12 = timeState.hour12;
            baseDate.setHours(
                newValue === "PM" ? (currentHour12 % 12) + 12 : currentHour12 % 12
            );
        }

        onChange(baseDate);
    };

    return (
        <div className="flex flex-col border-l">
            {/* Time Panel Header */}
            <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Time</span>
            </div>

            {/* Column Headers */}
            <div className="flex border-b">
                <div className="flex-1 min-w-[48px] px-1 py-1 text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">
                    Hr
                </div>
                <div className="w-px bg-border" />
                <div className="flex-1 min-w-[48px] px-1 py-1 text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">
                    Min
                </div>
                {showSeconds && (
                    <>
                        <div className="w-px bg-border" />
                        <div className="flex-1 min-w-[48px] px-1 py-1 text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">
                            Sec
                        </div>
                    </>
                )}
                {timeFormat === "12h" && (
                    <>
                        <div className="w-px bg-border" />
                        <div className="flex-1 min-w-[42px] px-1 py-1 text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">
                            &nbsp;
                        </div>
                    </>
                )}
            </div>

            {/* Scrollable Columns */}
            <div className="flex flex-1 max-h-[260px]">
                {/* Hours */}
                <TimeColumn
                    items={hours}
                    selectedValue={timeFormat === "12h" ? timeState.hour12 : timeState.hour24}
                    onSelect={(v) => handleTimeChange("hour", v)}
                    formatItem={(v) => String(v).padStart(2, "0")}
                    isOpen={isOpen}
                />

                <div className="w-px bg-border" />

                {/* Minutes */}
                <TimeColumn
                    items={minutes}
                    selectedValue={timeState.minute}
                    onSelect={(v) => handleTimeChange("minute", v)}
                    isOpen={isOpen}
                />

                {/* Seconds (optional) */}
                {showSeconds && (
                    <>
                        <div className="w-px bg-border" />
                        <TimeColumn
                            items={seconds}
                            selectedValue={timeState.second}
                            onSelect={(v) => handleTimeChange("second", v)}
                            isOpen={isOpen}
                        />
                    </>
                )}

                {/* AM/PM (only for 12h format) */}
                {timeFormat === "12h" && (
                    <>
                        <div className="w-px bg-border" />
                        <TimeColumn
                            items={[...PERIODS]}
                            selectedValue={timeState.period}
                            onSelect={(v) => handleTimeChange("period", v)}
                            formatItem={(v) => String(v)}
                            className="min-w-[42px] flex-none"
                            isOpen={isOpen}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Main Components
// ============================================================================

export function DateTimePicker({
    value,
    onChange,
    placeholder = "Pick date & time",
    className,
    disabled = false,
    timeFormat = "12h",
    minuteInterval = 5,
    showSeconds = false,
}: DateTimePickerProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (!selectedDate) {
            onChange?.(undefined);
            return;
        }

        // Clone to avoid mutating the calendar's internal object
        const newDate = new Date(selectedDate.getTime());

        // Preserve time from existing value, or default to noon
        if (value) {
            newDate.setHours(
                value.getHours(),
                value.getMinutes(),
                value.getSeconds(),
                value.getMilliseconds()
            );
        } else {
            newDate.setHours(12, 0, 0, 0);
        }

        onChange?.(newDate);
    };

    const handleTimeChange = (newDate: Date) => {
        onChange?.(newDate);
    };

    const handleSetNow = () => {
        onChange?.(new Date());
    };

    const handleClear = () => {
        onChange?.(undefined);
    };

    const formatDisplayDate = () => {
        if (!value) return null;
        const dateFormat = showSeconds
            ? timeFormat === "12h"
                ? "MMM d, yyyy h:mm:ss a"
                : "MMM d, yyyy HH:mm:ss"
            : timeFormat === "12h"
                ? "MMM d, yyyy h:mm a"
                : "MMM d, yyyy HH:mm";
        return format(value, dateFormat);
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        "sm:w-auto sm:min-w-[240px]",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                    <span className="truncate">
                        {formatDisplayDate() || placeholder}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-auto p-0"
                align="start"
                sideOffset={4}
            >
                {/* Side-by-side layout: Calendar left, Time right */}
                <div className="flex flex-col sm:flex-row">
                    {/* Calendar */}
                    <div className="flex flex-col">
                        <Calendar
                            mode="single"
                            selected={value}
                            onSelect={handleDateSelect}
                            initialFocus
                        />

                        {/* Footer */}
                        <div className="border-t px-3 py-2 bg-muted/30 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={handleSetNow}
                                >
                                    <Timer className="h-3 w-3 mr-1" />
                                    Now
                                </Button>
                                {value && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                                        onClick={handleClear}
                                    >
                                        <RotateCcw className="h-3 w-3 mr-1" />
                                        Clear
                                    </Button>
                                )}
                            </div>
                            <span className="text-xs font-medium text-muted-foreground truncate max-w-[160px]">
                                {formatDisplayDate() || "No selection"}
                            </span>
                        </div>
                    </div>

                    {/* Time Selector — right side on desktop, below on mobile */}
                    <TimeSelector
                        value={value}
                        onChange={handleTimeChange}
                        timeFormat={timeFormat}
                        minuteInterval={minuteInterval}
                        showSeconds={showSeconds}
                        isOpen={isOpen}
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ============================================================================
// DateTime Range Picker
// ============================================================================

export function DateTimeRangePicker({
    from,
    to,
    onFromChange,
    onToChange,
    className,
    disabled = false,
    timeFormat = "12h",
    minuteInterval = 5,
}: DateTimeRangePickerProps) {
    return (
        <div
            className={cn(
                "flex flex-col gap-3",
                "sm:flex-row sm:items-center sm:gap-2",
                className
            )}
        >
            {/* From Picker */}
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground sm:hidden">
                    From
                </label>
                <DateTimePicker
                    value={from}
                    onChange={onFromChange}
                    placeholder="Start date & time"
                    disabled={disabled}
                    timeFormat={timeFormat}
                    minuteInterval={minuteInterval}
                />
            </div>

            {/* Separator */}
            <div className="hidden sm:flex items-center px-1">
                <span className="text-muted-foreground text-lg">→</span>
            </div>

            {/* To Picker */}
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground sm:hidden">
                    To
                </label>
                <DateTimePicker
                    value={to}
                    onChange={onToChange}
                    placeholder="End date & time"
                    disabled={disabled}
                    timeFormat={timeFormat}
                    minuteInterval={minuteInterval}
                />
            </div>
        </div>
    );
}

// ============================================================================
// Exports
// ============================================================================

export type { DateTimePickerProps, DateTimeRangePickerProps, TimeFormat };
