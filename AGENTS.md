# AGENTS.md

# CLIPFORGE AI — PERMANENT DEVELOPMENT RULES

These rules are mandatory for every AI coding agent, developer, and contributor working on this project.

The objective is to build a production-ready, scalable, secure, accessible, SEO-friendly, and performance-optimized SaaS application.

These rules apply to every new feature, component, API, page, service, bug fix, refactor, and deployment.

No feature should be implemented by sacrificing code quality, performance, accessibility, security, or maintainability.

---

# 1. MANDATORY DEVELOPMENT TOOLS

## 1.1 Impeccable — Mandatory UI/UX Tool

Always use Impeccable for frontend design and UI-related implementation.

Rules:

- Never start designing a new page without consulting Impeccable.
- Use `/impeccable` for new interface design and major UI changes.
- Use `/impeccable init` to establish project design context.
- Use `/impeccable critique` to evaluate UI quality.
- Use `/impeccable audit` to identify interface implementation problems.
- Use `/impeccable optimize` for UI performance-related improvements.
- Use `/impeccable polish` before considering a page complete.
- Use `/impeccable adapt` for responsive layouts.
- Use `/impeccable harden` for interface error states and usability.

Design principles:

- Professional SaaS-quality UI.
- Consistent spacing and typography.
- Reusable design tokens.
- Responsive-first implementation.
- Clear visual hierarchy.
- Meaningful animations.
- Proper loading, empty, success and error states.
- No generic AI-generated-looking interfaces.
- Avoid unnecessary gradients, shadows, borders and decorative elements.
- Never compromise accessibility for visual appearance.

If Impeccable is unavailable, do not pretend it was used. Follow the existing DESIGN.md rules and report the limitation.

## 1.2 Ponytail — Mandatory Code Quality Tool

Always follow Ponytail's development philosophy.

Before writing code, follow this order:

1. Does this functionality actually need to exist?
2. Does the current codebase already solve this problem?
3. Can existing utilities or components be reused?
4. Can the standard library solve it?
5. Can native browser or platform functionality solve it?
6. Can an existing installed dependency solve it?
7. Only then write the minimum code required.

Rules:

- Avoid unnecessary abstractions.
- Avoid duplicate functionality.
- Avoid unnecessary dependencies.
- Never rewrite working code without a valid reason.
- Keep functions focused and understandable.
- Validate external inputs.
- Handle errors properly.
- Write tests for risky logic.
- Never sacrifice security, accessibility, validation or reliability to reduce code.

Use Ponytail review and audit commands when supported by the installed coding agent.

---

# 2. CORE CODING PRINCIPLES

All code must follow these standards:

- Write clean, readable, maintainable code.
- Use TypeScript for frontend and Node.js backend.
- Use Python for AI processing services.
- Prefer strict TypeScript configuration.
- Avoid `any` unless absolutely necessary and documented.
- Use meaningful variable, function and component names.
- Keep components small and reusable.
- Avoid deeply nested conditional logic.
- Avoid unnecessary useEffect and useState.
- Avoid unnecessary rerenders.
- Keep business logic separate from UI components.
- Keep API logic separate from controllers.
- Use centralized error handling.
- Use consistent naming conventions.
- Follow the existing architecture.
- Do not duplicate code across services.
- Use shared types and schemas wherever appropriate.
- Never introduce a new dependency without checking whether an existing solution works.

Never use `var` in JavaScript or TypeScript. Prefer `const`, and use `let` only when reassignment is required.

---

# 3. PERFORMANCE-FIRST DEVELOPMENT

Performance is a permanent project requirement, not a final optimization task.

Every feature must be implemented with performance in mind.

The following metrics must always be considered:

- LCP — Largest Contentful Paint
- INP — Interaction to Next Paint
- TBT — Total Blocking Time
- FCP — First Contentful Paint
- CLS — Cumulative Layout Shift

Note: TBT is a laboratory diagnostic metric, while INP is the Core Web Vital used for field interaction responsiveness.

## 3.1 Performance Targets

Aim for the following targets on mobile devices.

| Metric | Target        |
| ------ | ------------- |
| LCP    | ≤ 2.5 seconds |
| INP    | ≤ 200 ms      |
| CLS    | ≤ 0.1         |
| FCP    | ≤ 1.8 seconds |
| TBT    | ≤ 200 ms      |

These are target budgets, not guarantees. Measure using real test conditions and field data wherever possible.

## 3.2 JavaScript Optimization

Mandatory rules:

