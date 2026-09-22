type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{name: string; value: string}>;
};

type AdminGraphql = {
  graphql: (
    query: string,
    options?: {variables?: Record<string, unknown>},
  ) => Promise<Response>;
};

const STAGED_UPLOADS_CREATE = `#graphql
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE = `#graphql
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function validateCheckoutUpload(file: File) {
  if (file.size > MAX_BYTES) {
    throw new Error("File must be 10 MB or smaller.");
  }

  const mimeType = file.type || inferMimeType(file.name);

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Only PDF and image files are allowed.");
  }

  return mimeType;
}

export async function uploadCheckoutDocument(
  admin: AdminGraphql,
  file: File,
) {
  const mimeType = validateCheckoutUpload(file);

  const stagedResponse = await admin.graphql(STAGED_UPLOADS_CREATE, {
    variables: {
      input: [
        {
          filename: file.name,
          mimeType,
          httpMethod: "POST",
          resource: "FILE",
          fileSize: String(file.size),
        },
      ],
    },
  });

  const stagedJson = await stagedResponse.json();
  const stagedPayload = stagedJson.data?.stagedUploadsCreate;
  const stagedErrors = stagedPayload?.userErrors ?? [];

  if (stagedErrors.length > 0) {
    throw new Error(stagedErrors[0]?.message ?? "Could not stage upload.");
  }

  const stagedTarget = stagedPayload?.stagedTargets?.[0] as
    | StagedTarget
    | undefined;

  if (!stagedTarget) {
    throw new Error("Could not stage upload.");
  }

  const uploadForm = new FormData();

  for (const parameter of stagedTarget.parameters) {
    uploadForm.append(parameter.name, parameter.value);
  }

  uploadForm.append("file", file, file.name);

  const uploadResponse = await fetch(stagedTarget.url, {
    method: "POST",
    body: uploadForm,
  });

  if (!uploadResponse.ok) {
    throw new Error("Could not upload file to Shopify.");
  }

  const fileCreateResponse = await admin.graphql(FILE_CREATE, {
    variables: {
      files: [
        {
          originalSource: stagedTarget.resourceUrl,
          contentType: "FILE",
          filename: file.name,
        },
      ],
    },
  });

  const fileCreateJson = await fileCreateResponse.json();
  const fileCreatePayload = fileCreateJson.data?.fileCreate;
  const fileCreateErrors = fileCreatePayload?.userErrors ?? [];

  if (fileCreateErrors.length > 0) {
    throw new Error(fileCreateErrors[0]?.message ?? "Could not create file.");
  }

  const fileId = fileCreatePayload?.files?.[0]?.id;

  if (!fileId) {
    throw new Error("Could not create file.");
  }

  return fileId as string;
}

function inferMimeType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "application/octet-stream";
  }
}
