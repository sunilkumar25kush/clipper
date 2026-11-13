import dynamic from "next/dynamic";

export * from "./video-preview-player";
export * from "./timeline-trim-track";
export * from "./subtitle-transcript-editor";
export * from "./aspect-crop-controller";
export * from "./export-settings-panel";

// Lazy-loaded editor modal (split into separate chunk, loaded only on interaction)
export const LazyVideoEditorModal = dynamic(
  () => import("./video-editor-modal").then((mod) => mod.VideoEditorModal),
  { ssr: false },
);

