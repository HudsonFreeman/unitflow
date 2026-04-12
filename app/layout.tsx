import "./globals.css";

export const metadata = {
  title: "UnitFlow",
  description: "Coordinated tenant transfers for housing portfolios",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}