export function getDidAuth() {
  const raw = process.env.DID_API_KEY?.trim();
  if (!raw) throw new Error("Missing DID_API_KEY");

  // raw = "c3Rh....:secret"  (NU email:secret)
  return "Basic " + Buffer.from(raw, "utf8").toString("base64");
}
