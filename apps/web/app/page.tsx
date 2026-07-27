import { DemoRedirect } from "@/components/DemoRedirect";
import { FixtureView } from "@/components/FixtureView";
import { getFixture } from "@/lib/fixtures";

export default async function Home() {
  const payload = await getFixture("midtown-1398");

  return (
    <>
      <DemoRedirect />
      <FixtureView payload={payload} />
    </>
  );
}
