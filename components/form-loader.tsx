"use client";

import { useTopLoader } from "nextjs-toploader";
import { useEffect } from "react";
import { useFormStatus } from "react-dom";

/**
 * Drop inside any `<form>` whose Server Action ends in `redirect()`. Server-
 * action redirects don't trigger nextjs-toploader's automatic hooks (those only
 * *start* the bar on `<Link>`/anchor clicks; the `pushState`/`popstate` patches
 * only *end* it), so we start the site-wide loader off the form's pending state
 * and let it clear on navigation — or when a failed action returns instead.
 *
 * Only add this to forms that actually navigate; forms that return state and
 * stay on the page would flash the bar for nothing.
 */
export function FormLoader() {
  const { pending } = useFormStatus();
  const loader = useTopLoader();

  useEffect(() => {
    if (pending) loader.start();
    else loader.done();
  }, [pending, loader]);

  return null;
}
