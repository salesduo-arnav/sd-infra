import { useRef, useState, KeyboardEvent, ClipboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface OtpInputProps {
    length?: number;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}

export function OtpInput({
    length = 6,
    value,
    onChange,
    disabled = false,
    className,
}: OtpInputProps) {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Convert value string to array
    const valueArray = value.split("").slice(0, length);
    while (valueArray.length < length) {
        valueArray.push("");
    }

    const focusInput = (index: number) => {
        if (index >= 0 && index < length) {
            inputRefs.current[index]?.focus();
        }
    };

    const handleChange = (index: number, inputValue: string) => {
        // Only allow digits
        const digit = inputValue.replace(/\D/g, "").slice(-1);

        const newValueArray = [...valueArray];
        newValueArray[index] = digit;

        const newValue = newValueArray.join("");
        onChange(newValue);

        // Move to next input if a digit was entered
        if (digit && index < length - 1) {
            focusInput(index + 1);
        }
    };

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace") {
            e.preventDefault();

            if (valueArray[index]) {
                // Clear current input
                const newValueArray = [...valueArray];
                newValueArray[index] = "";
                onChange(newValueArray.join(""));
            } else if (index > 0) {
                // Move to previous input and clear it
                const newValueArray = [...valueArray];
                newValueArray[index - 1] = "";
                onChange(newValueArray.join(""));
                focusInput(index - 1);
            }
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            focusInput(index - 1);
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            focusInput(index + 1);
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);

        if (pastedData) {
            onChange(pastedData);
            // Focus the next empty input or the last one
            const nextIndex = Math.min(pastedData.length, length - 1);
            focusInput(nextIndex);
        }
    };

    const handleFocus = (index: number) => {
        // Select the input content on focus
        inputRefs.current[index]?.select();
    };

    return (
        <div className={cn("flex gap-2 justify-center", className)}>
            {Array.from({ length }).map((_, index) => (
                <Input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={valueArray[index]}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    onFocus={() => handleFocus(index)}
                    disabled={disabled}
                    className={cn(
                        "w-12 h-14 text-center text-2xl font-bold",
                        "focus:ring-2 focus:ring-primary focus:border-primary",
                        "transition-all duration-200"
                    )}
                    autoComplete="one-time-code"
                />
            ))}
        </div>
    );
}
