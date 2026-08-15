import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import AddDogForm from "@/components/AddDogForm";

export const dynamic = "force-dynamic";

export default async function NewDogPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← The pack
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
        Add a dog
      </h1>
      <p className="mb-6 mt-1.5 text-sm text-muted">
        Snap or upload a photo and give them a name to get started.
      </p>
      <div className="card p-6 shadow-[var(--shadow)]">
        <AddDogForm />
      </div>
    </main>
  );
}
