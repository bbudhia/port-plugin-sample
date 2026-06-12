import { useEffect, useRef, useState } from "react";

/**
 * Dev-only stand-in for the Port web app parent window.
 *
 * In production, Port embeds the plugin in an iframe and sends postMessage events.
 * Locally (npm run dev), there is no parent — this component posts the same payloads
 * the host would send so usePortPluginData() receives entity, token, and baseUrl.
 *
 * Protocol (must match @port-labs/plugins-sdk):
 *   Host → plugin: PLUGIN_DATA, PORT_TOKEN
 *   Plugin → host: REQUEST_PORT_TOKEN (handled below when embedded in our dev iframe harness)
 *
 * Configure via .env (see .env.example). Never commit real tokens.
 */

const DEV_ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:9000";

const DEV_TOKEN = process.env.PORT_DEV_TOKEN ?? "";
const DEV_CLIENT_ID = process.env.PORT_CLIENT_ID ?? "";
const DEV_CLIENT_SECRET = process.env.PORT_CLIENT_SECRET ?? "";

/** Same-origin dev proxy by default so localhost and LAN IP both work. */
function devApiBaseUrl(): string {
  const fromEnv = process.env.PORT_DEV_API_BASE_URL?.replace(/\/$/, "") ?? "";
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:9000";
}

const DEV_API_BASE_URL = devApiBaseUrl();
const DEV_BLUEPRINT_ID = process.env.PORT_DEV_BLUEPRINT_ID ?? "";
const DEV_ENTITY_IDENTIFIER = process.env.PORT_DEV_ENTITY_IDENTIFIER ?? "";

export type PortEntity = {
  identifier: string;
  title?: string;
  blueprint: string;
  icon?: string;
  properties?: Record<string, unknown>;
  relations?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
};

type GetEntitiesResponse = {
  ok: boolean;
  entities: PortEntity[];
};

class PortApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(`${message}: ${status}${responseBody ? ` - ${responseBody}` : ""}`);
    this.name = "PortApiError";
  }
}

/** POST /v1/auth/access_token */
export async function getAccessToken({
  clientId,
  clientSecret,
  portApiBaseUrl,
}: {
  clientId: string;
  clientSecret: string;
  portApiBaseUrl: string;
}): Promise<string> {
  const base = portApiBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/v1/auth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!response.ok) {
    throw new PortApiError(
      "getAccessToken failed",
      response.status,
      await response.text(),
    );
  }

  const data = (await response.json()) as { accessToken: string };
  return data.accessToken;
}

export async function getEntities({
  token,
  portApiBaseUrl,
  blueprintIdentifier,
}: {
  token: string;
  portApiBaseUrl: string;
  blueprintIdentifier: string;
}): Promise<PortEntity[]> {
  const base = portApiBaseUrl.replace(/\/$/, "");
  const response = await fetch(
    `${base}/v1/blueprints/${encodeURIComponent(blueprintIdentifier)}/entities`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new PortApiError(
      "getEntities failed",
      response.status,
      await response.text(),
    );
  }

  const data = (await response.json()) as GetEntitiesResponse;
  return data.entities;
}

function postToPlugin(payload: object) {
  window.postMessage(payload, DEV_ORIGIN);
}

function postPluginData(entity: PortEntity) {
  postToPlugin({
    type: "PLUGIN_DATA",
    params: {},
    page: {},
    user: {
      firstName: "Dev",
      lastName: "User",
      email: "dev@localhost",
    },
    entity,
    baseUrl: DEV_API_BASE_URL,
    theme: {
      mode: "light",
      css: `
:root {
--background-primary: #ffffff;
--background-dim: #f8fafc;
--background-dim-transparent: rgba(0, 0, 0, 0.04);
--text-high: #1a1a2e;
--text-medium: #64748b;
--border-medium: #e2e8f0;
--primary: 245, 247, 250;
}
`.trim(),
    },
  });
}

/** True when opened directly on localhost, not inside Port’s iframe. */
function isStandaloneDev() {
  return typeof window !== "undefined" && window.parent === window;
}

