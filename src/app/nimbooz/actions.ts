"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, ADMIN_PASS, sessionToken } from "@/lib/nimbooz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function isUnlocked(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === sessionToken();
}

export async function unlock(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password !== ADMIN_PASS) {
    redirect("/nimbooz?error=1");
  }
  const store = await cookies();
  store.set(ADMIN_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  redirect("/nimbooz");
}

export async function lock() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/nimbooz");
}

/**
 * Permanently deletes a dog submission and everything tied to it (photos,
 * names, votes, sightings, favourites cascade) plus its storage files.
 */
export async function deleteSubmission(formData: FormData) {
  if (!(await isUnlocked())) redirect("/nimbooz");
  const dogId = String(formData.get("dog") ?? "");
  if (!dogId) redirect("/nimbooz");

  const admin = createAdminClient();
  const { data: photos } = await admin
    .from("photos")
    .select("storage_path")
    .eq("dog_id", dogId);

  const { error } = await admin.from("dogs").delete().eq("id", dogId);
  if (error) console.error("deleteSubmission failed:", error.message);

  const paths = (photos ?? []).map((p) => p.storage_path as string);
  if (paths.length) await admin.storage.from("dog-photos").remove(paths);

  revalidatePath("/");
  revalidatePath("/leaderboard");
  revalidatePath("/nimbooz");
  redirect("/nimbooz");
}

/**
 * Folds a duplicate dog into its canonical twin (admin-confirmed — merging is
 * never automatic, since a wrong merge fuses two different animals' history).
 * All the re-parenting/dedup logic lives in the merge_dogs SQL function.
 */
export async function mergeDogs(formData: FormData) {
  if (!(await isUnlocked())) redirect("/nimbooz");
  const sourceId = String(formData.get("source") ?? "");
  const targetId = String(formData.get("target") ?? "");
  if (!sourceId || !targetId) redirect("/nimbooz");

  const admin = createAdminClient();
  const { error } = await admin.rpc("merge_dogs", {
    source_id: sourceId,
    target_id: targetId,
  });
  if (error) console.error("merge_dogs failed:", error.message);

  revalidatePath("/");
  revalidatePath("/nimbooz");
  redirect("/nimbooz");
}

/**
 * Manually raises or downgrades a dog's red flag. A downgrade also marks the
 * dog as human-reviewed so the auto-flag trigger won't immediately re-flag it
 * (e.g. after vote brigading on a harmless dog).
 */
export async function setRedFlag(formData: FormData) {
  if (!(await isUnlocked())) redirect("/nimbooz");
  const dogId = String(formData.get("dog") ?? "");
  const flagged = formData.get("flagged") === "true";
  if (!dogId) redirect("/nimbooz");

  // Record who did it when the admin also has a normal app session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error } = await admin
    .from("dogs")
    .update({
      red_flagged: flagged,
      red_flagged_at: flagged ? new Date().toISOString() : null,
      red_flagged_by: user?.id ?? null,
      red_flag_reviewed: true,
    })
    .eq("id", dogId);
  if (error) console.error("setRedFlag failed:", error.message);

  revalidatePath("/");
  revalidatePath(`/dogs/${dogId}`);
  revalidatePath("/nimbooz");
  redirect("/nimbooz");
}
