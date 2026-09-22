/** CORS for checkout extension origins when authenticate throws before returning `cors`. */
export function withCheckoutExtensionCors(
  request: Request,
  response: Response,
) {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set(
    "Access-Control-Expose-Headers",
    "X-Shopify-API-Request-Failure-Reauthorize-Url",
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
