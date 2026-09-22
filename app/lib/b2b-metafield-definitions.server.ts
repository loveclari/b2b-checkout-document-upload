type AdminGraphql = {
  graphql: (
    query: string,
    options?: {variables?: Record<string, unknown>},
  ) => Promise<Response>;
};

const METAFIELD_KEY = "b2b_document";

const CREATE_DEFINITION = `#graphql
  mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const FIND_DEFINITION = `#graphql
  query metafieldDefinition($ownerType: MetafieldOwnerType!, $namespace: String!, $key: String!) {
    metafieldDefinitions(first: 1, ownerType: $ownerType, namespace: $namespace, key: $key) {
      nodes {
        id
      }
    }
  }
`;

export async function ensureB2bDocumentMetafields(admin: AdminGraphql) {
  await ensureDefinition(admin, "CART");
  await ensureDefinition(admin, "ORDER", {cartToOrderCopyable: true});
}

async function ensureDefinition(
  admin: AdminGraphql,
  ownerType: "CART" | "ORDER",
  options?: {cartToOrderCopyable?: boolean},
) {
  const existing = await admin.graphql(FIND_DEFINITION, {
    variables: {
      ownerType,
      namespace: "$app",
      key: METAFIELD_KEY,
    },
  });
  const existingJson = await existing.json();
  const nodes = existingJson.data?.metafieldDefinitions?.nodes ?? [];

  if (nodes.length > 0) {
    return;
  }

  const response = await admin.graphql(CREATE_DEFINITION, {
    variables: {
      definition: {
        namespace: "$app",
        key: METAFIELD_KEY,
        name: "B2B checkout document",
        description:
          ownerType === "CART"
            ? "Purchase order or supporting document uploaded during B2B checkout."
            : "Purchase order or supporting document from B2B checkout.",
        type: "file_reference",
        ownerType,
        access: {
          admin: "MERCHANT_READ_WRITE",
        },
        ...(options?.cartToOrderCopyable
          ? {capabilities: {cartToOrderCopyable: true}}
          : {}),
      },
    },
  });

  const json = await response.json();
  const userErrors = json.data?.metafieldDefinitionCreate?.userErrors ?? [];
  const alreadyExists = userErrors.some(
    (error: {code?: string; message?: string}) =>
      error.code === "TAKEN" ||
      error.message?.toLowerCase().includes("taken"),
  );

  if (userErrors.length > 0 && !alreadyExists) {
    throw new Error(
      userErrors[0]?.message ??
        `Could not create ${ownerType} metafield definition.`,
    );
  }
}
