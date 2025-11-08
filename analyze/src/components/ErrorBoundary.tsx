import { Component, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#141414] flex items-center justify-center p-6">
          <div className="text-center space-y-6 max-w-md">
            <h1 className="text-4xl font-bold text-white">
              오류가 발생했습니다
            </h1>
            <p className="text-gray-400">
              {this.state.error?.message || "알 수 없는 오류가 발생했습니다."}
            </p>
            <Link to="/">
              <Button>홈으로 돌아가기</Button>
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
