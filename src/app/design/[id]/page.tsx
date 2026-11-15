import { Designer } from "@/components/Designer";

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Designer initialDesignId={id} />;
}