- Split large JavaScript bundles into smaller logical chunks.
- Use route-level code splitting.
- Use dynamic imports for heavy components.
- Lazy-load non-critical components.
- Load video editors only when required.
- Lazy-load advanced charts and dashboards.
- Avoid unnecessary third-party scripts.
- Remove unused dependencies.
- Avoid duplicate libraries.
- Avoid unnecessarily large npm packages.
- Minimize JavaScript executed during initial page load.
- Keep the initial JavaScript bundle as small as reasonably possible.
- Avoid expensive synchronous computations on the main thread.
- Use Web Workers for appropriate CPU-intensive browser tasks.
- Debounce expensive search and filter operations where appropriate.
- Avoid unnecessary event listeners.
- Clean up subscriptions, observers and event listeners.
- Avoid memory leaks.
- Avoid excessive React context updates.
- Use memoization only when it provides measurable value.

Never load the entire video editor, rendering controls, advanced timeline and analytics modules on the initial landing page.

## 3.3 CSS Optimization

Mandatory rules:

- Organize CSS into small, maintainable modules.
- Split styles by page, component or logical feature.
- Avoid one massive global CSS file.
- Avoid unnecessary CSS imports and import chains.
- Avoid duplicate CSS declarations.
- Remove unused styles.
- Avoid overly complex selectors.
- Prefer CSS variables for shared design tokens.
- Use Tailwind CSS efficiently.
- Ensure production CSS is purged/tree-shaken correctly.
- Avoid excessive CSS animations.
- Prefer transform and opacity for animations.
- Avoid expensive layout-triggering animations.
- Avoid unnecessary backdrop filters and heavy blur effects.
- Minimize render-blocking stylesheets.
- Keep critical above-the-fold styles available early.

Do not create hundreds of tiny chunks unnecessarily. Split assets according to actual page boundaries, dependencies and loading behavior.

## 3.4 Image Optimization

- Use modern formats such as AVIF and WebP.
- Use responsive image sizes.
- Provide explicit width and height.
- Use aspect-ratio to prevent layout shifts.
- Lazy-load below-the-fold images.
- Do not lazy-load the primary LCP image.
- Prioritize the actual LCP resource when appropriate.
- Use appropriate image compression.
- Avoid loading unnecessarily large images.
- Use CDN delivery.
- Use placeholders where useful.

## 3.5 Video Optimization

Video is the core product, so video performance is especially important.

- Never load original video files unnecessarily.
- Use video metadata before requesting full playback.
- Use thumbnail previews.
- Avoid autoplaying large videos.
- Use lazy loading for video previews.
- Use appropriate poster images.
- Generate optimized preview assets.
- Use signed URLs for private assets.
- Avoid downloading entire videos into browser memory.
- Use streaming or range requests where supported.
- Use background workers for rendering.
- Never process large video files synchronously inside API requests.
- Keep video processing separate from the frontend.
- Clean up temporary rendering files.

## 3.6 Network Optimization

- Minimize unnecessary API requests.
- Avoid sequential requests when independent requests can run concurrently.
- Cache reusable responses.
- Use pagination for large datasets.
- Use appropriate cache headers.
- Compress responses where beneficial.
- Avoid oversized API responses.
- Use CDN caching for static assets.
- Reduce critical request chains.
- Use preconnect and preload only when justified.

---

# 4. CORE WEB VITALS MONITORING

Performance must be measured continuously.

Use:

- Lighthouse
- Chrome DevTools
- PageSpeed Insights
- Web Vitals library
- Lighthouse CI
- Browser performance profiling

Rules:

- Test mobile performance before release.
- Test desktop performance as well.
- Measure LCP element.
- Investigate long main-thread tasks.
- Monitor layout shifts.
- Inspect network waterfalls.
- Identify render-blocking resources.
- Monitor JavaScript bundle sizes.
- Compare performance before and after major changes.

Do not claim that a page is optimized without actual measurements.

If a performance regression occurs:

1. Identify the responsible resource or component.
2. Determine the root cause.
3. Fix the underlying issue.
4. Run the same test conditions again.
5. Document the results.

---

# 5. ACCESSIBILITY RULES

Target WCAG 2.2 Level AA.

Mandatory requirements:

- Use semantic HTML.
- Use correct heading hierarchy.
- Use accessible navigation.
- Support keyboard navigation.
- Provide visible focus states.
- Use proper labels for form controls.
- Provide descriptive button labels.
- Add meaningful alt text to informative images.
- Use empty alt attributes for decorative images.
- Maintain sufficient color contrast.
- Do not communicate status through color alone.
- Ensure modals manage keyboard focus correctly.
- Support Escape key behavior where appropriate.
- Provide accessible error messages.
- Use ARIA only when native HTML semantics are insufficient.
- Avoid unnecessary ARIA attributes.
- Respect reduced-motion preferences.
- Ensure interactive controls have appropriate touch targets.
- Ensure video controls are keyboard accessible.
- Provide captions for video content where applicable.

Accessibility must be considered during implementation, not added afterward.

---

# 6. BEST PRACTICES

Follow modern frontend and backend engineering standards.

