import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center p-6">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold text-white">404</h1>
        <p className="text-xl text-gray-400">페이지를 찾을 수 없습니다</p>
        <Link to="/">
          <Button>홈으로 돌아가기</Button>
        </Link>
      </div>
    </div>
  );
}
