import { redirect } from "next/navigation";

// The login lives at the home page now; old links land there.
export default function OldLogin() {
  redirect("/");
}
