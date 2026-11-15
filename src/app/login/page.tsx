import { AuthForm } from "@/components/AuthForm";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <section className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-5xl tracking-wide">Sign in to Vibersey</h1>
      <p className="mb-6 mt-1 text-muted">New here? The same link creates your free account.</p>
      <AuthForm next={next?.startsWith("/") ? next : "/designs"} />
    </section>
  );
}
