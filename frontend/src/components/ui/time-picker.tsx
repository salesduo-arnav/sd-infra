"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

// ============================================================================
// Types
// ============================================================================

type TimeFormat = "12h" | "24h";

interface TimePickerProps {
    /** Time value as "HH:mm" string (24h storage) */
    value?: string;
    /** Callback when time changes */
    onChange?: (value: string) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Additional CSS classes */
    className?: string;
    /** Disable the picker */
    disabled?: boolean;
    /** Display format */
    timeFormat?: TimeFormat;
    /** Minute interval (1, 5, 10, 15, 30) */
    minuteInterval?: 1 | 5 | 10 | 15 | 30;
}

interface TimePickerInlineProps {
    /** Time value as "HH:mm" string (24h storage) */
    value?: string;
    /** Callback when time changes */
    onChange?: (value: string) => void;
    /** Additional CSS classes */
    className?: string;
    /** Disable the picker */
    disabled?: boolean;
    /** Display format */
    timeFormat?: TimeFormat;
    /** Minute interval (1, 5, 10, 15, 30) */
    minuteInterval?: 1 | 5 | 10 | 15 | 30;
}

// ============================================================================
// Constants
// ============================================================================

const ITEM_HEIGHT = 32;
const ITEM_HEIGHT_COMPACT = 28;
const SCROLL_OFFSET_ITEMS = 2;

// ============================================================================
// Shared Hook
// ============================================================================

function useTimePicker(
    value: string | undefined,
    onChange: ((value: string) => void) | undefined,
    timeFormat: TimeFormat,
    minuteInterval: number
) {
    const [open, setOpen] = React.useState(false);
    const hourRef = React.useRef<HTMLDivElement>(null);
    const minuteRef = React.useRef<HTMLDivElement>(null);

    // Generate hour/minute arrays
    const hours = React.useMemo(
        () => Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0")),
        []
    );

    const minutes = React.useMemo(
        () =>
            Array.from(
                { length: Math.floor(60 / minuteInterval) },
                (_, i) => (i * minuteInterval).toString().padStart(2, "0")
            ),
        [minuteInterval]
    );

    // Parse value into selected hour/minute
    const [selectedHour, selectedMinute] = React.useMemo(() => {
        if (!value) return ["12", "00"];
        const parts = value.split(":");
        const h = parts[0] || "12";
        const m = parts[1] || "00";
        // Snap minute to the nearest valid interval option
        const parsedMin = parseInt(m, 10);
        const snappedMin = Math.round(parsedMin / minuteInterval) * minuteInterval;
        const clampedMin = snappedMin >= 60 ? 60 - minuteInterval : snappedMin;
        return [h, clampedMin.toString().padStart(2, "0")];
    }, [value, minuteInterval]);

    // Scroll to selected items when popover opens
    const scrollToSelected = React.useCallback(
        (itemHeight: number) => {
            requestAnimationFrame(() => {
                const hourIdx = hours.indexOf(selectedHour);
                const minIdx = minutes.indexOf(selectedMinute);
                if (hourRef.current && hourIdx >= 0) {
                    hourRef.current.scrollTop =
                        hourIdx * itemHeight - SCROLL_OFFSET_ITEMS * itemHeight;
                }
                if (minuteRef.current && minIdx >= 0) {
                    minuteRef.current.scrollTop =
                        minIdx * itemHeight - SCROLL_OFFSET_ITEMS * itemHeight;
                }
            });
        },
        [hours, minutes, selectedHour, selectedMinute]
    );

    // Format hour for display
    const formatHour12 = React.useCallback((hour: string) => {
        const h = parseInt(hour, 10);
        const ampm = h >= 12 ? "PM" : "AM";
        const hour12 = h % 12 || 12;
        return { hour12, ampm };
    }, []);

    // Formatted display time
    const displayTime = React.useMemo(() => {
        if (!value && !selectedHour) return null;
        const h = parseInt(selectedHour, 10);
        if (timeFormat === "24h") {
            return `${selectedHour}:${selectedMinute}`;
        }
        const ampm = h >= 12 ? "PM" : "AM";
        const hour12 = h % 12 || 12;
        return `${hour12}:${selectedMinute} ${ampm}`;
    }, [selectedHour, selectedMinute, value, timeFormat]);

    // Handlers
    const handleHourSelect = React.useCallback(
        (hour: string) => {
            onChange?.(`${hour}:${selectedMinute}`);
        },
        [onChange, selectedMinute]
    );

    const handleMinuteSelect = React.useCallback(
        (minute: string) => {
            onChange?.(`${selectedHour}:${minute}`);
        },
        [onChange, selectedHour]
    );

    return {
        open,
        setOpen,
        hourRef,
        minuteRef,
        hours,
        minutes,
        selectedHour,
        selectedMinute,
        displayTime,
        formatHour12,
        handleHourSelect,
        handleMinuteSelect,
        scrollToSelected,
    };
}

// ============================================================================
// Shared Dropdown Content
// ============================================================================

interface TimeDropdownContentProps {
    hours: string[];
    minutes: string[];
    selectedHour: string;
    selectedMinute: string;
    hourRef: React.RefObject<HTMLDivElement>;
    minuteRef: React.RefObject<HTMLDivElement>;
    formatHour12: (hour: string) => { hour12: number; ampm: string };
    handleHourSelect: (hour: string) => void;
    handleMinuteSelect: (minute: string) => void;
    displayTime: string | null;
    timeFormat: TimeFormat;
    compact?: boolean;
}