export function SimulatePort() {
  const [status, setStatus] = useState<"idle" | "sent" | "no-token">("idle");
  const [entities, setEntities] = useState<PortEntity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<PortEntity | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const resolvedTokenRef = useRef<string>("");
  const comboboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isStandaloneDev()) return;

    const resolveAndPostToken = async () => {
      let token = DEV_TOKEN;

      if (DEV_CLIENT_ID && DEV_CLIENT_SECRET) {
        try {
          token = await getAccessToken({
            clientId: DEV_CLIENT_ID,
            clientSecret: DEV_CLIENT_SECRET,
            portApiBaseUrl: DEV_API_BASE_URL,
          });
        } catch (err) {
          console.error(
            "getAccessToken failed, falling back to PORT_DEV_TOKEN:",
            err,
          );
        }
      }

      resolvedTokenRef.current = token;

      if (token) {
        postToPlugin({ type: "PORT_TOKEN", token });
        setStatus("sent");
      } else {
        setStatus("no-token");
      }
    };

    const fetchBlueprint = async () => {
      try {
        const fetched = await getEntities({
          token: resolvedTokenRef.current,
          portApiBaseUrl: DEV_API_BASE_URL,
          blueprintIdentifier: DEV_BLUEPRINT_ID,
        });
        setEntities(fetched);
        const initial =
          fetched.find((e) => e.identifier === DEV_ENTITY_IDENTIFIER) ??
          fetched[0] ??
          null;
        if (initial) {
          setSelectedEntity(initial);
          postPluginData(initial);
        }
      } catch (error) {
        console.error("fetchBlueprint failed", error);
      }
    };

    const doFetchBlueprint = async () => {
      await resolveAndPostToken();
      await fetchBlueprint();
    };

    doFetchBlueprint();

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== DEV_ORIGIN) return;
      if (
        event.data?.type === "REQUEST_PORT_TOKEN" &&
        resolvedTokenRef.current
      ) {
        postToPlugin({ type: "PORT_TOKEN", token: resolvedTokenRef.current });
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!isStandaloneDev()) return null;

  const selectEntity = (entity: PortEntity) => {
    setSelectedEntity(entity);
    setSearchQuery("");
    setIsOpen(false);
    postPluginData(entity);
  };

  const filteredEntities = entities.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      (e.title ?? e.identifier).toLowerCase().includes(q) ||
      e.identifier.toLowerCase().includes(q)
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredEntities.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const entity = filteredEntities[highlightedIndex];
      if (entity) selectEntity(entity);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  const displayLabel = selectedEntity
    ? (selectedEntity.title ?? selectedEntity.identifier)
    : "";

  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        width: "100%",
        height: "50px",
        padding: "8px 12px",
        fontSize: 12,
        fontFamily: "monospace",
        background: "#1e293b",
        color: "#e2e8f0",
        borderBottom: "1px solid #334155",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <strong>SimulatePort</strong>
      {DEV_BLUEPRINT_ID} -
      {entities.length > 0 ? (
        <div
          ref={comboboxRef}
          style={{ position: "relative" }}
          onBlur={(e) => {
            if (!comboboxRef.current?.contains(e.relatedTarget as Node)) {
              setIsOpen(false);
              setSearchQuery("");
            }
          }}
        >
          <input
            type="text"
            value={isOpen ? searchQuery : displayLabel}
            placeholder={isOpen ? "search…" : displayLabel}
            onFocus={() => {
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              background: "#0f172a",
              color: "#e2e8f0",
              border: "1px solid #475569",
              borderRadius: 4,
              padding: "2px 24px 2px 6px",
              width: 200,
              outline: "none",
            }}
          />
          <span
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "#64748b",
              fontSize: 10,
            }}
          >
            ▾
          </span>
          {isOpen && (
            <ul
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 999,
                margin: "2px 0 0",
                padding: 0,
                listStyle: "none",
                background: "#0f172a",
                border: "1px solid #475569",
                borderRadius: 4,
                maxHeight: 220,
                overflowY: "auto",
                minWidth: 240,
                boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              }}
            >
              {filteredEntities.length === 0 ? (
                <li
                  style={{
                    padding: "4px 8px",
                    color: "#64748b",
                    fontStyle: "italic",
                  }}
                >
                  no results
                </li>
              ) : (
                filteredEntities.map((entity, i) => (
                  <li
                    key={entity.identifier}
                    onMouseDown={() => selectEntity(entity)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    style={{
                      padding: "4px 8px",
                      cursor: "pointer",
                      background:
                        i === highlightedIndex ? "#1e40af" : "transparent",
                      color:
                        entity.identifier === selectedEntity?.identifier
                          ? "#93c5fd"
                          : "#e2e8f0",
                    }}
                  >
                    {entity.title ?? entity.identifier}
                    {entity.title && entity.title !== entity.identifier && (
                      <span style={{ color: "#64748b", marginLeft: 6 }}>
                        {entity.identifier}
                      </span>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      ) : (
        <span style={{ color: "#94a3b8" }}>loading entities…</span>
      )}
      <span style={{ color: "#94a3b8" }}>api: {DEV_API_BASE_URL}</span>
      {status === "sent" && (
        <span style={{ color: "#86efac" }}>PORT_TOKEN sent</span>
      )}
      {status === "no-token" && (
        <span>
          set <code>PORT_DEV_TOKEN</code> in <code>.env</code> for API calls
        </span>
      )}
    </div>
  );
}
