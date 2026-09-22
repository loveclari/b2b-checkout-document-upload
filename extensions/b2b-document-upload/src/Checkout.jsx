import {useCallback, useState} from "react";
import {
  Banner,
  BlockStack,
  DropZone,
  Heading,
  Text,
  TextField,
  reactExtension,
  useApi,
  useAppMetafields,
  useApplyMetafieldsChange,
  useBuyerJourneyIntercept,
  usePurchasingCompany,
  useSessionToken,
  useSettings,
  useShippingAddress,
  useTranslate,
} from "@shopify/ui-extensions-react/checkout";

const METAFIELD_NAMESPACE = "$app";
const METAFIELD_KEY = "b2b_document";
const APP_PROXY_SUBPATH = "b2b-document-upload";
const ACCEPT = "application/pdf,.pdf,image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif";

export default reactExtension(
  "purchase.checkout.block.render",
  () => <Extension />,
);

function resolveUploadUrl(myshopifyDomain, apiBase) {
  if (apiBase) {
    return `${apiBase}/api/checkout/upload`;
  }

  return `https://${myshopifyDomain}/apps/${APP_PROXY_SUBPATH}`;
}

function Extension() {
  const {shop} = useApi();
  const purchasingCompany = usePurchasingCompany();
  const shippingAddress = useShippingAddress();
  const applyMetafieldChange = useApplyMetafieldsChange();
  const sessionToken = useSessionToken();
  const settings = useSettings();
  const translate = useTranslate();

  const companyId = purchasingCompany?.company?.id;
  const companyName = shippingAddress?.company?.trim() ?? "";
  const isBusinessBuyer = Boolean(companyId) || companyName.length > 0;

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [dropZoneKey, setDropZoneKey] = useState(0);
  const [devTunnelBase, setDevTunnelBase] = useState("");

  const heading = settings?.heading?.trim() || translate("heading");
  const description =
    settings?.description?.trim() || translate("description");
  const required = Boolean(settings?.required) && isBusinessBuyer;
  const settingsBase = settings?.api_base_url?.trim().replace(/\/$/, "") ?? "";
  const apiBaseUrl =
    settingsBase || devTunnelBase.trim().replace(/\/$/, "");
  const usesAppProxy = apiBaseUrl.length === 0;
  const uploadUrl = resolveUploadUrl(shop.myshopifyDomain, apiBaseUrl);

  const cartMetafields = useAppMetafields({
    type: "cart",
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEY,
  });

  const hasDocument = Boolean(cartMetafields[0]?.metafield?.value);

  useBuyerJourneyIntercept(
    useCallback(
      ({canBlockProgress}) => {
        if (!required || !canBlockProgress || !isBusinessBuyer) {
          return {behavior: "allow"};
        }

        if (!hasDocument) {
          return {
            behavior: "block",
            reason: "InvalidExtensionState",
            errors: [{message: translate("requiredError")}],
          };
        }

        return {behavior: "allow"};
      },
      [required, isBusinessBuyer, hasDocument, translate],
    ),
  );

  const handleFileInput = useCallback(
    async (files) => {
      if (!isBusinessBuyer) {
        return;
      }

      const file = files[0];
      if (!file) {
        return;
      }

      setError("");
      setUploading(true);

      try {
        const token = await sessionToken.get();
        const body = new FormData();
        body.append("file", file);
        if (companyId) {
          body.append("companyId", companyId);
        } else if (companyName) {
          body.append("companyName", companyName);
        }

        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body,
        });

        const payload = await response.json();

        if (!response.ok) {
          const serverError = payload?.error || translate("uploadError");
          if (
            typeof serverError === "string" &&
            serverError.includes("not authenticated for this store")
          ) {
            throw new Error(translate("authSetupError"));
          }
          throw new Error(serverError);
        }

        const result = await applyMetafieldChange({
          type: "updateCartMetafield",
          metafield: {
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "file_reference",
            value: payload.fileId,
          },
        });

        if (result.type === "error") {
          throw new Error(result.message || translate("uploadError"));
        }

        setUploadedFileName(file.name);
        setDropZoneKey((current) => current + 1);
      } catch (uploadError) {
        const message =
          uploadError instanceof Error ? uploadError.message : "";
        const isNetworkFailure =
          message === "Failed to fetch" || message.includes("NetworkError");
        setError(
          isNetworkFailure ? translate("networkError") : message || translate("uploadError"),
        );
      } finally {
        setUploading(false);
      }
    },
    [
      applyMetafieldChange,
      companyId,
      companyName,
      isBusinessBuyer,
      sessionToken,
      translate,
      uploadUrl,
    ],
  );

  if (!isBusinessBuyer) {
    return null;
  }

  return (
    <BlockStack spacing="base">
      <Heading>{heading}</Heading>
      <Text>{description}</Text>
      {uploadedFileName || hasDocument ? (
        <Banner status="success" title={translate("uploaded")}>
          {uploadedFileName || translate("uploaded")}
        </Banner>
      ) : null}
      {usesAppProxy ? (
        <BlockStack spacing="tight">
          <Banner status="warning" title={translate("devTunnelHint")} />
          <Text>{translate("devTunnelHelp")}</Text>
          <TextField
            label={translate("devTunnelLabel")}
            value={devTunnelBase}
            onChange={setDevTunnelBase}
          />
        </BlockStack>
      ) : null}
      {error ? (
        <Banner status="critical" title={translate("uploadError")}>
          {error}
        </Banner>
      ) : null}
      <DropZone
        key={dropZoneKey}
        label={translate("dropzoneLabel")}
        accept={ACCEPT}
        disabled={uploading || usesAppProxy}
        required={required}
        error={required && !hasDocument ? translate("requiredError") : error}
        onInput={handleFileInput}
        onDropRejected={() => setError(translate("rejectedFile"))}
      />
      {uploading ? <Text>{translate("uploading")}</Text> : null}
    </BlockStack>
  );
}

