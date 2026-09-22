import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {authenticate, unauthenticated} from "../shopify.server";
import {withCheckoutExtensionCors} from "../lib/checkout-cors.server";
import {uploadCheckoutDocument} from "../lib/shopify-file-upload.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  try {
    const {cors} = await authenticate.public.checkout(request);
    return cors(new Response(null, {status: 204}));
  } catch (error) {
    if (error instanceof Response) {
      return withCheckoutExtensionCors(request, error);
    }
    throw error;
  }
};

export const action = async ({request}: ActionFunctionArgs) => {
  let cors: (response: Response) => Response;
  let sessionToken: {dest: string};

  try {
    const auth = await authenticate.public.checkout(request);
    cors = auth.cors;
    sessionToken = auth.sessionToken;
  } catch (error) {
    if (error instanceof Response) {
      return withCheckoutExtensionCors(request, error);
    }
    throw error;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const companyId = formData.get("companyId");
    const companyName = formData.get("companyName");

    const hasCompanyId = typeof companyId === "string" && companyId.length > 0;
    const hasCompanyName =
      typeof companyName === "string" && companyName.trim().length > 0;

    if (!hasCompanyId && !hasCompanyName) {
      return cors(
        Response.json(
          {error: "Document upload is only available for business checkouts."},
          {status: 403},
        ),
      );
    }

    if (!(file instanceof File)) {
      return cors(
        Response.json({error: "A file is required."}, {status: 400}),
      );
    }

    const shop = normalizeShopDomain(sessionToken.dest as string);
    const {admin} = await unauthenticated.admin(shop);
    const fileId = await uploadCheckoutDocument(admin, file);

    return cors(Response.json({fileId}));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed.";

    if (message.includes("Could not find a session for shop")) {
      return cors(
        Response.json(
          {
            error:
              "App is not authenticated for this store. Open the app in Shopify admin (Dev Console) once while shopify app dev is running, then retry upload.",
          },
          {status: 503},
        ),
      );
    }

    return cors(Response.json({error: message}, {status: 400}));
  }
};

function normalizeShopDomain(dest: string) {
  return dest.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
