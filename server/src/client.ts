export type ClientId = string & { readonly __brand: "ClientId" }

export function clientId(text: string): ClientId {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: any text names a client; the brand keeps other strings out of the render queue's quota
  return text as ClientId
}

export const SERVICE_CLIENT = clientId("service")

// Traefik replaces any X-Real-Ip a client sends with the address it sees, and the service is only reachable through it.
export function clientOf(realIp: string | readonly string[] | undefined, socketAddress: string | undefined): ClientId {
  const forwarded = typeof realIp === "string" ? realIp : realIp?.[0]
  return clientId(forwarded?.trim() || socketAddress || "unknown")
}
