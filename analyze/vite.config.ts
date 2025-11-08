import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./", // 상대 경로로 빌드하여 서브 디렉토리에서도 작동하도록 설정
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
