import type { Metadata } from "next";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "@fontsource/be-vietnam-pro/900.css";
import "@fontsource/lora/500.css";
import "@fontsource/lora/600.css";
import "@fontsource/lora/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "GrantPilot AI | Policy & Grant Navigator",
  description:
    "Trợ lý giúp doanh nghiệp tìm chính sách phù hợp, kiểm tra điều kiện, hỏi đáp pháp lý có căn cứ và chuẩn bị checklist hồ sơ có nguồn dẫn."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
