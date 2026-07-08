export interface CodexCacheModel {
  slug: string;
  display_name?: string;
  description?: string;
  context_window?: number;
  max_context_window?: number;
  default_reasoning_level?: string;
  supported_reasoning_levels?: Array<{
    effort: string;
    description?: string;
  }>;
  visibility?: string;
}

export interface CodexCacheFile {
  models?: CodexCacheModel[];
}
