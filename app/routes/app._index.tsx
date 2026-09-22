import type {HeadersFunction, LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {boundary} from "@shopify/shopify-app-react-router/server";
import {ensureB2bDocumentMetafields} from "../lib/b2b-metafield-definitions.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {admin, session} = await authenticate.admin(request);
  let metafieldsReady = true;

  try {
    await ensureB2bDocumentMetafields(admin);
  } catch (error) {
    metafieldsReady = false;
    console.error("Failed to ensure B2B metafield definitions:", error);
  }

  return {
    shop: session.shop,
    metafieldsReady,
  };
};

export default function Index() {
  const {shop, metafieldsReady} = useLoaderData<typeof loader>();
  const checkoutEditorUrl = `https://admin.shopify.com/store/${shop.replace(
    ".myshopify.com",
    "",
  )}/settings/checkout/editor`;
  const filesUrl = `https://admin.shopify.com/store/${shop.replace(
    ".myshopify.com",
    "",
  )}/content/files`;

  return (
    <s-page heading="B2B document upload">
      <s-section heading="Ready for any Shopify Plus store">
        <s-paragraph>
          Company buyers can attach a purchase order (PDF or image) during
          checkout. The file is stored in Shopify Files and linked on the cart,
          then copied to the order.
        </s-paragraph>
        <s-paragraph>
          <s-text>
            {metafieldsReady
              ? "Cart and order metafields are set up on this store."
              : "Metafields could not be created automatically. Open the app again or create an order file_reference metafield named b2b_document."}
          </s-text>
        </s-paragraph>
      </s-section>

      <s-section heading="Turn it on in checkout">
        <s-ordered-list>
          <s-list-item>
            Open{" "}
            <s-link href={checkoutEditorUrl} target="_blank">
              Checkout editor
            </s-link>
          </s-list-item>
          <s-list-item>
            Add the <s-text>B2B document upload</s-text> app block (information,
            shipping, or payment).
          </s-list-item>
          <s-list-item>
            Leave <s-text>App API base URL</s-text> blank on a live store. Only
            password-protected development stores need a hosted app URL there.
          </s-list-item>
          <s-list-item>
            Optional: require a document before checkout can continue.
          </s-list-item>
        </s-ordered-list>
      </s-section>

      <s-section heading="What merchants need">
        <s-unordered-list>
          <s-list-item>
            Shopify Plus (checkout UI on the information / shipping / payment
            steps)
          </s-list-item>
          <s-list-item>
            B2B company locations so buyers check out as a business
          </s-list-item>
          <s-list-item>
            Retail checkouts hide the upload block automatically
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="After an upload">
        <s-paragraph>
          Files appear in{" "}
          <s-link href={filesUrl} target="_blank">
            Content → Files
          </s-link>{" "}
          and on the order metafield <s-text>B2B checkout document</s-text>.
        </s-paragraph>
        <s-paragraph>
          Allowed types: PDF, JPEG, PNG, GIF, WebP, HEIC. Max 10 MB.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
