
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        // Media update state so the next render will show the fallback UI.
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4 text-center">
                    <div className="mb-4 rounded-full bg-red-100 p-3">
                        <AlertTriangle className="h-10 w-10 text-red-600" />
                    </div>
                    <h1 className="mb-2 text-2xl font-bold text-zinc-900">Algo deu errado</h1>
                    <p className="mb-6 max-w-md text-zinc-500">
                        Ocorreu um erro ao renderizar esta página. Tente recarregar ou contate o suporte.
                    </p>

                    <div className="mb-6 w-full max-w-lg overflow-hidden rounded-md bg-zinc-900 p-4 text-left shadow-lg">
                        <p className="font-mono text-sm text-red-400 mb-2">
                            {this.state.error?.toString()}
                        </p>
                        <pre className="max-h-64 overflow-auto font-mono text-xs text-zinc-300 whitespace-pre-wrap">
                            {this.state.errorInfo?.componentStack}
                        </pre>
                    </div>

                    <Button onClick={() => window.location.reload()} variant="default">
                        Recarregar Página
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
