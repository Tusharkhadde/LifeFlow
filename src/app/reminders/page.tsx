"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RemindersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/reminders");
  }, [router]);
  return null;
}
