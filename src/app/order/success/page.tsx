import Link from "next/link";

export default function OrderSuccess() {
  return (
    <section className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="font-display text-6xl tracking-wide text-volt">You&apos;re all set!</h1>
      <p className="mt-3 text-muted">
        Your order is paid. We&apos;re preparing your print files and sending your jersey to production. You&apos;ll get a
        receipt by email, and tracking once it ships.
      </p>
      <Link href="/" className="btn-primary mt-8">
        Design another
      </Link>
    </section>
  );
}
