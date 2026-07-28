import { notFound } from "next/navigation";
import { StatesDevPage } from "@/components/states";
import { getCityStats } from "@/lib/publishedData";

// Workshop route: the seven interaction states rendered side by side so they
// can be reviewed without having to force each condition. Not part of the
// product, so it is not served in a production build.
export default async function StatesRoute() {
  if (process.env.NODE_ENV === "production") notFound();
  const stats = await getCityStats();
  return <StatesDevPage rollYear={stats.rollYear} />;
}