- Use secure HTTPS connections in production.
- Use appropriate security headers.
- Avoid deprecated APIs.
- Avoid console errors and warnings.
- Handle network failures.
- Validate all external input.
- Avoid exposing secrets.
- Keep dependencies updated responsibly.
- Avoid unnecessary redirects.
- Use proper form semantics.
- Set image dimensions.
- Ensure responsive layouts.
- Use meaningful error messages.
- Avoid broken links and buttons.
- Ensure all interactive controls actually work.
- Use correct HTTP status codes.
- Implement proper API validation.
- Never expose internal stack traces to users.
- Maintain consistent code formatting.

Run automated checks before merging changes.

---

# 7. SEO RULES

SEO must be implemented from the beginning.

## Technical SEO

- Use server-side rendering or static generation where appropriate.
- Use meaningful page titles.
- Add unique meta descriptions.
- Use canonical URLs.
- Configure robots.txt.
- Generate XML sitemaps.
- Use semantic HTML.
- Use descriptive URL structures.
- Implement Open Graph metadata.
- Implement Twitter/X card metadata.
- Add structured data where appropriate.
- Prevent indexing of private dashboard pages.
- Avoid duplicate content.
- Ensure important public content is crawlable.
- Avoid broken internal links.
- Optimize image alt attributes.
- Use appropriate redirects.
- Configure proper 404 pages.

## Next.js SEO

- Use Metadata API.
- Use route-specific metadata.
- Use dynamic metadata for public project pages where appropriate.
- Avoid duplicate metadata.
- Generate sitemap and robots routes.
- Use canonical metadata for public pages.

SEO must never expose private user projects, video URLs, transcripts or generated content without explicit authorization.

---

# 8. AGENTIC AI DEVELOPMENT RULES

The platform uses AI agents and automated processing. Their behavior must be controlled.

## Agent Architecture

- Keep AI reasoning separate from deterministic video-processing logic.
- Use structured JSON outputs.
- Validate AI responses with Zod or Pydantic.
- Never trust AI-generated timestamps without validation.
- Never trust AI-generated URLs or file paths.
- Validate all tool arguments.
- Use explicit tool permissions.
- Apply least-privilege access.
- Use bounded retries.
- Set execution timeouts.
- Set token and processing budgets.
- Maintain job status and execution logs.
- Support job cancellation.
- Avoid duplicate job execution.
- Make critical processing steps idempotent.

## AI Safety

- Treat transcripts, subtitles and video content as untrusted input.
- Protect against prompt injection embedded in videos or transcripts.
- Never let video content override system instructions.
- Never allow AI to execute arbitrary shell commands.
- Never allow AI to access arbitrary filesystem paths.
- Never expose API keys or internal prompts.
- Require authorization before accessing user files.
- Restrict AI-generated actions to approved tools.
- Require explicit user approval for consequential external actions.

## AI Quality

- Validate clip start and end timestamps.
- Ensure start time is before end time.
- Ensure timestamps are within video duration.
- Reject malformed AI responses.
- Avoid duplicate clips.
- Verify generated files exist.
- Keep AI scoring explainable.
- Never guarantee viral performance.
- Preserve the original meaning and context of selected clips.

---

# 9. RESPONSIVE DESIGN RULES

Every page must work on:

- Small mobile devices
- Large mobile devices
- Tablets
- Laptops
- Desktop monitors

Rules:

- Follow mobile-first design.
- Avoid horizontal overflow.
- Avoid fixed-width layouts that break on mobile.
- Use flexible layouts.
- Use responsive typography.
- Ensure video editor controls work on smaller screens.
- Make navigation responsive.
- Ensure dialogs fit small screens.
- Avoid overlapping content.
- Test real viewport sizes.
- Check touch interactions.
- Do not hide important functionality on mobile without a reason.

Never assume that a desktop layout will automatically work on mobile.

---

# 10. TESTING RULES

Every important feature must have tests.

Required testing categories:

- Unit testing
- Integration testing
- API testing
- Component testing
- End-to-end testing
- Accessibility testing
- Performance testing
- Security testing

Recommended tools:

- Vitest
- React Testing Library
- Playwright
- Supertest
- Pytest
- Lighthouse CI

Rules:

- Test critical business logic.
- Test authentication and authorization.
- Test invalid input.
- Test API failures.
- Test background job retries.
- Test video processing failures.
- Test upload restrictions.
- Test user data isolation.
- Test responsive behavior.
- Test keyboard navigation.
- Test loading and error states.

Do not mark a feature complete simply because it works once locally.

---

# 11. SECURITY RULES

