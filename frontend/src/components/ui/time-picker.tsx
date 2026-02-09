import * as React from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface TimePickerProps {
    value?: string
    onChange?: (value: string) => void
    placeholder?: string
    className?: string
    disabled?: boolean
}

// Generate arrays
const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"))
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"))

export function TimePicker({
    value,
    onChange,
    placeholder = "Select time",
    className,
    disabled = false,
}: TimePickerProps) {
    const [open, setOpen] = React.useState(false)
    const hourRef = React.useRef<HTMLDivElement>(null)
    const minuteRef = React.useRef<HTMLDivElement>(null)

    // Parse value
    const [selectedHour, selectedMinute] = React.useMemo(() => {
        if (!value) return ["00", "00"]
        const [h, m] = value.split(":")
        return [h || "00", m || "00"]
    }, [value])

    // Scroll to selected on open
    React.useEffect(() => {
        if (open) {
            setTimeout(() => {
                const hourIdx = hours.indexOf(selectedHour)
                const minIdx = minutes.indexOf(selectedMinute)
                if (hourRef.current && hourIdx >= 0) {
                    hourRef.current.scrollTop = hourIdx * 32 - 64
                }
                if (minuteRef.current && minIdx >= 0) {
                    minuteRef.current.scrollTop = minIdx * 32 - 64
                }
            }, 0)
        }
    }, [open, selectedHour, selectedMinute])

    const handleHourSelect = (hour: string) => {
        onChange?.(`${hour}:${selectedMinute}`)
    }

    const handleMinuteSelect = (minute: string) => {
        onChange?.(`${selectedHour}:${minute}`)
    }

    // Format display time
    const displayTime = React.useMemo(() => {
        if (!value) return null
        const [h, m] = value.split(":")
        const hour = parseInt(h, 10)
        const ampm = hour >= 12 ? "PM" : "AM"
        const hour12 = hour % 12 || 12
        return `${hour12}:${m} ${ampm}`
    }, [value])

    const formatHour12 = (hour: string) => {
        const h = parseInt(hour, 10)
        const ampm = h >= 12 ? "PM" : "AM"
        const hour12 = h % 12 || 12
        return { hour12, ampm }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full sm:w-[140px] justify-start text-left font-normal",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    <Clock className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{displayTime || placeholder}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[200px] p-0"
                align="start"
                sideOffset={4}
            >
                {/* Header */}
                <div className="flex border-b bg-muted/50">
                    <div className="flex-1 px-3 py-2 text-xs font-medium text-muted-foreground text-center">
                        Hour
                    </div>
                    <div className="w-px bg-border" />
                    <div className="flex-1 px-3 py-2 text-xs font-medium text-muted-foreground text-center">
                        Min
                    </div>
                </div>

                {/* Columns */}
                <div className="flex">
                    {/* Hours */}
                    <div
                        ref={hourRef}
                        className="flex-1 max-h-[200px] overflow-y-auto overscroll-contain"
                    >
                        {hours.map((hour) => {
                            const { hour12, ampm } = formatHour12(hour)
                            const isSelected = hour === selectedHour
                            return (
                                <button
                                    key={hour}
                                    onClick={() => handleHourSelect(hour)}
                                    className={cn(
                                        "w-full h-8 px-2 text-sm flex items-center justify-center gap-1 transition-colors",
                                        "focus:outline-none",
                                        isSelected
                                            ? "bg-primary text-primary-foreground font-medium"
                                            : "hover:bg-accent hover:text-accent-foreground"
                                    )}
                                >
                                    <span>{hour12}</span>
                                    <span className={cn(
                                        "text-[10px]",
                                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                    )}>{ampm}</span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="w-px bg-border" />

                    {/* Minutes */}
                    <div
                        ref={minuteRef}
                        className="flex-1 max-h-[200px] overflow-y-auto overscroll-contain"
                    >
                        {minutes.map((minute) => {
                            const isSelected = minute === selectedMinute
                            return (
                                <button
                                    key={minute}
                                    onClick={() => handleMinuteSelect(minute)}
                                    className={cn(
                                        "w-full h-8 px-2 text-sm flex items-center justify-center transition-colors",
                                        "focus:outline-none",
                                        isSelected
                                            ? "bg-primary text-primary-foreground font-medium"
                                            : "hover:bg-accent hover:text-accent-foreground"
                                    )}
                                >
                                    {minute}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Footer with current selection */}
                <div className="border-t px-3 py-2 bg-muted/30 text-center">
                    <span className="text-sm font-medium">{displayTime || "--:-- --"}</span>
                </div>
            </PopoverContent>
        </Popover>
    )
}

// Compact inline variant
interface TimePickerInlineProps {
    value?: string
    onChange?: (value: string) => void
    className?: string
    disabled?: boolean
}

export function TimePickerInline({
    value,
    onChange,
    className,
    disabled = false,
}: TimePickerInlineProps) {
    const [open, setOpen] = React.useState(false)
    const hourRef = React.useRef<HTMLDivElement>(null)
    const minuteRef = React.useRef<HTMLDivElement>(null)

    const [selectedHour, selectedMinute] = React.useMemo(() => {
        if (!value) return ["12", "00"]
        const [h, m] = value.split(":")
        return [h || "12", m || "00"]
    }, [value])

    React.useEffect(() => {
        if (open) {
            setTimeout(() => {
                const hourIdx = hours.indexOf(selectedHour)
                const minIdx = minutes.indexOf(selectedMinute)
                if (hourRef.current && hourIdx >= 0) {
                    hourRef.current.scrollTop = hourIdx * 28 - 56
                }
                if (minuteRef.current && minIdx >= 0) {
                    minuteRef.current.scrollTop = minIdx * 28 - 56
                }
            }, 0)
        }
    }, [open, selectedHour, selectedMinute])

    const handleHourSelect = (hour: string) => {
        onChange?.(`${hour}:${selectedMinute}`)
    }

    const handleMinuteSelect = (minute: string) => {
        onChange?.(`${selectedHour}:${minute}`)
    }

    const displayTime = React.useMemo(() => {
        const h = parseInt(selectedHour, 10)
        const ampm = h >= 12 ? "PM" : "AM"
        const hour12 = h % 12 || 12
        return `${hour12}:${selectedMinute} ${ampm}`
    }, [selectedHour, selectedMinute])

    const formatHour12 = (hour: string) => {
        const h = parseInt(hour, 10)
        const ampm = h >= 12 ? "PM" : "AM"
        const hour12 = h % 12 || 12
        return { hour12, ampm }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
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
                    <span className="font-medium">{displayTime}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[180px] p-0" align="start" sideOffset={4}>
                <div className="flex border-b bg-muted/50">
                    <div className="flex-1 px-2 py-1.5 text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">
                        Hour
                    </div>
                    <div className="w-px bg-border" />
                    <div className="flex-1 px-2 py-1.5 text-[10px] font-medium text-muted-foreground text-center uppercase tracking-wider">
                        Min
                    </div>
                </div>

                <div className="flex">
                    <div
                        ref={hourRef}
                        className="flex-1 max-h-[180px] overflow-y-auto overscroll-contain"
                    >
                        {hours.map((hour) => {
                            const { hour12, ampm } = formatHour12(hour)
                            const isSelected = hour === selectedHour
                            return (
                                <button
                                    key={hour}
                                    onClick={() => handleHourSelect(hour)}
                                    className={cn(
                                        "w-full h-7 px-1 text-xs flex items-center justify-center gap-0.5 transition-colors",
                                        "focus:outline-none",
                                        isSelected
                                            ? "bg-primary text-primary-foreground font-medium"
                                            : "hover:bg-accent hover:text-accent-foreground"
                                    )}
                                >
                                    <span>{hour12}</span>
                                    <span className={cn(
                                        "text-[9px]",
                                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                    )}>{ampm}</span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="w-px bg-border" />

                    <div
                        ref={minuteRef}
                        className="flex-1 max-h-[180px] overflow-y-auto overscroll-contain"
                    >
                        {minutes.map((minute) => {
                            const isSelected = minute === selectedMinute
                            return (
                                <button
                                    key={minute}
                                    onClick={() => handleMinuteSelect(minute)}
                                    className={cn(
                                        "w-full h-7 px-1 text-xs flex items-center justify-center transition-colors",
                                        "focus:outline-none",
                                        isSelected
                                            ? "bg-primary text-primary-foreground font-medium"
                                            : "hover:bg-accent hover:text-accent-foreground"
                                    )}
                                >
                                    {minute}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
