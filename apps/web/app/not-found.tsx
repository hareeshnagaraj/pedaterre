import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <h1>Fixture not found</h1>
      <p>This development route only serves the six checked-in roll fixtures.</p>
      <Link href="/?demo=midtown-1398">Open Manhattan Block 1398</Link>
    </main>
  );
}
