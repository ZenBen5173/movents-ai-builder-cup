"use client";

import { useEffect } from "react";
import { StageEmpty } from "@/components/ep/kit";

/** Any page error inside the app: keep the shell, offer a retry. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="pt-10">
      <StageEmpty
        title="Something went wrong"
        body={`This page hit an error. Try again, and if it keeps happening, share this code with support: ${error.digest ?? "n/a"}`}
        action={
          <button onClick={reset} className="text-sm font-semibold text-tomato-ink hover:underline">
            Try again
          </button>
        }
      />
    </div>
  );
}
