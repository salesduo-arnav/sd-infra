import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import { CartItem } from "./types";

interface CartSidebarItemProps {
  item: CartItem;
  onRemove: (id: string, tierName: string) => void;
}

export function CartSidebarItem({ item, onRemove }: CartSidebarItemProps) {
  return (
    <div
      className="group flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 transition-all duration-200 hover:border-primary/20"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{item.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0"
            >
              {item.tierName}
            </Badge>
            {item.isUpgrade && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-600 border-0">
                <ArrowUp className="h-2.5 w-2.5 mr-0.5" />
                Upgrade
              </Badge>
            )}
            {item.isDowngrade && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-orange-500/10 text-orange-600 border-0">
                <ArrowDown className="h-2.5 w-2.5 mr-0.5" />
                Downgrade
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm whitespace-nowrap">
            ${item.price.toFixed(2)}
            <span className="text-[10px] text-muted-foreground font-normal">{item.period}</span>
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(item.id, item.tierName)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      {item.isUpgrade && (
        <p className="text-[11px] text-green-600 bg-green-50 dark:bg-green-950/30 rounded px-2 py-1">
          Pro-rated charge of ~${(item.price - (item.currentPrice ?? 0)).toFixed(2)} applies immediately
        </p>
      )}
      {item.isDowngrade && (
        <p className="text-[11px] text-orange-600 bg-orange-50 dark:bg-orange-950/30 rounded px-2 py-1">
          You'll be charged ${item.price.toFixed(2)}{item.period} from next billing cycle
        </p>
      )}
    </div>
  );
}
