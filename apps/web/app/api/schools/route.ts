import { NextResponse } from "next/server";

import {
  SchoolDirectoryError,
  searchSchools,
} from "@/lib/education/schools";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to search schools." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ schools: [] });
  }
  if (query.length > 100) {
    return NextResponse.json({ error: "That search is too long." }, { status: 400 });
  }

  try {
    const schools = await searchSchools(query);
    return NextResponse.json(
      { schools },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof SchoolDirectoryError
        ? error.message
        : "School suggestions are temporarily unavailable.";
    return NextResponse.json({ error: message, schools: [] }, { status: 503 });
  }
}
