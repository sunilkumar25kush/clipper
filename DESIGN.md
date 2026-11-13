# Design System: ClipForge AI

<!-- impeccable:design-schema 1 -->

| Metadata | Details |
| :--- | :--- |
| **Product** | ClipForge AI |
| **Aesthetic Direction** | Clean, minimal light-mode SaaS (Notion / Vercel grade) |
| **Surface Mode** | Operate (Scanability, consistency, restraint, ergonomic timeline density) |
| **Component Package** | `@clipforge/ui` (`packages/ui`) |

---

## 1. Visual Direction & Design Philosophy

ClipForge AI is an AI video repurposing platform designed for creators and agency editors who spend hours curating and fine-tuning short-form video clips.

### Principles:
1. **Precision & Restraint**: Avoid decorative AI gradients, glowing neon borders, and heavy backdrop blurs. Tools should recede so the creator's video and waveform take center stage.
2. **Hairline Delimitation**: Panels, timeline blocks, and cards are separated by crisp 1px borders (`border-zinc-200`) rather than diffused elevation shadows.
3. **Typography Scale for Data Density**: Clear visual hierarchy with compact tabular numerals for video timestamps (`00:14.28`) and high-legibility sans-serif copy.
4. **Accessible Feedback**: High-contrast focus rings (`focus-visible:ring-1 focus-visible:ring-zinc-950`), explicit states (hover, active, disabled, empty, error), and zero color-only status indicators.

---

## 2. Design Tokens

### 2.1 Color Palette (CSS Variables)

Defined via HSL variables in `apps/web/src/app/globals.css` and extended in `tailwind.config.mjs`:

```css
:root {
  /* Surfaces */
  --background: 0 0% 100%;             /* Pure White #FFFFFF */
  --foreground: 240 10% 3.9%;          /* Near Black #09090B */
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;

  /* Action & Brand */
  --primary: 240 5.9% 10%;             /* Deep Charcoal Zinc-900 #18181B */
  --primary-foreground: 0 0% 98%;      /* Off-White #FAFAFA */
  --secondary: 240 4.8% 95.9%;         /* Soft Neutral Zinc-100 #F4F4F5 */
  --secondary-foreground: 240 5.9% 10%;

  /* Muted & Accents */
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;  /* Subtle Text Zinc-500 #71717A */
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;

  /* Status Tokens */
  --destructive: 0 84.2% 60.2%;        /* Signal Red #EF4444 */
  --destructive-foreground: 0 0% 98%;
  --success: 142 71% 45%;              /* Emerald #10B981 */
  --warning: 38 92% 50%;               /* Amber #F59E0B */

  /* Hairlines & Elevation */
  --border: 240 5.9% 90%;              /* Light Border Zinc-200 #E4E4E7 */
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --radius: 0.5rem;                    /* 8px Base Border Radius */
}
```

### 2.2 Typography Scale

- **Display / Hero**: `text-4xl` (`36px`) to `text-6xl` (`60px`), `tracking-tight`, `font-bold`
- **Section Heading (H2)**: `text-2xl` (`24px`), `font-semibold`, `tracking-tight`
- **Card / Group Title (H3)**: `text-base` (`16px`) to `text-lg` (`18px`), `font-semibold`
- **Body Text**: `text-sm` (`14px`), `font-normal`, `leading-relaxed`, `text-zinc-700`
- **Microcopy / Badges / Timestamps**: `text-xs` (`12px`), `font-medium`, `text-zinc-500`

### 2.3 Spacing System
Consistent 4px/8px modular grid:
- `p-1` (4px), `p-2` (8px), `p-3` (12px), `p-4` (16px), `p-6` (24px), `p-8` (32px).

### 2.4 Border Radius Tokens
- **`rounded-sm`** (`4px`): Badges, dropdown action rows, tooltips.
- **`rounded-md`** (`6px`): Inputs, select dropdowns, trigger tabs, standard buttons.
- **`rounded-xl`** (`12px`): Cards, dialog modals, empty/error state containers.
- **`rounded-full`**: Avatars, pill tags, progress indicators.

### 2.5 Shadow Tokens
Subtle, natural elevation without muddy spread:
- `shadow-sm`: `0 1px 2px 0 rgb(0 0 0 / 0.05)` (Buttons, card surfaces).
- `shadow-md`: `0 4px 6px -1px rgb(0 0 0 / 0.1)` (Dropdowns, tooltips).
- `shadow-lg`: `0 10px 15px -3px rgb(0 0 0 / 0.1)` (Dialog modals, floating toast notifications).

### 2.6 Responsive Breakpoints
- **Mobile (`< 640px`)**: Single column layout, full-width drawers, compact button heights (`h-8`).
- **Tablet (`640px – 1023px`)**: 2-column card grid, collapsible filter sidebar.
- **Desktop (`>= 1024px`)**: Full 3-column video editor workspace (source preview, waveform/transcript, clip inspector).

---

## 3. Reusable Components in `@clipforge/ui`

All components are authored in `packages/ui/src/components/` and export typed React 19 primitives:

1. **`Button`**: Variants (`default`, `secondary`, `outline`, `destructive`, `ghost`, `link`), sizes (`sm`, `default`, `lg`, `icon`), focus ring, disabled states.
2. **`Input`**: Standardized text, number, email, and password controls with `placeholder:text-zinc-400`.
3. **`Textarea`**: Multi-line transcript and clip description editor with custom min-height and scroll ergonomics.
4. **`Select`**: Native styled select with custom SVG chevron and consistent focus boundaries.
5. **`Checkbox`**: Accessible checkbox with `focus:ring-1 focus:ring-zinc-950`.
6. **`Radio`**: Radio selection for aspect ratios (`9:16`, `16:9`, `1:1`) and crop modes.
7. **`Badge`**: Status and category pills (`default`, `secondary`, `destructive`, `outline`, `success`, `warning`).
8. **`Card`**: Compound component (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
9. **`Progress`**: Accessible progress bar with `role="progressbar"`, smooth transform animation, and `aria-valuenow`.
10. **`Skeleton`**: Pulsing placeholder for asynchronous clip card and waveform loading.
11. **`Avatar`**: User avatar with automatic 2-letter fallback and error fallback.
12. **`Dialog` (Modal)**: Accessible modal with backdrop blur, `Escape` key capture, body scroll locking, and zoom animation.
13. **`Tooltip`**: Microcopy popover on hover/focus with `role="tooltip"`.
14. **`Tabs`**: Compound tabs (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) for category filtering and view toggling.
15. **`Dropdown`**: Trigger-based context menu with keyboard/click-outside dismissal.
16. **`Toast` (`ToastProvider`, `useToast`)**: Non-blocking stacked notification system with automatic 4-second dismiss.
17. **`EmptyState`**: Dotted boundary placeholder with icon, title, description, and primary CTA.
18. **`ErrorState`**: Non-fatal recoverable error display with retry action.
19. **`LoadingState`**: Centered spinner with explanatory status label.

---

## 4. Accessibility & Motion Guidelines

- **WCAG 2.1 AA Compliance**: All text combinations (`text-zinc-900` on white, `text-zinc-500` on white, and signal states) exceed 4.5:1 contrast ratios.
- **Focus Rings**: `focus-visible:ring-1 focus-visible:ring-zinc-950` provides high-visibility indicators for keyboard navigators.
- **Reduced Motion Support**: Animations are restricted to `150ms–300ms` opacity fades and subtle transform scales (`zoom-in-95`). Layouts never use layout-thrashing bounce or parallax motion.

