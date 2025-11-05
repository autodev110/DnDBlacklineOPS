import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="section-shell">{children}</main>
      <Footer />
    </>
  );
}