- Hash passwords securely.
- Never store plaintext passwords.
- Validate and sanitize input.
- Prevent SQL injection.
- Prevent XSS.
- Apply CSRF protections where applicable.
- Implement rate limiting.
- Restrict file uploads.
- Validate file signatures, not just extensions.
- Protect against SSRF in URL ingestion.
- Restrict allowed source hosts.
- Use signed storage URLs.
- Apply authorization at the resource level.
- Protect user data isolation.
- Secure environment variables.
- Never commit .env files.
- Avoid exposing internal service endpoints.
- Implement safe error handling.
- Scan uploaded files where appropriate.
- Apply storage lifecycle and deletion policies.

Security must never be sacrificed to simplify implementation.

---

# 12. ARCHITECTURE AND CODE ORGANIZATION

- Follow the approved project architecture.
- Maintain clear service boundaries.
- Keep frontend, API, AI and rendering responsibilities separate.
- Reuse shared types and validation schemas.
- Avoid circular dependencies.
- Avoid unnecessary microservices.
- Keep configuration centralized.
- Keep secrets outside source code.
- Use environment-specific configurations.
- Keep database migrations version-controlled.
- Use background queues for long-running tasks.
- Keep video files in object storage, not PostgreSQL.
- Keep API requests lightweight.
- Use proper logging and monitoring.

Never introduce an architectural change without documenting its reason and impact.

---

# 13. UI COMPONENT RULES

- Use Impeccable for UI design decisions.
- Reuse existing components.
- Maintain consistent design tokens.
- Use reusable form components.
- Create reusable loading and error states.
- Use consistent spacing.
- Avoid unnecessary wrapper components.
- Avoid deeply nested component trees.
- Keep component responsibilities clear.
- Ensure components are accessible.
- Optimize expensive components only when justified.
- Lazy-load heavy components.
- Do not duplicate page-level UI logic.

---

# 14. GIT AND CHANGE MANAGEMENT

- Use meaningful commit messages.
- Keep changes focused.
- Avoid unrelated modifications.
- Do not delete existing functionality without authorization.
- Review the current implementation before editing.
- Never overwrite working files blindly.
- Review the diff before completion.
- Run relevant tests after changes.
- Document breaking changes.
- Update documentation when architecture or APIs change.

---

# 15. MANDATORY DEVELOPMENT WORKFLOW

Follow this workflow for every development task.

STEP 1 — UNDERSTAND

- Read the relevant documentation.
- Inspect the existing codebase.
- Understand the existing architecture.
- Identify affected components and services.

STEP 2 — PLAN

- Identify the smallest correct solution.
- Check whether existing code can be reused.
- Identify security and performance risks.
- Identify accessibility requirements.
- Define acceptance criteria.

STEP 3 — DESIGN

- For UI tasks, use Impeccable.
- Follow DESIGN.md.
- Consider responsive layouts.
- Consider loading, empty, success and error states.

STEP 4 — IMPLEMENT

- Follow Ponytail principles.
- Write minimal, clean and reusable code.
- Split heavy assets into logical chunks.
- Avoid unnecessary dependencies.
- Preserve existing functionality.

STEP 5 — TEST

- Run relevant unit and integration tests.
- Check responsive behavior.
- Check accessibility.
- Check browser console.
- Check API and network behavior.

STEP 6 — OPTIMIZE

- Check JavaScript bundle impact.
- Check CSS impact.
- Check image and video loading.
- Check layout stability.
- Check Core Web Vitals where applicable.

STEP 7 — REVIEW

- Review the final diff.
- Run available code quality checks.
- Run Impeccable audit for relevant UI changes.
- Run Ponytail review where supported.
- Fix critical and high-priority issues.

STEP 8 — REPORT
Provide:

- What was implemented.
- Files changed.
- Tests performed.
- Performance impact.
- Accessibility considerations.
- Known limitations.
- Any skipped checks and their reasons.

---

# 16. DEFINITION OF DONE

A feature is not complete until:

[ ] Requirements are satisfied.
[ ] Existing functionality is preserved.
[ ] Code follows project architecture.
[ ] No unnecessary duplicate code exists.
[ ] Input validation is implemented.
[ ] Error handling is implemented.
[ ] Relevant tests pass.
[ ] No new console errors are introduced.
[ ] Mobile responsiveness is checked.
[ ] Accessibility is checked.
[ ] Performance impact is evaluated.
[ ] SEO is addressed where applicable.
[ ] Security is reviewed.
[ ] Documentation is updated where necessary.

For major public pages, run Lighthouse and record the results.

For non-UI backend-only tasks, UI-specific checks are not applicable, but security, correctness and performance checks remain mandatory.

---

# 17. FINAL NON-NEGOTIABLE RULE

Performance, accessibility, security, maintainability and user experience are not optional features.

Never sacrifice these qualities for faster implementation.

Do not optimize blindly. Measure, identify the bottleneck, implement the smallest effective fix and measure again.

Prefer simple solutions that work reliably over complicated solutions that are difficult to maintain.

Always build ClipForge AI as a production-quality SaaS, not a temporary demo.

These rules apply to every future development task in this repository.
