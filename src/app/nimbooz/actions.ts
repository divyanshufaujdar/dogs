"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ADMIN_PASS, sessionToken } from "@/lib/nimbooz";

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
