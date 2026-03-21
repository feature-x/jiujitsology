export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth pages render without the AppShell navigation
  return <>{children}</>;
}
