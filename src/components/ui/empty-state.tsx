
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
    actionVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "gradient" | "success-gradient" | "shine";
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className, actionVariant = "outline" }: EmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className={cn("flex flex-col items-center justify-center p-8 text-center bg-zinc-50 rounded-lg border border-dashed border-zinc-200 min-h-[300px]", className)}
        >
            <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                <Icon className="h-10 w-10 text-zinc-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
            <p className="text-sm text-zinc-500 mt-2 max-w-sm">{description}</p>

            {actionLabel && onAction && (
                <Button onClick={onAction} className="mt-6" variant={actionVariant}>
                    {actionLabel}
                </Button>
            )}
        </motion.div>
    );
}
