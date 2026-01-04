
import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PlaceholderPageProps {
    title: string;
    icon?: LucideIcon;
    description?: string;
}

export default function PlaceholderPage({ title, icon: Icon, description }: PlaceholderPageProps) {
    return (
        <div className="flex-1 p-8 space-y-6 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
            <div className="flex items-center gap-4">
                {Icon && <Icon className="h-8 w-8 text-zinc-900" />}
                <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h2>
            </div>

            <Card className="bg-white border-zinc-200 shadow-sm border-dashed border-2">
                <CardHeader>
                    <CardTitle className="text-xl text-zinc-600">Em Desenvolvimento</CardTitle>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center text-zinc-400">
                    {description || "Esta funcionalidade será migrada em breve."}
                </CardContent>
            </Card>
        </div>
    );
}
