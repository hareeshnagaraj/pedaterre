import { notFound } from "next/navigation";
import { StatesDevPage } from "@/components/states";

// Workshop route: the seven interaction states rendered side by side so they
// can be reviewed without having to force each condition. Not part of the
// product, so it is not served in a production build.
export default function StatesRoute() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StatesDevPage />;
}
