/*
 * App Router aliases `react` to Next's vendored canary build, which exports
 * <ViewTransition>. @types/react only declares it in canary.d.ts, so pull
 * those declarations in project-wide.
 */
/// <reference types="react/canary" />
