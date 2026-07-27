import { notFound } from "next/navigation";
import { FixtureView } from "@/components/FixtureView";
import { fixtureNames, getFixture, isFixtureName } from "@/lib/fixtures";

export function generateStaticParams() {
  return fixtureNames.map((name) => ({ name }));
}

export default async function FixturePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  if (!isFixtureName(name)) notFound();

  const payload = await getFixture(name);
  return <FixtureView payload={payload} />;
}
