import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import AddDogForm from "@/components/AddDogForm";

export const dynamic = "force-dynamic";

export default async function NewDogPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Add a dog
      </h1>
      <p className="mb-6 mt-1 text-sm text-zinc-500">
        Snap or upload a photo and give them a name to get started.
      </p>
      <AddDogForm />
    </main>
  );
}
