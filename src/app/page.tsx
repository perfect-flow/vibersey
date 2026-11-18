import { Designer } from "@/components/Designer";

// The builder is the home page. `?type=<product key>` opens it on a jersey type.
export default async function Home({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const { type } = await searchParams;
  return <Designer initialProduct={typeof type === "string" ? type : undefined} />;
}
