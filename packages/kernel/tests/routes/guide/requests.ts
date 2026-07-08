import type { GuideApp } from "./harness.js";

export interface GuideResponse {
  body: string;
  headers: Record<string, unknown>;
  statusCode: number;
}

interface GuideRequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export function getGuide(
  app: GuideApp,
  options: GuideRequestOptions = {},
): Promise<GuideResponse> {
  return injectGuideRoute(app, "/guide", options);
}

export function getGuideRestVariant(
  app: GuideApp,
  options: GuideRequestOptions = {},
): Promise<GuideResponse> {
  return injectGuideRoute(app, "/guide-rest-variant", options);
}

function injectGuideRoute(
  app: GuideApp,
  route: string,
  options: GuideRequestOptions,
): Promise<GuideResponse> {
  return app.inject({
    method: "GET",
    url: guideUrl(route, options.query),
    headers: options.headers,
  });
}

function guideUrl(route: string, query?: Record<string, string>): string {
  if (!query) {
    return route;
  }

  return `${route}?${new URLSearchParams(query).toString()}`;
}