function TimeDropdownContent({
    hours,
    minutes,
    selectedHour,
    selectedMinute,
    hourRef,
    minuteRef,
    formatHour12,
    handleHourSelect,
    handleMinuteSelect,
    displayTime,
    timeFormat,
    compact = false,
}: TimeDropdownContentProps) {
    const itemHeight = compact ? ITEM_HEIGHT_COMPACT : ITEM_HEIGHT;
    const maxHeight = compact ? "max-h-[180px]" : "max-h-[200px]";
    const textSize = compact ? "text-xs" : "text-sm";
    const btnHeight = compact ? "h-7" : "h-8";
    const headerTextSize = compact
        ? "text-[10px] uppercase tracking-wider"
        : "text-xs";

    return (
        <>
            {/* Header */}
            <div className="flex border-b bg-muted/50">
                <div
                    className={cn(
                        "flex-1 px-3 py-2 font-medium text-muted-foreground text-center",
                        headerTextSize
                    )}
                >
                    Hour
                </div>
                <div className="w-px bg-border" />
                <div
                    className={cn(
                        "flex-1 px-3 py-2 font-medium text-muted-foreground text-center",
                        headerTextSize
                    )}
                >
                    Min
                </div>
            </div>

            {/* Columns */}
            <div className="flex">
                {/* Hours */}
                <div
                    ref={hourRef}
                    className={cn("flex-1 overflow-y-auto overscroll-contain scrollbar-thin", maxHeight)}
                >
                    {hours.map((hour) => {
                        const isSelected = hour === selectedHour;
                        const display12 = formatHour12(hour);
                        return (
                            <button
                                key={hour}
                                type="button"
                                aria-label={`Hour ${timeFormat === "12h" ? `${display12.hour12} ${display12.ampm}` : hour}`}
                                onClick={() => handleHourSelect(hour)}
                                style={{ height: itemHeight }}
                                className={cn(
                                    "w-full px-2 flex items-center justify-center gap-1 transition-colors",
                                    textSize,
                                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                                    isSelected
                                        ? "bg-primary text-primary-foreground font-medium"
                                        : "hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                {timeFormat === "12h" ? (
                                    <>
                                        <span>{display12.hour12}</span>
                                        <span
                                            className={cn(
                                                compact ? "text-[9px]" : "text-[10px]",
                                                isSelected
                                                    ? "text-primary-foreground/80"
                                                    : "text-muted-foreground"
                                            )}
                                        >
                                            {display12.ampm}
                                        </span>
                                    </>
                                ) : (
                                    <span>{hour}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="w-px bg-border" />

                {/* Minutes */}
                <div
                    ref={minuteRef}
                    className={cn("flex-1 overflow-y-auto overscroll-contain scrollbar-thin", maxHeight)}
                >
                    {minutes.map((minute) => {
                        const isSelected = minute === selectedMinute;
                        return (
                            <button
                                key={minute}
                                type="button"
                                aria-label={`Minute ${minute}`}
                                onClick={() => handleMinuteSelect(minute)}
                                style={{ height: itemHeight }}
                                className={cn(
                                    "w-full px-2 flex items-center justify-center transition-colors",
                                    textSize,
                                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                                    isSelected
                                        ? "bg-primary text-primary-foreground font-medium"
                                        : "hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                {minute}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            {!compact && (
                <div className="border-t px-3 py-2 bg-muted/30 text-center">
                    <span className="text-sm font-medium">
                        {displayTime || "--:-- --"}
                    </span>
                </div>
            )}
        </>
    );
}

// ============================================================================
// TimePicker — Standard popover variant
// ============================================================================

export function TimePicker({
    value,
    onChange,
    placeholder = "Select time",
    className,
    disabled = false,
    timeFormat = "12h",
    minuteInterval = 1,
}: TimePickerProps) {
    const picker = useTimePicker(value, onChange, timeFormat, minuteInterval);

    // Scroll on open
    const { open, scrollToSelected, setOpen } = picker;
    React.useEffect(() => {
        if (open) {
            scrollToSelected(ITEM_HEIGHT);
        }
    }, [open, scrollToSelected]);

    return (
        <Popover open={picker.open} onOpenChange={picker.setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={picker.open}
                    disabled={disabled}
                    className={cn(
                        "w-full sm:w-[140px] justify-start text-left font-normal",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    <Clock className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                        {picker.displayTime || placeholder}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[200px] p-0"
                align="start"
                sideOffset={4}
            >
                <TimeDropdownContent
                    {...picker}
                    timeFormat={timeFormat}
                    compact={false}
                />
            </PopoverContent>
        </Popover>
    );
}

// ============================================================================
// TimePickerInline — Compact inline variant
// ============================================================================

export function TimePickerInline({
    value,
    onChange,
    className,
    disabled = false,
    timeFormat = "12h",
    minuteInterval = 1,
}: TimePickerInlineProps) {
    const picker = useTimePicker(value, onChange, timeFormat, minuteInterval);

    // Scroll on open
    const { open: openInline, scrollToSelected: scrollToSelectedInline, setOpen: setOpenInline } = picker;
    React.useEffect(() => {
        if (openInline) {
            scrollToSelectedInline(ITEM_HEIGHT_COMPACT);
        }
    }, [openInline, scrollToSelectedInline]);

    return (
        <Popover open={picker.open} onOpenChange={picker.setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background text-sm",
                        "hover:bg-accent hover:text-accent-foreground transition-colors",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        disabled && "opacity-50 cursor-not-allowed",
                        className
                    )}
                >
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">
                        {picker.displayTime || "--:--"}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[180px] p-0"
                align="start"
                sideOffset={4}
            >
                <TimeDropdownContent
                    {...picker}
                    timeFormat={timeFormat}
                    compact
                />
            </PopoverContent>
        </Popover>
    );
}

// ============================================================================
// Exports
// ============================================================================

export type { TimePickerProps, TimePickerInlineProps };
