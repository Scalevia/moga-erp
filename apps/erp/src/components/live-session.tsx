"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { leaveNotice, signOut, startSession, useSession } from "@/lib/session";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";

// The app locks itself after 10 minutes without use; every open tab counts as use.
const IDLE_MS = 10 * 60 * 1000;
const ACTIVITY_KEY = "moga-last-activity";
const LOCKED = "البرنامج اتقفل لوحده بعد 10 دقايق من غير استخدام — ادخل تاني";

function lastActivity(): number | null {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || null;
  } catch {
    return null;
  }
}

function markActivity(at: number) {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    // storage blocked: the lock goes by this tab's own timer only
  }
}

const idleTooLong = () => {
  const at = lastActivity();
  return at !== null && Date.now() - at > IDLE_MS;
};

const hydrated = () =>
  new Promise<void>((resolve) => {
    if (useStore.persist.hasHydrated()) return resolve();
    const stop = useStore.persist.onFinishHydration(() => {
      stop();
      resolve();
    });
  });

/**
 * With real accounts: who is signed in when the app opens, signing out from this tab or another, and the
 * lock after 10 minutes without use (also when the app is opened again after a long while).
 */
export function LiveSession() {
  const router = useRouter();

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let current = true;
    (async () => {
      await hydrated(); // the saved data loads first, so it can't overwrite who signed in
      const { data } = await sb.auth.getSession();
      if (data.session && idleTooLong()) {
        leaveNotice(LOCKED);
        await signOut();
      } else if (data.session) {
        markActivity(Date.now());
        const problem = await startSession(data.session.user.id);
        if (problem) {
          leaveNotice(problem);
          useStore.getState().logout();
        }
      } else {
        useStore.getState().logout();
      }
      if (current) useSession.setState({ ready: true });
    })();
    const { data: listener } = sb.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      useStore.getState().logout();
      router.replace("/");
    });
    return () => {
      current = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      markActivity(now);
    };
    const check = async () => {
      if (!idleTooLong()) return;
      const { data } = await sb.auth.getSession();
      if (!data.session) return;
      leaveNotice(LOCKED);
      await signOut();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { capture: true, passive: true });
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 30_000);
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, []);

  return null;
}
